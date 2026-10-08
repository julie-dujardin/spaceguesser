//! The server as a browser sees it: real sockets against a real listener.

use std::time::Duration;

use axum::routing::post;
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use spaceguesser_backend::{Action, Config, Turnstile, app};
use sqlx::PgPool;
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

struct Server {
	url: String,
	task: JoinHandle<()>,
}

async fn serve(database_url: Option<String>, allowed_origins: Vec<String>) -> Server {
	serve_with(Config {
		database_url,
		allowed_origins,
		turnstile: None,
	})
	.await
}

async fn serve_with(config: Config) -> Server {
	let router = app(config).await.unwrap();
	let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
	let url = format!("ws://{}/ws", listener.local_addr().unwrap());
	let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
	Server { url, task }
}

struct Client(WebSocketStream<MaybeTlsStream<TcpStream>>);

impl Client {
	async fn open(server: &Server, hello: Value) -> Self {
		let (socket, _) = connect_async(&server.url).await.unwrap();
		let mut client = Self(socket);
		client.send(hello).await;
		client
	}

	async fn send(&mut self, msg: Value) {
		self.0.send(Message::Text(msg.to_string().into())).await.unwrap();
	}

	/// The status the server closes the socket with, past anything sent first.
	async fn closed(&mut self) -> Option<u16> {
		loop {
			let frame = timeout(Duration::from_secs(5), self.0.next())
				.await
				.expect("server went quiet");
			match frame {
				Some(Ok(Message::Close(frame))) => return frame.map(|frame| frame.code.into()),
				None => return None,
				Some(Err(error)) => panic!("socket ended uncleanly: {error}"),
				Some(Ok(_)) => {}
			}
		}
	}

	/// The next JSON message, or `None` once the server has closed the socket.
	async fn recv(&mut self) -> Option<Value> {
		loop {
			let frame = timeout(Duration::from_secs(5), self.0.next())
				.await
				.expect("server went quiet");
			match frame {
				Some(Ok(Message::Text(text))) => return Some(serde_json::from_str(&text).unwrap()),
				Some(Ok(Message::Close(_))) | None => return None,
				Some(Err(error)) => panic!("socket ended uncleanly: {error}"),
				Some(Ok(_)) => {}
			}
		}
	}

	async fn joined(&mut self) -> (String, String) {
		let msg = self.recv().await.unwrap();
		assert_eq!(msg["type"], "joined", "{msg}");
		(
			msg["you"].as_str().unwrap().into(),
			msg["token"].as_str().unwrap().into(),
		)
	}

	/// The first lobby snapshot that `wanted` accepts.
	async fn lobby(&mut self, wanted: impl Fn(&Value) -> bool) -> Value {
		loop {
			let msg = self.recv().await.expect("socket closed");
			assert_eq!(msg["type"], "lobby", "{msg}");
			assert!(msg["now"].as_u64().unwrap() > 0);
			if wanted(&msg["lobby"]) {
				return msg["lobby"].clone();
			}
		}
	}

	/// The next error, past any snapshots queued ahead of it.
	async fn error(&mut self) -> String {
		loop {
			let msg = self.recv().await.expect("socket closed");
			if msg["type"] == "error" {
				return msg["code"].as_str().unwrap().into();
			}
		}
	}
}

/// What the browser of the player of that name calls itself.
fn who(name: &str) -> String {
	format!("{name:-<16}")
}

fn players(lobby: &Value) -> usize {
	lobby["players"].as_array().unwrap().len()
}

#[tokio::test]
async fn two_players_play_a_game_through() {
	let server = serve(None, vec![]).await;

	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	let (ann_id, _) = ann.joined().await;
	let lobby = ann.lobby(|_| true).await;
	assert_eq!(lobby["host"], json!(ann_id));
	let code = lobby["code"].as_str().unwrap().to_owned();

	// A code typed in lower case, with a stray space, is the same code.
	let typed = format!(" {} ", code.to_lowercase());
	let mut bob = Client::open(
		&server,
		json!({ "type": "join", "code": typed, "name": "Bob", "identity": who("Bob") }),
	)
	.await;
	let (bob_id, _) = bob.joined().await;
	ann.lobby(|l| players(l) == 2).await;

	bob.send(json!({ "type": "start", "settings": {}, "rounds": [{ "id": "a" }] }))
		.await;
	assert_eq!(bob.error().await, "not_host");
	bob.send(json!({ "type": "nonsense" })).await;
	assert_eq!(bob.error().await, "bad_request");

	let settings = json!({ "rounds": 2, "movement": "free", "timer": 0 });
	let rounds = json!([{ "id": "a" }, { "id": "b" }]);
	ann.send(json!({ "type": "start", "settings": settings, "rounds": rounds }))
		.await;
	let playing = bob.lobby(|l| l["phase"] == "playing").await;
	assert_eq!(playing["round"]["entry"], json!({ "id": "a" }));
	assert_eq!(playing["round"]["total"], json!(2));
	assert_eq!(playing["settings"], settings);

	ann.send(json!({ "type": "guess", "round": 0, "result": { "points": 4200 } }))
		.await;
	let waiting = bob.lobby(|l| l["round"]["guessed"] == json!([ann_id])).await;
	assert_eq!(waiting["history"], json!([]));

	bob.send(json!({ "type": "guess", "round": 0, "result": { "points": 100 } }))
		.await;
	let result = ann.lobby(|l| l["phase"] == "result").await;
	assert_eq!(result["history"][0][&ann_id]["points"], json!(4200));
	assert_eq!(result["history"][0][&bob_id]["points"], json!(100));

	// A second click on the same results moves on once.
	ann.send(json!({ "type": "next", "round": 0 })).await;
	ann.send(json!({ "type": "next", "round": 0 })).await;
	assert_eq!(ann.error().await, "bad_phase");
	let second = bob.lobby(|l| l["round"]["index"] == 1 && l["phase"] == "playing").await;
	assert_eq!(second["round"]["entry"], json!({ "id": "b" }));

	// Bob walks out; the round then only waits on Ann.
	bob.send(json!({ "type": "leave" })).await;
	while bob.recv().await.is_some() {}
	ann.send(json!({ "type": "guess", "round": 1, "result": { "points": 1 } }))
		.await;
	ann.lobby(|l| l["phase"] == "result").await;
	ann.send(json!({ "type": "next", "round": 1 })).await;
	let done = ann.lobby(|l| l["phase"] == "final").await;
	assert_eq!(done["history"].as_array().unwrap().len(), 2);
	assert_eq!(players(&done), 2);
}

/// The message cap is the socket's and the round caps are the lobby's.
#[tokio::test]
async fn the_longest_game_of_the_largest_rounds_fits_a_message() {
	let server = serve(None, vec![]).await;
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	ann.joined().await;

	let rounds = vec![json!("x".repeat(2 * 1024 - 2)); 20];
	ann.send(json!({ "type": "start", "settings": {}, "rounds": rounds }))
		.await;
	let playing = ann.lobby(|l| l["phase"] == "playing").await;
	assert_eq!(playing["round"]["total"], json!(20));
}

#[tokio::test]
async fn the_host_closes_a_round_nobody_is_finishing() {
	let server = serve(None, vec![]).await;
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	let mut bob = Client::open(
		&server,
		json!({ "type": "join", "code": code, "name": "Bob", "identity": who("Bob") }),
	)
	.await;
	bob.joined().await;

	ann.send(json!({ "type": "start", "settings": {}, "rounds": [1, 2] }))
		.await;
	bob.send(json!({ "type": "close_round", "round": 0 })).await;
	assert_eq!(bob.error().await, "not_host");
	ann.send(json!({ "type": "close_round", "round": 0 })).await;
	let closed = bob.lobby(|l| l["phase"] == "result").await;
	assert_eq!(closed["history"], json!([{}]));
}

#[tokio::test]
async fn a_lobby_everyone_left_is_gone_and_a_nameless_one_never_was() {
	let server = serve(None, vec![]).await;
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	let (_, token) = ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	ann.send(json!({ "type": "leave" })).await;
	assert_eq!(ann.closed().await, Some(1000));

	let mut back = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": token })).await;
	assert_eq!(back.error().await, "not_found");

	let mut blank = Client::open(
		&server,
		json!({ "type": "create", "name": "  ", "identity": who("blank") }),
	)
	.await;
	assert_eq!(blank.error().await, "bad_request");
	assert!(blank.recv().await.is_none());
}

#[tokio::test]
async fn a_wrong_code_is_an_error_and_a_closed_socket() {
	let server = serve(None, vec![]).await;
	let mut lost = Client::open(
		&server,
		json!({ "type": "join", "code": "NOPE42", "name": "Lost", "identity": who("Lost") }),
	)
	.await;
	assert_eq!(lost.error().await, "not_found");
	assert!(lost.recv().await.is_none());
}

#[tokio::test]
async fn a_reconnect_takes_the_seat_back_from_the_old_socket() {
	let server = serve(None, vec![]).await;
	let mut first = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	let (id, token) = first.joined().await;
	let code = first.lobby(|_| true).await["code"].clone();

	let mut second = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": token })).await;
	assert_eq!(second.joined().await.0, id);
	let lobby = second.lobby(|_| true).await;
	assert_eq!(players(&lobby), 1);
	assert_eq!(lobby["players"][0]["connected"], json!(true));

	// Told apart from every other close: the old socket must not come back.
	assert_eq!(first.closed().await, Some(4000));

	// The old socket closing must not read as the player going away.
	second
		.send(json!({ "type": "settings", "settings": { "timer": 30 } }))
		.await;
	let lobby = second.lobby(|l| l["settings"]["timer"] == 30).await;
	assert_eq!(lobby["players"][0]["connected"], json!(true));

	let mut thief = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": "guess" })).await;
	assert_eq!(thief.error().await, "not_found");
}

#[tokio::test]
async fn a_player_comes_back_as_themselves_whatever_the_game_is_doing() {
	let server = serve(None, vec![]).await;
	let hello = |name: &str, code: &Value| json!({ "type": "join", "code": code, "name": name, "identity": who(name) });
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	let mut bob = Client::open(&server, hello("Bob", &code)).await;
	let (bob_id, _) = bob.joined().await;

	ann.send(json!({ "type": "start", "settings": {}, "rounds": [1] }))
		.await;
	bob.send(json!({ "type": "guess", "round": 0, "result": 7 })).await;
	bob.send(json!({ "type": "leave" })).await;
	while bob.recv().await.is_some() {}

	// A game under way takes someone new, and gives Bob the seat he left.
	let mut cat = Client::open(&server, hello("Cat", &code)).await;
	cat.joined().await;
	let mut bob = Client::open(&server, hello("Bob", &code)).await;
	assert_eq!(bob.joined().await.0, bob_id);
	assert_eq!(players(&bob.lobby(|_| true).await), 3);

	ann.send(json!({ "type": "guess", "round": 0, "result": 1 })).await;
	cat.send(json!({ "type": "guess", "round": 0, "result": 2 })).await;
	let closed = ann.lobby(|l| l["phase"] == "result").await;
	assert_eq!(closed["history"][0][&bob_id], json!(7));
	ann.send(json!({ "type": "next", "round": 0 })).await;
	ann.lobby(|l| l["phase"] == "final").await;

	// Over, it seats someone new for the next, and still knows its own.
	let mut dan = Client::open(&server, hello("Dan", &code)).await;
	dan.joined().await;
	bob.send(json!({ "type": "leave" })).await;
	while bob.recv().await.is_some() {}
	let mut bob = Client::open(&server, hello("Bob", &code)).await;
	assert_eq!(bob.joined().await.0, bob_id);
	assert_eq!(players(&bob.lobby(|_| true).await), 4);

	let mut nameless = Client::open(&server, json!({ "type": "join", "code": code, "name": "Eve" })).await;
	assert_eq!(nameless.error().await, "bad_request");
}

#[tokio::test]
async fn a_client_that_closes_gets_a_close_back() {
	let server = serve(None, vec![]).await;
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	ann.joined().await;
	ann.0.close(None).await.unwrap();
	while ann.recv().await.is_some() {}
}

#[tokio::test]
async fn only_listed_origins_get_a_socket() {
	let server = serve(None, vec!["https://play.example".into()]).await;
	let request = |origin: &str| {
		let mut request = server.url.as_str().into_client_request().unwrap();
		request.headers_mut().insert("origin", origin.parse().unwrap());
		request
	};
	assert!(connect_async(request("https://play.example")).await.is_ok());
	assert!(connect_async(request("https://elsewhere.example")).await.is_err());
	assert!(connect_async(&server.url).await.is_err());
}

/// Cloudflare's part, played here. It knows one secret, and vouches for three
/// tokens: `human`, `joiner`, which it says was made for joining, and `slow`,
/// which it takes longer over than the server waits.
async fn siteverify() -> String {
	async fn verify(Json(claim): Json<Value>) -> Json<Value> {
		if claim["secret"] != "secret" {
			return Json(json!({ "success": false, "error-codes": ["invalid-input-secret"] }));
		}
		match claim["response"].as_str() {
			Some("human") => Json(json!({ "success": true, "error-codes": [] })),
			Some("joiner") => Json(json!({ "success": true, "error-codes": [], "action": "join" })),
			Some("slow") => {
				tokio::time::sleep(Duration::from_secs(30)).await;
				Json(json!({ "success": true, "error-codes": [] }))
			}
			_ => Json(json!({ "success": false, "error-codes": ["invalid-input-response"] })),
		}
	}
	let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
	let url = format!("http://{}/siteverify", listener.local_addr().unwrap());
	let router = Router::new().route("/siteverify", post(verify));
	tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
	url
}

async fn guarded(secret: &str, verify_url: String, require: Vec<Action>) -> Server {
	serve_with(Config {
		database_url: None,
		allowed_origins: vec![],
		turnstile: Some(Turnstile {
			secret: secret.into(),
			verify_url,
			require,
		}),
	})
	.await
}

#[tokio::test]
async fn a_lobby_takes_proof_to_open_where_that_is_required() {
	let server = guarded("secret", siteverify().await, vec![Action::Create]).await;

	let mut bare = Client::open(
		&server,
		json!({ "type": "create", "name": "Bot", "identity": who("Bot") }),
	)
	.await;
	assert_eq!(bare.error().await, "unverified");
	assert!(bare.recv().await.is_none());
	let forged = json!({ "type": "create", "name": "Bot", "identity": who("Bot"), "proof": "made up" });
	assert_eq!(Client::open(&server, forged).await.error().await, "unverified");

	// One made for joining opens no lobby.
	let misused = json!({ "type": "create", "name": "Bot", "identity": who("Bot"), "proof": "joiner" });
	assert_eq!(Client::open(&server, misused).await.error().await, "unverified");
	// What is wrong with the opening itself is said first, and costs no token.
	let mut blank = Client::open(
		&server,
		json!({ "type": "create", "name": " ", "identity": who("blank") }),
	)
	.await;
	assert_eq!(blank.error().await, "bad_request");

	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann"), "proof": "human" }),
	)
	.await;
	let (_, token) = ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();

	// Joining is not what was required, and a proof that fails there is only noted.
	let mut bob = Client::open(
		&server,
		json!({ "type": "join", "code": code, "name": "Bob", "identity": who("Bob") }),
	)
	.await;
	bob.joined().await;
	let forged = json!({ "type": "join", "code": code, "name": "Cat", "identity": who("Cat"), "proof": "made up" });
	Client::open(&server, forged).await.joined().await;

	// A seat's own token is all it takes to come back.
	let mut back = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": token })).await;
	back.joined().await;
}

#[tokio::test]
async fn a_seat_takes_proof_too_where_that_is_required() {
	let server = guarded("secret", siteverify().await, vec![Action::Create, Action::Join]).await;
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann"), "proof": "human" }),
	)
	.await;
	ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();

	let mut bot = Client::open(
		&server,
		json!({ "type": "join", "code": code, "name": "Bot", "identity": who("Bot") }),
	)
	.await;
	assert_eq!(bot.error().await, "unverified");
	// Without proof a wrong code reads the same as a right one.
	let mut probe = Client::open(
		&server,
		json!({ "type": "join", "code": "NOPE42", "name": "Bot", "identity": who("Bot") }),
	)
	.await;
	assert_eq!(probe.error().await, "unverified");

	let mut bob = Client::open(
		&server,
		json!({ "type": "join", "code": code, "name": "Bob", "identity": who("Bob"), "proof": "joiner" }),
	)
	.await;
	let (bob_id, token) = bob.joined().await;
	let mut back = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": token })).await;
	assert_eq!(back.joined().await.0, bob_id);
}

#[tokio::test]
async fn a_proof_nobody_can_check_gets_in() {
	// A port nothing listens on: its listener is dropped at once.
	let nowhere = TcpListener::bind("127.0.0.1:0").await.unwrap().local_addr().unwrap();
	let down = guarded("secret", format!("http://{nowhere}/siteverify"), vec![Action::Create]).await;
	let mut ann = Client::open(
		&down,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann"), "proof": "human" }),
	)
	.await;
	ann.joined().await;
	// No proof at all is still none: there was nothing to check.
	let mut bare = Client::open(
		&down,
		json!({ "type": "create", "name": "Bot", "identity": who("Bot") }),
	)
	.await;
	assert_eq!(bare.error().await, "unverified");
}

#[tokio::test]
async fn a_secret_cloudflare_does_not_know_stops_the_server_starting() {
	let misconfigured = Config {
		database_url: None,
		allowed_origins: vec![],
		turnstile: Some(Turnstile {
			secret: "stale".into(),
			verify_url: siteverify().await,
			require: vec![],
		}),
	};
	assert!(app(misconfigured).await.is_err());
}

#[tokio::test]
async fn more_proofs_than_can_be_checked_are_turned_away_not_let_in() {
	let server = guarded("secret", siteverify().await, vec![Action::Create]).await;
	// As many as are checked at once, each holding its turn until it times out.
	let mut flood = Vec::new();
	for _ in 0..32 {
		flood.push(
			Client::open(
				&server,
				json!({ "type": "create", "name": "Bot", "identity": who("Bot"), "proof": "slow" }),
			)
			.await,
		);
	}
	tokio::time::sleep(Duration::from_millis(300)).await;
	let mut ann = Client::open(
		&server,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann"), "proof": "human" }),
	)
	.await;
	assert_eq!(ann.error().await, "busy");

	// A join nothing is required of waits on none of it.
	let quiet = guarded("secret", siteverify().await, vec![]).await;
	let mut host = Client::open(
		&quiet,
		json!({ "type": "create", "name": "Host", "identity": who("Host") }),
	)
	.await;
	host.joined().await;
	let code = host.lobby(|_| true).await["code"].clone();
	let slow = json!({ "type": "join", "code": code, "name": "Bob", "identity": who("Bob"), "proof": "slow" });
	let mut bob = Client::open(&quiet, slow).await;
	timeout(Duration::from_secs(1), bob.joined()).await.unwrap();
}

/// A database of the test's own, so it neither restores nor rewrites the
/// lobbies of whatever server `DATABASE_URL` belongs to.
struct Scratch {
	admin: PgPool,
	name: String,
	url: String,
}

impl Scratch {
	async fn create(base_url: &str) -> Self {
		let admin = PgPool::connect(base_url).await.unwrap();
		let name = format!("ws_test_{}", std::process::id());
		let (server, _) = base_url.rsplit_once('/').unwrap();
		let url = format!("{server}/{name}");
		sqlx::query(&format!("create database {name}"))
			.execute(&admin)
			.await
			.unwrap();
		Self { admin, name, url }
	}

	/// Forced: the first server's lobby tasks outlive it in this process, and
	/// still hold connections.
	async fn drop(self) {
		sqlx::query(&format!("drop database {} with (force)", self.name))
			.execute(&self.admin)
			.await
			.unwrap();
	}
}

/// Needs Postgres: runs when `DATABASE_URL` is set, as it is in CI.
#[tokio::test]
async fn a_game_outlives_the_process_that_started_it() {
	let Ok(base_url) = std::env::var("DATABASE_URL") else {
		eprintln!("DATABASE_URL unset: skipped");
		return;
	};
	let scratch = Scratch::create(&base_url).await;

	let before = serve(Some(scratch.url.clone()), vec![]).await;
	let mut ann = Client::open(
		&before,
		json!({ "type": "create", "name": "Ann", "identity": who("Ann") }),
	)
	.await;
	let (ann_id, ann_token) = ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	let mut bob = Client::open(
		&before,
		json!({ "type": "join", "code": code, "name": "Bob", "identity": who("Bob") }),
	)
	.await;
	let (bob_id, bob_token) = bob.joined().await;

	let rounds = json!([{ "id": "a" }, { "id": "b" }]);
	ann.send(json!({ "type": "start", "settings": { "timer": 600 }, "rounds": rounds }))
		.await;
	ann.send(json!({ "type": "guess", "round": 0, "result": { "points": 4200 } }))
		.await;
	let open = bob.lobby(|l| l["round"]["guessed"] == json!([ann_id])).await;

	// A host still waiting alone, whose lobby nothing has changed since it opened.
	let mut cat = Client::open(
		&before,
		json!({ "type": "create", "name": "Cat", "identity": who("Cat") }),
	)
	.await;
	let (cat_id, cat_token) = cat.joined().await;
	let cat_code = cat.lobby(|_| true).await["code"].clone();

	drop((ann, bob, cat));
	before.task.abort();
	let after = serve(Some(scratch.url.clone()), vec![]).await;

	let mut cat = Client::open(
		&after,
		json!({ "type": "rejoin", "code": cat_code, "token": cat_token }),
	)
	.await;
	assert_eq!(cat.joined().await.0, cat_id);
	assert_eq!(cat.lobby(|_| true).await["host"], json!(cat_id));

	// Ann, who had guessed, is back first, and for long enough that the lobby
	// has ticked: the round still waits for Bob.
	let mut ann = Client::open(&after, json!({ "type": "rejoin", "code": code, "token": ann_token })).await;
	ann.joined().await;
	tokio::time::sleep(Duration::from_millis(1500)).await;

	let mut bob = Client::open(&after, json!({ "type": "rejoin", "code": code, "token": bob_token })).await;
	bob.joined().await;
	let restored = bob.lobby(|_| true).await;
	assert_eq!(restored["phase"], json!("playing"));
	assert_eq!(restored["round"]["ends_at"], open["round"]["ends_at"]);
	assert_eq!(restored["round"]["guessed"], json!([ann_id]));

	bob.send(json!({ "type": "guess", "round": 0, "result": { "points": 7 } }))
		.await;
	let result = ann.lobby(|l| l["phase"] == "result").await;
	assert_eq!(result["history"][0][&ann_id]["points"], json!(4200));
	assert_eq!(result["history"][0][&bob_id]["points"], json!(7));

	after.task.abort();
	scratch.drop().await;
}

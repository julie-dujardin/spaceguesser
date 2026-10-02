//! The server as a browser sees it: real sockets against a real listener.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use spaceguesser_backend::{Config, app};
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
	let router = app(Config {
		database_url,
		allowed_origins,
	})
	.await
	.unwrap();
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

fn players(lobby: &Value) -> usize {
	lobby["players"].as_array().unwrap().len()
}

#[tokio::test]
async fn two_players_play_a_game_through() {
	let server = serve(None, vec![]).await;

	let mut ann = Client::open(&server, json!({ "type": "create", "name": "Ann" })).await;
	let (ann_id, _) = ann.joined().await;
	let lobby = ann.lobby(|_| true).await;
	assert_eq!(lobby["host"], json!(ann_id));
	let code = lobby["code"].as_str().unwrap().to_owned();

	// A code typed in lower case, with a stray space, is the same code.
	let typed = format!(" {} ", code.to_lowercase());
	let mut bob = Client::open(&server, json!({ "type": "join", "code": typed, "name": "Bob" })).await;
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

	ann.send(json!({ "type": "guess", "result": { "points": 4200 } })).await;
	let waiting = bob.lobby(|l| l["round"]["guessed"] == json!([ann_id])).await;
	assert_eq!(waiting["history"], json!([]));

	bob.send(json!({ "type": "guess", "result": { "points": 100 } })).await;
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
	ann.send(json!({ "type": "guess", "result": { "points": 1 } })).await;
	ann.lobby(|l| l["phase"] == "result").await;
	ann.send(json!({ "type": "next", "round": 1 })).await;
	let done = ann.lobby(|l| l["phase"] == "final").await;
	assert_eq!(done["history"].as_array().unwrap().len(), 2);
	assert_eq!(players(&done), 2);
}

#[tokio::test]
async fn the_host_closes_a_round_nobody_is_finishing() {
	let server = serve(None, vec![]).await;
	let mut ann = Client::open(&server, json!({ "type": "create", "name": "Ann" })).await;
	ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	let mut bob = Client::open(&server, json!({ "type": "join", "code": code, "name": "Bob" })).await;
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
	let mut ann = Client::open(&server, json!({ "type": "create", "name": "Ann" })).await;
	let (_, token) = ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	ann.send(json!({ "type": "leave" })).await;
	while ann.recv().await.is_some() {}

	let mut back = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": token })).await;
	assert_eq!(back.error().await, "not_found");

	let mut blank = Client::open(&server, json!({ "type": "create", "name": "  " })).await;
	assert_eq!(blank.error().await, "bad_request");
	assert!(blank.recv().await.is_none());
}

#[tokio::test]
async fn a_wrong_code_is_an_error_and_a_closed_socket() {
	let server = serve(None, vec![]).await;
	let mut lost = Client::open(&server, json!({ "type": "join", "code": "NOPE42", "name": "Lost" })).await;
	assert_eq!(lost.error().await, "not_found");
	assert!(lost.recv().await.is_none());
}

#[tokio::test]
async fn a_reconnect_takes_the_seat_back_from_the_old_socket() {
	let server = serve(None, vec![]).await;
	let mut first = Client::open(&server, json!({ "type": "create", "name": "Ann" })).await;
	let (id, token) = first.joined().await;
	let code = first.lobby(|_| true).await["code"].clone();

	let mut second = Client::open(&server, json!({ "type": "rejoin", "code": code, "token": token })).await;
	assert_eq!(second.joined().await.0, id);
	let lobby = second.lobby(|_| true).await;
	assert_eq!(players(&lobby), 1);
	assert_eq!(lobby["players"][0]["connected"], json!(true));

	while first.recv().await.is_some() {}

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
async fn a_client_that_closes_gets_a_close_back() {
	let server = serve(None, vec![]).await;
	let mut ann = Client::open(&server, json!({ "type": "create", "name": "Ann" })).await;
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
	let mut ann = Client::open(&before, json!({ "type": "create", "name": "Ann" })).await;
	let (ann_id, ann_token) = ann.joined().await;
	let code = ann.lobby(|_| true).await["code"].clone();
	let mut bob = Client::open(&before, json!({ "type": "join", "code": code, "name": "Bob" })).await;
	let (bob_id, bob_token) = bob.joined().await;

	let rounds = json!([{ "id": "a" }, { "id": "b" }]);
	ann.send(json!({ "type": "start", "settings": { "timer": 600 }, "rounds": rounds }))
		.await;
	ann.send(json!({ "type": "guess", "result": { "points": 4200 } })).await;
	let open = bob.lobby(|l| l["round"]["guessed"] == json!([ann_id])).await;

	// A host still waiting alone, whose lobby nothing has changed since it opened.
	let mut cat = Client::open(&before, json!({ "type": "create", "name": "Cat" })).await;
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

	bob.send(json!({ "type": "guess", "result": { "points": 7 } })).await;
	let result = ann.lobby(|l| l["phase"] == "result").await;
	assert_eq!(result["history"][0][&ann_id]["points"], json!(4200));
	assert_eq!(result["history"][0][&bob_id]["points"], json!(7));

	after.task.abort();
	scratch.drop().await;
}

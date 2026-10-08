//! What the server says of itself, as Prometheus reads it. One test, in a file
//! of its own: the counts are the process's, and any other test would move them.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use spaceguesser_backend::{Action, Config, Turnstile, app, metrics};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{sleep, timeout};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// A socket that has sent `hello`, and the first thing it was told.
async fn open(url: &str, hello: Value) -> (Socket, Value) {
	let (mut socket, _) = connect_async(url).await.unwrap();
	socket.send(Message::Text(hello.to_string().into())).await.unwrap();
	loop {
		if let Message::Text(text) = socket.next().await.unwrap().unwrap() {
			return (socket, serde_json::from_str(&text).unwrap());
		}
	}
}

/// The counts, once every one of `lines` is among them: a socket's end is
/// counted a moment after its client sees it.
async fn scraped(url: &str, lines: &[&str]) -> String {
	let mut text = String::new();
	let all = async {
		loop {
			text = reqwest::get(url).await.unwrap().text().await.unwrap();
			if lines.iter().all(|line| text.lines().any(|counted| counted == *line)) {
				return;
			}
			sleep(Duration::from_millis(20)).await;
		}
	};
	if timeout(Duration::from_secs(5), all).await.is_err() {
		panic!("{lines:?} are not all in:\n{text}");
	}
	text
}

#[tokio::test]
async fn what_happens_at_the_sockets_is_counted() {
	// A port nothing listens on, for a Cloudflare that cannot be asked.
	let nowhere = TcpListener::bind("127.0.0.1:0").await.unwrap().local_addr().unwrap();
	let router = app(Config {
		database_url: None,
		allowed_origins: vec![],
		turnstile: Some(Turnstile {
			secret: "secret".into(),
			verify_url: format!("http://{nowhere}/siteverify"),
			require: vec![Action::Create],
		}),
	})
	.await
	.unwrap();
	let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
	let game = format!("ws://{}/ws", listener.local_addr().unwrap());
	tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
	let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
	let counts = format!("http://{}/metrics", listener.local_addr().unwrap());
	tokio::spawn(async move { axum::serve(listener, metrics()).await.unwrap() });

	let answer = reqwest::get(&counts).await.unwrap();
	assert_eq!(answer.headers()["content-type"], "text/plain; version=0.0.4");

	// Nothing has happened yet, and every count is already there to read.
	let idle = scraped(
		&counts,
		&[
			"spaceguesser_lobbies 0",
			"spaceguesser_max_lobbies 5000",
			"spaceguesser_sockets 0",
			r#"spaceguesser_errors_total{code="not_found"} 0"#,
			r#"spaceguesser_proofs_total{action="create",proof="unchecked"} 0"#,
			"spaceguesser_store_failures_total 0",
		],
	)
	.await;
	// The process's own, which say what the server costs its host.
	assert!(idle.contains("\nprocess_resident_memory_bytes "), "{idle}");

	let create = json!({ "type": "create", "name": "Ann", "identity": "Ann-------------", "proof": "token" });
	let (mut ann, joined) = open(&game, create).await;
	assert_eq!(joined["type"], "joined", "{joined}");
	let join = json!({ "type": "join", "code": "NOSUCH", "name": "Bob", "identity": "Bob-------------" });
	let (_, error) = open(&game, join).await;
	assert_eq!(error["code"], "not_found", "{error}");
	scraped(
		&counts,
		&[
			"spaceguesser_lobbies 1",
			"spaceguesser_sockets 1",
			r#"spaceguesser_errors_total{code="not_found"} 1"#,
			r#"spaceguesser_proofs_total{action="create",proof="unchecked"} 1"#,
			r#"spaceguesser_proofs_total{action="join",proof="absent"} 1"#,
		],
	)
	.await;

	let leave = json!({ "type": "leave" });
	ann.send(Message::Text(leave.to_string().into())).await.unwrap();
	scraped(&counts, &["spaceguesser_lobbies 0", "spaceguesser_sockets 0"]).await;
}

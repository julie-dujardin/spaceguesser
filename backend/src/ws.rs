//! One socket: its opening message picks a lobby, and the rest go to it.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade, close_code};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{Notify, mpsc, oneshot};
use tokio::time::{Instant, interval, timeout};

use crate::App;
use crate::lobby::Error;
use crate::protocol::{ClientMsg, ServerMsg};
use crate::registry::{Command, Conn, Entry, Handle, OUTBOX};

/// Room for a `start` carrying every round.
const MAX_MESSAGE_BYTES: usize = 256 * 1024;
const HELLO_TIMEOUT: Duration = Duration::from_secs(10);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(5);
/// Under the proxy's idle cutoff, which drops a socket that says nothing for 100 s.
const PING_EVERY: Duration = Duration::from_secs(30);
/// A game needs a message every few seconds; this is someone leaning on the socket.
const MAX_MESSAGES_PER_SECOND: u32 = 20;
/// Two pings unanswered: a phone that left the network sends no goodbye, and
/// would otherwise look connected until TCP gives up on it.
const IDLE_TIMEOUT: Duration = Duration::from_secs(75);

static NEXT_CONN: AtomicU64 = AtomicU64::new(1);

pub async fn upgrade(State(app): State<Arc<App>>, headers: HeaderMap, upgrade: WebSocketUpgrade) -> Response {
	// Browsers do not apply CORS to WebSockets, so the origin is checked here.
	let origin = headers.get(header::ORIGIN).and_then(|o| o.to_str().ok());
	if !app.origins.is_empty() && !origin.is_some_and(|o| app.origins.iter().any(|allowed| allowed == o)) {
		return StatusCode::FORBIDDEN.into_response();
	}
	upgrade
		.max_message_size(MAX_MESSAGE_BYTES)
		.on_upgrade(move |socket| serve(app, socket))
}

/// Reads the socket until it ends. Returning drops the last sender to the
/// writer, which then sends what is queued and closes.
async fn serve(app: Arc<App>, socket: WebSocket) {
	let (sink, mut stream) = socket.split();
	let (tx, rx) = mpsc::channel(OUTBOX);
	tokio::spawn(write(sink, rx));
	let hang_up = Arc::new(Notify::new());
	let conn = Conn {
		id: NEXT_CONN.fetch_add(1, Ordering::Relaxed),
		tx: tx.clone(),
		hang_up: hang_up.clone(),
	};
	let conn_id = conn.id;

	let hello = timeout(HELLO_TIMEOUT, next_msg(&mut stream)).await.ok().flatten();
	let entered = match hello {
		Some(Ok(hello)) => enter(&app, hello, conn).await,
		Some(Err(())) => Err(Error::BadRequest),
		None => return,
	};
	let (lobby, player) = match entered {
		Ok(entered) => entered,
		Err(code) => {
			let _ = tx.send(Message::Text(ServerMsg::Error { code }.encode())).await;
			return;
		}
	};

	let mut window = Instant::now();
	let mut count = 0;
	loop {
		let msg = tokio::select! {
			msg = next_msg(&mut stream) => msg,
			_ = hang_up.notified() => None,
		};
		let Some(msg) = msg else { break };
		if window.elapsed() >= Duration::from_secs(1) {
			window = Instant::now();
			count = 0;
		}
		count += 1;
		if count > MAX_MESSAGES_PER_SECOND {
			break;
		}
		let Ok(msg) = msg else {
			let code = Error::BadRequest;
			let _ = tx.try_send(Message::Text(ServerMsg::Error { code }.encode()));
			continue;
		};
		let command = Command::Client {
			player: player.clone(),
			conn: conn_id,
			msg,
		};
		if lobby.send(command).await.is_err() {
			break;
		}
	}

	let _ = lobby.send(Command::Detach { player, conn: conn_id }).await;
}

/// The next client message; `Err` for one that does not parse, `None` once the
/// socket is done or has gone quiet.
async fn next_msg(
	stream: &mut (impl StreamExt<Item = Result<Message, axum::Error>> + Unpin),
) -> Option<Result<ClientMsg, ()>> {
	loop {
		match timeout(IDLE_TIMEOUT, stream.next()).await.ok()?? {
			Ok(Message::Text(text)) => return Some(serde_json::from_str(&text).map_err(|_| ())),
			Ok(Message::Close(_)) | Err(_) => return None,
			Ok(_) => {}
		}
	}
}

async fn enter(app: &App, hello: ClientMsg, conn: Conn) -> Result<(Handle, String), Error> {
	let (lobby, entry) = match hello {
		// The host's seat is made with the lobby, so a lobby is never without
		// one; the socket then takes it like any reconnect.
		ClientMsg::Create { name } => {
			let (lobby, token) = app.registry.create(&name)?;
			(lobby, Entry::Rejoin { token })
		}
		ClientMsg::Join { code, name } => (find(app, &code)?, Entry::Join { name }),
		ClientMsg::Rejoin { code, token } => (find(app, &code)?, Entry::Rejoin { token }),
		_ => return Err(Error::BadRequest),
	};
	let (reply, entered) = oneshot::channel();
	// A lobby that closed between the lookup and here is one that is not there.
	lobby
		.send(Command::Enter { entry, conn, reply })
		.await
		.map_err(|_| Error::NotFound)?;
	let player = entered.await.map_err(|_| Error::NotFound)??;
	Ok((lobby, player))
}

fn find(app: &App, code: &str) -> Result<Handle, Error> {
	app.registry
		.get(&code.trim().to_ascii_uppercase())
		.ok_or(Error::NotFound)
}

async fn write(mut sink: SplitSink<WebSocket, Message>, mut rx: mpsc::Receiver<Message>) {
	let mut ping = interval(PING_EVERY);
	loop {
		let msg = tokio::select! {
			msg = rx.recv() => msg,
			_ = ping.tick() => Some(Message::Ping(Default::default())),
		};
		let Some(msg) = msg else { break };
		if sink.send(msg).await.is_err() {
			return;
		}
	}
	// A close with a status, which a browser otherwise reports as abnormal. When
	// the client closed first the send is refused, and closing the sink answers
	// it: either way the socket ends cleanly, not on a bare EOF.
	let normal = CloseFrame {
		code: close_code::NORMAL,
		reason: Default::default(),
	};
	let _ = timeout(CLOSE_TIMEOUT, async {
		let _ = sink.send(Message::Close(Some(normal))).await;
		let _ = sink.close().await;
	})
	.await;
}

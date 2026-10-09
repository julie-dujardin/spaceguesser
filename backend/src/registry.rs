//! The live lobbies, each a task that owns its state and its sockets.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::ws::{CloseFrame, Message};
use tokio::sync::{Notify, mpsc, oneshot};
use tokio::time::{MissedTickBehavior, interval, sleep};

use crate::lobby::{Error, Lobby, random_code};
use crate::metrics;
use crate::protocol::{ClientMsg, SEAT_TAKEN, ServerMsg};
use crate::store::Store;

/// Bounds memory if someone opens lobbies in a loop. All of them full is
/// still under the open files the server is deployed with.
pub const MAX_LOBBIES: usize = 2_500;
/// A client this far behind is gone or stuck, and is dropped rather than buffered for.
pub const OUTBOX: usize = 32;
/// How often the store is cleared of lobbies that are gone.
const RECONCILE_EVERY: Duration = Duration::from_secs(60);

pub type Handle = mpsc::Sender<Command>;

pub struct Conn {
	pub id: u64,
	pub tx: mpsc::Sender<Message>,
	/// Tells the socket's own task to hang up: the lobby letting go of a
	/// socket would otherwise leave it open and unheard.
	pub hang_up: Arc<Notify>,
}

pub enum Entry {
	Join { name: String, identity: String },
	Rejoin { token: String },
}

pub enum Command {
	/// Replies with the player id the socket now speaks for.
	Enter {
		entry: Entry,
		conn: Conn,
		reply: oneshot::Sender<Result<String, Error>>,
	},
	Client {
		player: String,
		conn: u64,
		msg: ClientMsg,
	},
	Detach {
		player: String,
		conn: u64,
	},
}

pub struct Registry {
	lobbies: Mutex<HashMap<String, Handle>>,
	store: Store,
}

fn now_ms() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |d| d.as_millis() as u64)
}

impl Registry {
	pub fn new(store: Store) -> Arc<Self> {
		Arc::new(Self {
			lobbies: Mutex::new(HashMap::new()),
			store,
		})
	}

	pub fn full(&self) -> bool {
		self.lobbies.lock().unwrap().len() >= MAX_LOBBIES
	}

	/// Opens a lobby hosted by `name`, and returns the token that takes the
	/// host's seat.
	pub fn create(self: &Arc<Self>, name: &str, identity: &str) -> Result<(Handle, String), Error> {
		let mut lobbies = self.lobbies.lock().unwrap();
		if lobbies.len() >= MAX_LOBBIES {
			return Err(Error::Busy);
		}
		let code = loop {
			let code = random_code();
			if !lobbies.contains_key(&code) {
				break code;
			}
		};
		let (lobby, token) = Lobby::hosted(code, name, identity, now_ms())?;
		Ok((self.spawn(&mut lobbies, lobby, true), token))
	}

	pub fn get(&self, code: &str) -> Option<Handle> {
		self.lobbies.lock().unwrap().get(code).cloned()
	}

	/// Brings back what a previous process left in the store.
	pub async fn restore(self: &Arc<Self>) -> Result<usize, sqlx::Error> {
		let stored = self.store.load_all().await?;
		let mut lobbies = self.lobbies.lock().unwrap();
		let count = stored.len();
		for lobby in stored {
			self.spawn(&mut lobbies, lobby, false);
		}
		Ok(count)
	}

	/// Runs for as long as the server: a lobby's own delete does not always
	/// reach the store.
	pub async fn reconcile(self: Arc<Self>) {
		loop {
			sleep(RECONCILE_EVERY).await;
			let live: Vec<String> = self.lobbies.lock().unwrap().keys().cloned().collect();
			self.store.retain(&live).await;
		}
	}

	/// `fresh` is a lobby the store has not seen yet.
	fn spawn(self: &Arc<Self>, lobbies: &mut HashMap<String, Handle>, lobby: Lobby, fresh: bool) -> Handle {
		let (tx, rx) = mpsc::channel(64);
		lobbies.insert(lobby.code.clone(), tx.clone());
		metrics::lobbies(lobbies.len());
		tokio::spawn(run(self.clone(), lobby, rx, fresh));
		tx
	}
}

#[derive(PartialEq)]
enum Change {
	None,
	/// Who is connected: worth telling, but not stored.
	Presence,
	Stored,
}

async fn run(registry: Arc<Registry>, mut lobby: Lobby, mut rx: mpsc::Receiver<Command>, fresh: bool) {
	// Before the host hears of it: a host waiting alone has a lobby to come
	// back to after a restart.
	let mut unsaved = fresh && !registry.store.save(&lobby).await;
	let mut conns: HashMap<String, Conn> = HashMap::new();
	let mut clock = interval(Duration::from_secs(1));
	clock.set_missed_tick_behavior(MissedTickBehavior::Delay);

	loop {
		let command = tokio::select! {
			Some(command) = rx.recv() => Some(command),
			_ = clock.tick() => None,
		};
		let now = now_ms();
		let change = match command {
			Some(command) => handle(&mut lobby, &mut conns, command, now),
			None if lobby.tick(now) => Change::Stored,
			None => Change::None,
		};
		// Saved before anyone is told, so nobody has seen a state a restart loses.
		// A save the store did not take is owed, and tried again on each pass:
		// the row is not left behind the game for want of another change.
		if change == Change::Stored || unsaved {
			unsaved = !registry.store.save(&lobby).await;
		}
		if change != Change::None {
			broadcast(&mut lobby, &mut conns);
		}
		if lobby.expired(now) {
			break;
		}
	}

	for conn in conns.values() {
		conn.hang_up.notify_one();
	}
	// The row goes first: the code stays taken until nothing is left under it.
	registry.store.delete(&lobby.code).await;
	let mut lobbies = registry.lobbies.lock().unwrap();
	lobbies.remove(&lobby.code);
	metrics::lobbies(lobbies.len());
}

fn handle(lobby: &mut Lobby, conns: &mut HashMap<String, Conn>, command: Command, now: u64) -> Change {
	match command {
		Command::Enter { entry, conn, reply } => {
			let (entered, change) = match &entry {
				Entry::Join { name, identity } => (lobby.join(name, identity, now), Change::Stored),
				Entry::Rejoin { token } => (lobby.rejoin(token), Change::Presence),
			};
			let Ok(player) = entered else {
				let _ = reply.send(entered);
				return Change::None;
			};
			let token = lobby.token(&player).unwrap_or_default();
			let _ = conn
				.tx
				.try_send(Message::Text(ServerMsg::Joined { you: &player, token }.encode()));
			// One socket per seat: a second tab or a reconnect takes it over.
			if let Some(old) = conns.insert(player.clone(), conn) {
				let taken = CloseFrame {
					code: SEAT_TAKEN,
					reason: Default::default(),
				};
				let _ = old.tx.try_send(Message::Close(Some(taken)));
				old.hang_up.notify_one();
			}
			let _ = reply.send(Ok(player));
			change
		}
		Command::Client { player, conn, msg } => {
			let Some(current) = conns.get(&player).filter(|c| c.id == conn) else {
				return Change::None;
			};
			let done = match msg {
				ClientMsg::Settings { settings } => lobby.set_settings(&player, settings),
				ClientMsg::Start { settings, rounds } => lobby.start(&player, settings, rounds, now),
				ClientMsg::Guess { round, result } => lobby.guess(&player, round, result, now),
				ClientMsg::CloseRound { round } => lobby.close_round(&player, round),
				ClientMsg::Next { round } => lobby.next(&player, round, now),
				ClientMsg::Leave => {
					lobby.leave(&player, now);
					current.hang_up.notify_one();
					conns.remove(&player);
					return Change::Stored;
				}
				ClientMsg::Create { .. } | ClientMsg::Join { .. } | ClientMsg::Rejoin { .. } => Err(Error::BadRequest),
			};
			match done {
				Ok(()) => Change::Stored,
				Err(code) => {
					metrics::error(code);
					let _ = current.tx.try_send(Message::Text(ServerMsg::Error { code }.encode()));
					Change::None
				}
			}
		}
		Command::Detach { player, conn } => {
			if conns.get(&player).is_none_or(|c| c.id != conn) {
				return Change::None;
			}
			conns.remove(&player);
			lobby.disconnect(&player, now);
			Change::Presence
		}
	}
}

fn broadcast(lobby: &mut Lobby, conns: &mut HashMap<String, Conn>) {
	// Dropping a stuck client changes who is connected, which the rest must hear.
	loop {
		// Read afresh: the save since the change may have taken a while.
		let now = now_ms();
		let lobby_msg = ServerMsg::Lobby {
			now,
			lobby: lobby.snapshot(),
		};
		let text = lobby_msg.encode();
		let stuck: Vec<String> = conns
			.iter()
			.filter(|(_, conn)| conn.tx.try_send(Message::Text(text.clone())).is_err())
			.map(|(player, _)| player.clone())
			.collect();
		if stuck.is_empty() {
			return;
		}
		for player in stuck {
			if let Some(conn) = conns.remove(&player) {
				conn.hang_up.notify_one();
			}
			lobby.disconnect(&player, now);
		}
	}
}

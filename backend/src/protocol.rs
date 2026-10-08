//! The JSON that crosses the socket.

use axum::extract::ws::Utf8Bytes;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::lobby::{Error, Snapshot};

/// The status a socket is closed with when its seat was opened on another one.
/// A client that came straight back from it would have the two trade the seat
/// forever; from any other close it does come back.
pub const SEAT_TAKEN: u16 = 4000;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
	// A socket opens with one of these three, and takes none of them after.
	// `identity` is what the browser names itself, by which a join finds the
	// seat its player already has. `proof` is a Turnstile token. A seat's own
	// token is proof enough to rejoin.
	Create {
		name: String,
		identity: String,
		proof: Option<String>,
	},
	Join {
		code: String,
		name: String,
		identity: String,
		proof: Option<String>,
	},
	Rejoin {
		code: String,
		token: String,
	},

	Settings {
		settings: Value,
	},
	Start {
		settings: Value,
		rounds: Vec<Value>,
	},
	// These name the round they are about, so a stale one does nothing.
	Guess {
		round: usize,
		result: Value,
	},
	CloseRound {
		round: usize,
	},
	Next {
		round: usize,
	},
	Leave,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg<'a> {
	/// Sent once, ahead of the first `lobby`. The token is what `rejoin` takes.
	Joined {
		you: &'a str,
		token: &'a str,
	},
	/// The whole lobby, on every change. `now` is the server's clock, for
	/// reading `ends_at` on a device whose own clock is off.
	Lobby {
		now: u64,
		lobby: Snapshot<'a>,
	},
	Error {
		code: Error,
	},
}

impl ServerMsg<'_> {
	pub fn encode(&self) -> Utf8Bytes {
		serde_json::to_string(self).expect("server messages serialize").into()
	}
}

//! Games in progress, kept so a redeploy does not end them.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use sqlx::PgPool;
use sqlx::postgres::{PgPoolOptions, PgQueryResult};
use sqlx::types::Json;
use tokio::time::timeout;
use tracing::warn;

use crate::lobby::Lobby;

/// A lobby waits on its write before telling its players, so this is the
/// longest a database that has stopped answering can hold a move up.
const WRITE_TIMEOUT: Duration = Duration::from_secs(2);
/// After a write that got no answer, how long writes are skipped: the games
/// then stall once in this long rather than on every move. Each write is the
/// whole lobby, so the first one through catches the store up.
const RETRY_AFTER: Duration = Duration::from_secs(15);

/// Without a database the server still runs; lobbies just die with it.
pub struct Store {
	pool: Option<PgPool>,
	down_until: Mutex<Option<Instant>>,
}

impl Store {
	pub async fn connect(url: Option<&str>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
		let pool = match url {
			Some(url) => {
				let pool = PgPoolOptions::new().max_connections(8).connect(url).await?;
				sqlx::migrate!().run(&pool).await?;
				Some(pool)
			}
			None => None,
		};
		Ok(Self {
			pool,
			down_until: Mutex::new(None),
		})
	}

	pub async fn save(&self, lobby: &Lobby) {
		let Some(pool) = &self.pool else { return };
		let query = sqlx::query(
			"insert into lobbies (code, state) values ($1, $2)
			 on conflict (code) do update set state = excluded.state, updated_at = now()",
		)
		.bind(&lobby.code)
		.bind(Json(lobby));
		self.attempt("saved", &lobby.code, query.execute(pool)).await;
	}

	pub async fn delete(&self, code: &str) {
		let Some(pool) = &self.pool else { return };
		let query = sqlx::query("delete from lobbies where code = $1").bind(code);
		self.attempt("deleted", code, query.execute(pool)).await;
	}

	/// A failed write costs a redeploy's safety net, not the game being played.
	async fn attempt(&self, done: &str, code: &str, write: impl Future<Output = sqlx::Result<PgQueryResult>>) {
		if self
			.down_until
			.lock()
			.unwrap()
			.is_some_and(|until| Instant::now() < until)
		{
			return;
		}
		match timeout(WRITE_TIMEOUT, write).await {
			Ok(Ok(_)) => {}
			Ok(Err(error)) => warn!(code, %error, "lobby not {done}"),
			Err(_) => {
				*self.down_until.lock().unwrap() = Some(Instant::now() + RETRY_AFTER);
				warn!(
					code,
					"lobby not {done}: the database did not answer, writes are off for a while"
				);
			}
		}
	}

	/// Every stored lobby. A row this build cannot read is from an older one
	/// and is dropped: a game in progress is not worth a compatibility path.
	pub async fn load_all(&self) -> Result<Vec<Lobby>, sqlx::Error> {
		let Some(pool) = &self.pool else { return Ok(Vec::new()) };
		let rows: Vec<(String, serde_json::Value)> = sqlx::query_as("select code, state from lobbies")
			.fetch_all(pool)
			.await?;
		let mut lobbies = Vec::new();
		for (code, state) in rows {
			match serde_json::from_value(state) {
				Ok(lobby) => lobbies.push(lobby),
				Err(error) => {
					warn!(code, %error, "unreadable lobby dropped");
					self.delete(&code).await;
				}
			}
		}
		Ok(lobbies)
	}
}

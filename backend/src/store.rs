//! Games in progress, kept so a redeploy does not end them.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use sqlx::PgPool;
use sqlx::postgres::{PgPoolOptions, PgQueryResult};
use sqlx::types::Json;
use tokio::time::timeout;
use tracing::{info, warn};

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
		self.attempt("lobby not saved", Some(&lobby.code), query.execute(pool))
			.await;
	}

	pub async fn delete(&self, code: &str) {
		let Some(pool) = &self.pool else { return };
		let query = sqlx::query("delete from lobbies where code = $1").bind(code);
		self.attempt("lobby not deleted", Some(code), query.execute(pool)).await;
	}

	/// Deletes the rows of all but the `live` lobbies. A lobby that closes while
	/// the database is not answering leaves its row, which the next start would
	/// bring back as an empty lobby.
	pub async fn retain(&self, live: &[String]) {
		let Some(pool) = &self.pool else { return };
		// Not the newest rows: a lobby opened since `live` was read is not in it.
		let query = sqlx::query(
			"delete from lobbies
			 where code not in (select unnest($1)) and updated_at < now() - interval '1 minute'",
		)
		.bind(live);
		let cleared = self
			.attempt("closed lobbies not cleared", None, query.execute(pool))
			.await;
		if let Some(rows) = cleared.map(|done| done.rows_affected()).filter(|&rows| rows > 0) {
			info!(rows, "closed lobbies cleared");
		}
	}

	/// A failed write costs a redeploy's safety net, not the game being played.
	async fn attempt(
		&self,
		failure: &str,
		code: Option<&str>,
		write: impl Future<Output = sqlx::Result<PgQueryResult>>,
	) -> Option<PgQueryResult> {
		if self
			.down_until
			.lock()
			.unwrap()
			.is_some_and(|until| Instant::now() < until)
		{
			return None;
		}
		match timeout(WRITE_TIMEOUT, write).await {
			Ok(Ok(done)) => return Some(done),
			Ok(Err(error)) => warn!(code, %error, "{failure}"),
			Err(_) => {
				*self.down_until.lock().unwrap() = Some(Instant::now() + RETRY_AFTER);
				warn!(
					code,
					"{failure}: the database did not answer, writes are off for a while"
				);
			}
		}
		None
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

#[cfg(test)]
mod tests {
	use super::*;

	/// Needs Postgres: runs when `DATABASE_URL` is set, as it is in CI.
	#[tokio::test]
	async fn only_old_rows_without_a_lobby_are_cleared() {
		let Ok(base_url) = std::env::var("DATABASE_URL") else {
			eprintln!("DATABASE_URL unset: skipped");
			return;
		};
		// A database of the test's own: `retain` empties the one it is pointed at.
		let admin = PgPool::connect(&base_url).await.unwrap();
		let name = format!("store_test_{}", std::process::id());
		sqlx::query(&format!("create database {name}"))
			.execute(&admin)
			.await
			.unwrap();
		let (server, _) = base_url.rsplit_once('/').unwrap();
		let store = Store::connect(Some(&format!("{server}/{name}"))).await.unwrap();
		let pool = store.pool.as_ref().unwrap();

		for code in ["LIVE", "GONE", "NEW"] {
			store.save(&Lobby::hosted(code.into(), "Ann", 0).unwrap().0).await;
		}
		sqlx::query("update lobbies set updated_at = now() - interval '1 hour' where code <> 'NEW'")
			.execute(pool)
			.await
			.unwrap();

		store.retain(&["LIVE".into()]).await;

		let left: Vec<String> = sqlx::query_scalar("select code from lobbies order by code")
			.fetch_all(pool)
			.await
			.unwrap();
		assert_eq!(left, ["LIVE", "NEW"]);

		pool.close().await;
		sqlx::query(&format!("drop database {name}"))
			.execute(&admin)
			.await
			.unwrap();
	}
}

//! Games in progress, kept so a redeploy does not end them, and so a lobby
//! holds only what every message needs: its rounds and its guesses wait here
//! until they are relayed.

use std::collections::HashMap;
use std::ops::Range;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::TryStreamExt;
use serde_json::value::{RawValue, to_raw_value};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use sqlx::types::Json;
use tokio::time::timeout;
use tracing::{info, warn};

use crate::lobby::Lobby;
use crate::metrics;

/// A lobby waits on the store before telling its players, so this is the
/// longest a database that has stopped answering can hold a move up.
const QUERY_TIMEOUT: Duration = Duration::from_secs(2);
/// After a query that got no answer, how long the store is left alone: the
/// games then stall once in this long rather than on every move. A save
/// carries all its lobby has that the store does not, so the first one
/// through catches it up.
const RETRY_AFTER: Duration = Duration::from_secs(15);

/// What a lobby has for the store that the store has not taken: a save that
/// fails leaves it here for the next.
#[derive(Default)]
pub struct Owed {
	/// A game's rounds, from its start.
	pub rounds: Option<Vec<Box<RawValue>>>,
	pub guesses: Vec<Guess>,
}

pub struct Guess {
	pub round: usize,
	pub player: String,
	pub result: Box<RawValue>,
}

/// A game's rounds, and its guesses by round and by player.
#[derive(Default)]
struct Game {
	rounds: Vec<Box<RawValue>>,
	guesses: Vec<HashMap<String, Box<RawValue>>>,
}

/// Without a database the server still runs, for development: lobbies die
/// with it, and what a database would hold of them is held in memory.
pub struct Store {
	pool: Option<PgPool>,
	down_until: Mutex<Option<Instant>>,
	held: Mutex<HashMap<String, Game>>,
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
			held: Mutex::new(HashMap::new()),
		})
	}

	/// The lobby, and what it owes with it. False for a save made while the
	/// store is off, skipped or the one that got no answer: all of it is still
	/// owed.
	pub async fn save(&self, lobby: &Lobby, owed: &mut Owed) -> bool {
		let code = &lobby.code;
		let Some(pool) = &self.pool else {
			self.hold(code, std::mem::take(owed));
			return true;
		};
		// A start goes first: it clears the guesses of the game before it.
		if let Some(rounds) = &owed.rounds {
			let query = sqlx::query(
				"with gone as (delete from guesses where code = $1)
				 insert into lobbies (code, state, rounds) values ($1, $2, $3::json)
				 on conflict (code) do update
				 set state = excluded.state, rounds = excluded.rounds, updated_at = now()",
			)
			.bind(code)
			.bind(Json(lobby))
			.bind(serde_json::to_string(rounds).expect("rounds serialize"));
			self.attempt("game not saved", Some(code), query.execute(pool)).await;
		}
		if !owed.guesses.is_empty() {
			let rounds: Vec<i32> = owed.guesses.iter().map(|guess| guess.round as i32).collect();
			let players: Vec<&str> = owed.guesses.iter().map(|guess| guess.player.as_str()).collect();
			let results: Vec<&str> = owed.guesses.iter().map(|guess| guess.result.get()).collect();
			let query = sqlx::query(
				"with told as (
					insert into guesses (code, round, player, result)
					select $1, round, player, result::json
					from unnest($3::int[], $4::text[], $5::text[]) as told (round, player, result)
					on conflict do nothing
				 )
				 insert into lobbies (code, state) values ($1, $2)
				 on conflict (code) do update set state = excluded.state, updated_at = now()",
			)
			.bind(code)
			.bind(Json(lobby))
			.bind(rounds)
			.bind(players)
			.bind(results);
			self.attempt("guess not saved", Some(code), query.execute(pool)).await;
		} else if owed.rounds.is_none() {
			let query = sqlx::query(
				"insert into lobbies (code, state) values ($1, $2)
				 on conflict (code) do update set state = excluded.state, updated_at = now()",
			)
			.bind(code)
			.bind(Json(lobby));
			self.attempt("lobby not saved", Some(code), query.execute(pool)).await;
		}
		if self.off() {
			return false;
		}
		*owed = Owed::default();
		true
	}

	/// Round `index` of the game as it was started with. `None` when the
	/// store did not answer.
	pub async fn round(&self, code: &str, index: usize) -> Option<Box<RawValue>> {
		let Some(pool) = &self.pool else {
			return self.held.lock().unwrap().get(code)?.rounds.get(index).cloned();
		};
		let query = sqlx::query_scalar::<_, Option<String>>("select (rounds -> $2)::text from lobbies where code = $1")
			.bind(code)
			.bind(index as i32);
		let entry = self
			.attempt("round not read", Some(code), query.fetch_optional(pool))
			.await;
		RawValue::from_string(entry.flatten().flatten()?).ok()
	}

	/// What was guessed in each of `rounds`: an object a round, by player.
	/// `None` when the store did not answer.
	pub async fn guesses(&self, code: &str, rounds: Range<usize>) -> Option<Vec<Box<RawValue>>> {
		let Some(pool) = &self.pool else {
			let held = self.held.lock().unwrap();
			let nobody = HashMap::new();
			let game = held.get(code);
			return rounds
				.map(|round| to_raw_value(game.and_then(|game| game.guesses.get(round)).unwrap_or(&nobody)).ok())
				.collect();
		};
		let query = sqlx::query_as::<_, (i32, String)>(
			"select round, json_object_agg(player, result)::text from guesses
			 where code = $1 and round >= $2 and round < $3
			 group by round",
		)
		.bind(code)
		.bind(rounds.start as i32)
		.bind(rounds.end as i32);
		let told = self
			.attempt("guesses not read", Some(code), query.fetch_all(pool))
			.await?;
		let mut told: HashMap<usize, String> = told
			.into_iter()
			.map(|(round, guesses)| (round as usize, guesses))
			.collect();
		// A round nobody answered has no rows.
		rounds
			.map(|round| RawValue::from_string(told.remove(&round).unwrap_or_else(|| "{}".into())).ok())
			.collect()
	}

	/// The lobby's row, and its guesses with it.
	pub async fn delete(&self, code: &str) {
		let Some(pool) = &self.pool else {
			self.held.lock().unwrap().remove(code);
			return;
		};
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

	fn hold(&self, code: &str, owed: Owed) {
		if owed.rounds.is_none() && owed.guesses.is_empty() {
			return;
		}
		let mut held = self.held.lock().unwrap();
		let game = held.entry(code.to_owned()).or_default();
		if let Some(rounds) = owed.rounds {
			*game = Game {
				rounds,
				guesses: Vec::new(),
			};
		}
		for Guess { round, player, result } in owed.guesses {
			if game.guesses.len() <= round {
				game.guesses.resize_with(round + 1, HashMap::new);
			}
			game.guesses[round].insert(player, result);
		}
	}

	/// Whether the store is being left alone, after a query that got no answer.
	fn off(&self) -> bool {
		self.down_until
			.lock()
			.unwrap()
			.is_some_and(|until| Instant::now() < until)
	}

	/// A query that fails costs a redeploy's safety net, or holds a round's
	/// results up: not the game being played.
	async fn attempt<T>(
		&self,
		failure: &str,
		code: Option<&str>,
		query: impl Future<Output = sqlx::Result<T>>,
	) -> Option<T> {
		if self.off() {
			return None;
		}
		match timeout(QUERY_TIMEOUT, query).await {
			Ok(Ok(done)) => return Some(done),
			Ok(Err(error)) => warn!(code, %error, "{failure}"),
			Err(_) => {
				*self.down_until.lock().unwrap() = Some(Instant::now() + RETRY_AFTER);
				warn!(
					code,
					"{failure}: the database did not answer, and is left alone for a while"
				);
			}
		}
		metrics::store_failure();
		None
	}

	/// Every stored lobby. A row this build cannot read is from an older one
	/// and is dropped: a game in progress is not worth a compatibility path.
	pub async fn load_all(&self) -> Result<Vec<Lobby>, sqlx::Error> {
		let Some(pool) = &self.pool else { return Ok(Vec::new()) };
		// A row at a time: parsed to be read, a row takes several times the
		// memory the lobby then keeps of it.
		let mut rows = sqlx::query_as::<_, (String, serde_json::Value)>("select code, state from lobbies").fetch(pool);
		let mut lobbies = Vec::new();
		while let Some((code, state)) = rows.try_next().await? {
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
	use serde_json::json;

	use super::*;

	/// A database of the test's own: `retain` empties the one it is pointed at.
	struct Scratch {
		admin: PgPool,
		name: String,
		store: Store,
	}

	impl Scratch {
		/// `None` without Postgres: `DATABASE_URL` is set where there is one, as in CI.
		async fn create(test: &str) -> Option<Self> {
			let Ok(base_url) = std::env::var("DATABASE_URL") else {
				eprintln!("DATABASE_URL unset: skipped");
				return None;
			};
			let admin = PgPool::connect(&base_url).await.unwrap();
			let name = format!("store_{test}_{}", std::process::id());
			sqlx::query(&format!("create database {name}"))
				.execute(&admin)
				.await
				.unwrap();
			let (server, _) = base_url.rsplit_once('/').unwrap();
			let store = Store::connect(Some(&format!("{server}/{name}"))).await.unwrap();
			Some(Self { admin, name, store })
		}

		fn pool(&self) -> &PgPool {
			self.store.pool.as_ref().unwrap()
		}

		async fn drop(self) {
			self.pool().close().await;
			sqlx::query(&format!("drop database {}", self.name))
				.execute(&self.admin)
				.await
				.unwrap();
		}
	}

	fn hosted(code: &str) -> Lobby {
		Lobby::hosted(code.into(), "Ann", "a-browser-of-its-own", 0).unwrap().0
	}

	fn guess(round: usize, player: &str, result: serde_json::Value) -> Guess {
		Guess {
			round,
			player: player.into(),
			result: to_raw_value(&result).unwrap(),
		}
	}

	fn rounds(of: serde_json::Value) -> Option<Vec<Box<RawValue>>> {
		serde_json::from_value(of).unwrap()
	}

	/// What was told of a round, read as the page would.
	fn read(told: &[Box<RawValue>]) -> Vec<serde_json::Value> {
		told.iter()
			.map(|round| serde_json::from_str(round.get()).unwrap())
			.collect()
	}

	async fn keeps_a_game(store: &Store) {
		let lobby = hosted("GAME");
		// A lobby the store has not seen, and what it has to keep with it: an
		// outage can hold all of it back.
		let mut owed = Owed {
			rounds: rounds(json!([{ "id": "a" }, "b", 3])),
			guesses: vec![guess(0, "ann", json!({ "points": 7 }))],
		};
		assert!(store.save(&lobby, &mut owed).await);
		assert!(owed.rounds.is_none() && owed.guesses.is_empty());
		let mut unseen = Owed {
			rounds: None,
			guesses: vec![guess(4, "dan", json!(5))],
		};
		assert!(store.save(&hosted("UNSEEN"), &mut unseen).await);
		assert_eq!(
			read(&store.guesses("UNSEEN", 4..5).await.unwrap()),
			[json!({ "dan": 5 })]
		);
		store.delete("UNSEEN").await;
		owed.guesses = vec![guess(0, "bob", json!(1)), guess(2, "ann", json!(2))];
		assert!(store.save(&lobby, &mut owed).await);
		// Another lobby's are its own.
		let mut other = Owed {
			rounds: rounds(json!(["z"])),
			guesses: vec![guess(0, "cat", json!(9))],
		};
		assert!(store.save(&hosted("OTHER"), &mut other).await);

		// As they were sent, to the byte.
		assert_eq!(store.round("GAME", 0).await.unwrap().get(), r#"{"id":"a"}"#);
		assert_eq!(store.round("GAME", 2).await.unwrap().get(), "3");
		assert!(store.round("GAME", 3).await.is_none());
		let told = store.guesses("GAME", 0..3).await.unwrap();
		assert_eq!(
			read(&told),
			[
				json!({ "ann": { "points": 7 }, "bob": 1 }),
				json!({}),
				json!({ "ann": 2 })
			]
		);
		assert!(told[0].get().contains(r#"{"points":7}"#));
		assert_eq!(read(&store.guesses("GAME", 2..3).await.unwrap()), [json!({ "ann": 2 })]);

		// A new game starts from none of the last one's.
		owed.rounds = rounds(json!(["c"]));
		assert!(store.save(&lobby, &mut owed).await);
		assert_eq!(store.round("GAME", 0).await.unwrap().get(), r#""c""#);
		assert_eq!(read(&store.guesses("GAME", 0..1).await.unwrap()), [json!({})]);

		store.delete("OTHER").await;
		assert!(store.round("OTHER", 0).await.is_none());
		assert_eq!(read(&store.guesses("OTHER", 0..1).await.unwrap()), [json!({})]);
	}

	#[tokio::test]
	async fn a_game_s_rounds_and_guesses_are_read_back_without_a_database() {
		keeps_a_game(&Store::connect(None).await.unwrap()).await;
	}

	#[tokio::test]
	async fn a_game_s_rounds_and_guesses_are_read_back_from_the_database() {
		let Some(scratch) = Scratch::create("game").await else {
			return;
		};
		keeps_a_game(&scratch.store).await;
		let rows: i64 = sqlx::query_scalar("select count(*) from guesses")
			.fetch_one(scratch.pool())
			.await
			.unwrap();
		assert_eq!(rows, 0);
		scratch.drop().await;
	}

	#[tokio::test]
	async fn only_old_rows_without_a_lobby_are_cleared() {
		let Some(scratch) = Scratch::create("retain").await else {
			return;
		};
		let (store, pool) = (&scratch.store, scratch.pool());

		for code in ["LIVE", "GONE", "NEW"] {
			store.save(&hosted(code), &mut Owed::default()).await;
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

		scratch.drop().await;
	}
}

//! One lobby's state and rules. No I/O: the clock comes in as an argument.
//!
//! Settings, rounds and guesses are the clients' own JSON. The server owns who
//! is in, whose turn it is to act and when a round closes; the clients draw the
//! rounds and score the guesses.

use std::collections::HashMap;

use rand::Rng;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;
use serde_json::value::{RawValue, to_raw_value};

pub const MAX_PLAYERS: usize = 24;
/// Everyone seated rides in every snapshot, there or not, so a game that
/// keeps taking players in place of the ones who went does not do so for ever.
const MAX_SEATS: usize = 4 * MAX_PLAYERS;
/// The longest game the page offers.
pub const MAX_ROUNDS: usize = 20;
const MAX_NAME_CHARS: usize = 24;
/// What a browser may name itself with: long enough not to be guessed, and
/// short enough to store with every seat.
const IDENTITY_CHARS: std::ops::RangeInclusive<usize> = 16..=64;
const MAX_TIMER_S: f64 = 3600.0;

// Every guess rides in every later snapshot, so these bound a broadcast, and
// with the lobby cap what the server holds. Each leaves room over the largest
// the page sends.
const MAX_SETTINGS_BYTES: usize = 512;
const MAX_ROUND_BYTES: usize = 2 * 1024;
const MAX_GUESS_BYTES: usize = 1024;

/// A guess sent as the clock runs out still has to cross the network.
const DEADLINE_GRACE_MS: u64 = 2_000;
/// Long enough for a phone to come back from a dropped socket, or for everyone
/// to come back from a redeploy: until then a seat, its round and its hosting
/// wait for it.
const AWAY_GRACE_MS: u64 = 20_000;
const EMPTY_TTL_MS: u64 = 5 * 60_000;

/// No 0/O or 1/I: a code is read aloud and typed on a phone.
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN: usize = 6;

pub fn random_code() -> String {
	let mut rng = rand::rng();
	(0..CODE_LEN)
		.map(|_| CODE_ALPHABET[rng.random_range(0..CODE_ALPHABET.len())] as char)
		.collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
	NotFound,
	Full,
	NotHost,
	/// Also what a message about a round already over gets: a second click, or
	/// one that crossed the round closing on its own.
	BadPhase,
	BadRequest,
	AlreadyGuessed,
	/// The server is at its lobby cap.
	Busy,
	/// Proof of a person at the page was needed, and none came that holds.
	Unverified,
}

impl Error {
	pub const ALL: [Self; 8] = [
		Self::NotFound,
		Self::Full,
		Self::NotHost,
		Self::BadPhase,
		Self::BadRequest,
		Self::AlreadyGuessed,
		Self::Busy,
		Self::Unverified,
	];

	/// What a client is sent, and what the error is counted under.
	pub fn name(self) -> &'static str {
		match self {
			Self::NotFound => "not_found",
			Self::Full => "full",
			Self::NotHost => "not_host",
			Self::BadPhase => "bad_phase",
			Self::BadRequest => "bad_request",
			Self::AlreadyGuessed => "already_guessed",
			Self::Busy => "busy",
			Self::Unverified => "unverified",
		}
	}
}

impl Serialize for Error {
	fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
		serializer.serialize_str(self.name())
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
	Lobby,
	Playing,
	Result,
	Final,
}

#[derive(Debug, Serialize, Deserialize)]
struct Player {
	id: String,
	/// The seat's secret: whoever holds it is this player after a reconnect.
	token: String,
	/// What its player's browser names itself, in every lobby it enters: a
	/// join that brings it takes this seat back. Kept from the other players.
	identity: String,
	name: String,
	/// In the game being played, or the one just over: its name stays on that
	/// game's scoreboard, here or not, until the next start. A seat only
	/// waiting for a game holds nothing to be kept for.
	in_game: bool,
	/// Left the game it was in, until its player's return.
	left: bool,
	#[serde(skip)]
	connected: bool,
	/// Unset on a seat read back from the store, which the next tick starts
	/// the clock on: a restart gives everyone the full grace.
	#[serde(skip)]
	gone_since: Option<u64>,
}

impl Player {
	/// Here, or gone too briefly to give up on.
	fn awaited(&self, now: u64) -> bool {
		!self.left
			&& (self.connected
				|| self
					.gone_since
					.is_none_or(|since| now.saturating_sub(since) < AWAY_GRACE_MS))
	}
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Lobby {
	pub code: String,
	host: String,
	players: Vec<Player>,
	phase: Phase,
	settings: Value,
	/// Text, like the guesses: the server reads neither, and parsed JSON takes
	/// up to sixteen times the memory of its text.
	rounds: Vec<Box<RawValue>>,
	round: usize,
	/// Epoch milliseconds, so a deadline survives a restart.
	ends_at: Option<u64>,
	/// Guesses by player id, one map per round begun.
	results: Vec<HashMap<String, Box<RawValue>>>,
	#[serde(skip)]
	empty_since: Option<u64>,
}

#[derive(Serialize)]
pub struct Snapshot<'a> {
	code: &'a str,
	phase: Phase,
	host: &'a str,
	players: Vec<PlayerView<'a>>,
	settings: &'a Value,
	round: Option<RoundView<'a>>,
	/// Finished rounds only: a round's guesses stay hidden until it closes.
	history: &'a [HashMap<String, Box<RawValue>>],
}

#[derive(Serialize)]
struct PlayerView<'a> {
	id: &'a str,
	name: &'a str,
	connected: bool,
}

#[derive(Serialize)]
struct RoundView<'a> {
	index: usize,
	total: usize,
	entry: &'a RawValue,
	ends_at: Option<u64>,
	guessed: Vec<&'a str>,
}

/// The client's JSON as it is kept, if it is small enough to relay, and
/// storable: Postgres's jsonb refuses a NUL, and one refused write would leave
/// the stored lobby stale for the rest of the game.
fn kept(value: &Value, max_bytes: usize) -> Option<Box<RawValue>> {
	let json = to_raw_value(value).ok()?;
	let fits = json.get().len() <= max_bytes && !json.get().contains("\\u0000");
	fits.then_some(json)
}

fn random_hex(bytes: usize) -> String {
	let mut rng = rand::rng();
	(0..bytes).map(|_| format!("{:02x}", rng.random::<u8>())).collect()
}

/// The name as a seat shows it, or `BadRequest` for one that leaves nothing to show.
pub fn clean_name(name: &str) -> Result<String, Error> {
	let name: String = name
		.trim()
		.chars()
		.filter(|c| !c.is_control())
		.take(MAX_NAME_CHARS)
		.collect();
	if name.is_empty() {
		return Err(Error::BadRequest);
	}
	Ok(name)
}

/// `BadRequest` for what no browser of the game names itself.
pub fn check_identity(identity: &str) -> Result<(), Error> {
	let plain = identity.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
	if plain && IDENTITY_CHARS.contains(&identity.len()) {
		Ok(())
	} else {
		Err(Error::BadRequest)
	}
}

fn seat(name: &str, identity: &str) -> Result<Player, Error> {
	check_identity(identity)?;
	Ok(Player {
		id: random_hex(4),
		token: random_hex(16),
		identity: identity.to_owned(),
		name: clean_name(name)?,
		in_game: false,
		left: false,
		connected: false,
		gone_since: None,
	})
}

impl Lobby {
	/// A lobby with its host seated but not yet connected, and the token their
	/// socket takes the seat with. A lobby never exists without a seat.
	pub fn hosted(code: String, name: &str, identity: &str, now: u64) -> Result<(Self, String), Error> {
		let mut host = seat(name, identity)?;
		host.gone_since = Some(now);
		let token = host.token.clone();
		let lobby = Self {
			code,
			host: host.id.clone(),
			players: vec![host],
			phase: Phase::Lobby,
			settings: Value::Object(Default::default()),
			rounds: Vec::new(),
			round: 0,
			ends_at: None,
			results: Vec::new(),
			empty_since: None,
		};
		Ok((lobby, token))
	}

	/// Seats a player, connected, and returns their id. One who has a seat
	/// here already, by their identity, takes it back whatever the phase and
	/// however they left it. Someone new is taken by a game under way from the
	/// round it is on, and seated for the next by one that is over.
	pub fn join(&mut self, name: &str, identity: &str, now: u64) -> Result<String, Error> {
		let mut player = seat(name, identity)?;
		if let Some(back) = self.players.iter_mut().find(|p| p.identity == identity) {
			back.name = player.name;
			back.left = false;
			back.connected = true;
			back.gone_since = None;
			self.empty_since = None;
			return Ok(back.id.clone());
		}
		let awaited = self.players.iter().filter(|p| p.awaited(now)).count();
		if awaited >= MAX_PLAYERS || self.players.len() >= MAX_SEATS {
			return Err(Error::Full);
		}
		player.connected = true;
		player.in_game = matches!(self.phase, Phase::Playing | Phase::Result);
		let id = player.id.clone();
		self.players.push(player);
		self.empty_since = None;
		Ok(id)
	}

	/// Reconnects the seat `token` belongs to and returns its id.
	pub fn rejoin(&mut self, token: &str) -> Result<String, Error> {
		let player = self
			.players
			.iter_mut()
			.find(|p| !p.left && p.token == token)
			.ok_or(Error::NotFound)?;
		player.connected = true;
		player.gone_since = None;
		self.empty_since = None;
		Ok(player.id.clone())
	}

	pub fn token(&self, id: &str) -> Option<&str> {
		self.player(id).map(|p| p.token.as_str())
	}

	/// The seat is kept, and its round held for it, until the grace runs out.
	pub fn disconnect(&mut self, id: &str, now: u64) {
		if let Some(player) = self.players.iter_mut().find(|p| p.id == id) {
			player.connected = false;
			player.gone_since = Some(now);
		}
	}

	pub fn leave(&mut self, id: &str, now: u64) {
		match self.players.iter_mut().find(|p| p.id == id) {
			Some(player) if player.in_game => {
				player.left = true;
				player.connected = false;
			}
			_ => self.players.retain(|p| p.id != id),
		}
		if self.host == id {
			self.promote();
		}
		self.settle(now);
	}

	pub fn set_settings(&mut self, by: &str, settings: Value) -> Result<(), Error> {
		self.host_only(by)?;
		if !matches!(self.phase, Phase::Lobby | Phase::Final) {
			return Err(Error::BadPhase);
		}
		if !settings.is_object() || kept(&settings, MAX_SETTINGS_BYTES).is_none() {
			return Err(Error::BadRequest);
		}
		self.settings = settings;
		Ok(())
	}

	/// Begins a game with whoever is here: seats left or long gone are cleared.
	pub fn start(&mut self, by: &str, settings: Value, rounds: Vec<Value>, now: u64) -> Result<(), Error> {
		if rounds.is_empty() || rounds.len() > MAX_ROUNDS {
			return Err(Error::BadRequest);
		}
		let rounds: Option<Vec<_>> = rounds.iter().map(|round| kept(round, MAX_ROUND_BYTES)).collect();
		let rounds = rounds.ok_or(Error::BadRequest)?;
		self.set_settings(by, settings)?;
		self.players.retain(|p| p.awaited(now));
		for player in &mut self.players {
			player.in_game = true;
		}
		self.rounds = rounds;
		self.results.clear();
		self.begin_round(0, now);
		Ok(())
	}

	/// A guess at round `round`. Naming the round keeps one that arrives late,
	/// or is sent again on a new socket, out of the round opened since.
	pub fn guess(&mut self, by: &str, round: usize, result: Value, now: u64) -> Result<(), Error> {
		if self.phase != Phase::Playing || round != self.round {
			return Err(Error::BadPhase);
		}
		let result = kept(&result, MAX_GUESS_BYTES).ok_or(Error::BadRequest)?;
		let guesses = &mut self.results[self.round];
		if guesses.contains_key(by) {
			return Err(Error::AlreadyGuessed);
		}
		guesses.insert(by.to_owned(), result);
		self.settle(now);
		Ok(())
	}

	/// The host closing round `round` early, so one idle player cannot hold an
	/// untimed game.
	pub fn close_round(&mut self, by: &str, round: usize) -> Result<(), Error> {
		self.host_only(by)?;
		if self.phase != Phase::Playing || round != self.round {
			return Err(Error::BadPhase);
		}
		self.end_round();
		Ok(())
	}

	/// The host moving on from the results of round `round`. Naming the round
	/// keeps a second click from moving on twice.
	pub fn next(&mut self, by: &str, round: usize, now: u64) -> Result<(), Error> {
		self.host_only(by)?;
		if self.phase != Phase::Result || round != self.round {
			return Err(Error::BadPhase);
		}
		if self.round + 1 < self.rounds.len() {
			self.begin_round(self.round + 1, now);
		} else {
			self.phase = Phase::Final;
		}
		Ok(())
	}

	/// What the passing of time alone changes. True when something stored did.
	pub fn tick(&mut self, now: u64) -> bool {
		for player in &mut self.players {
			if !player.connected {
				player.gone_since.get_or_insert(now);
			}
		}

		let mut changed = false;
		if self.phase == Phase::Playing && self.ends_at.is_some_and(|t| now >= t + DEADLINE_GRACE_MS) {
			self.end_round();
			changed = true;
		}
		changed |= self.settle(now);

		// A seat waiting for a game holds nothing worth keeping a ghost for; one
		// that was in the last holds a name on its scoreboard.
		let seats = self.players.len();
		self.players.retain(|p| p.in_game || p.awaited(now));
		changed |= self.players.len() != seats;

		let host_here = self.player(&self.host).is_some_and(|p| p.awaited(now));
		if !host_here && self.players.iter().any(|p| p.connected) {
			self.promote();
			changed = true;
		}

		if self.players.iter().any(|p| p.connected) {
			self.empty_since = None;
		} else {
			self.empty_since.get_or_insert(now);
		}
		changed
	}

	/// Everyone left, or nobody has been connected for so long that nobody is
	/// coming back.
	pub fn expired(&self, now: u64) -> bool {
		self.players.iter().all(|p| p.left)
			|| self
				.empty_since
				.is_some_and(|since| now.saturating_sub(since) >= EMPTY_TTL_MS)
	}

	pub fn snapshot(&self) -> Snapshot<'_> {
		let in_round = matches!(self.phase, Phase::Playing | Phase::Result);
		let finished = match self.phase {
			Phase::Playing => self.round,
			_ => self.results.len(),
		};
		Snapshot {
			code: &self.code,
			phase: self.phase,
			host: &self.host,
			players: self
				.players
				.iter()
				.map(|p| PlayerView {
					id: &p.id,
					name: &p.name,
					connected: p.connected,
				})
				.collect(),
			settings: &self.settings,
			round: in_round.then(|| RoundView {
				index: self.round,
				total: self.rounds.len(),
				entry: &self.rounds[self.round],
				ends_at: self.ends_at,
				guessed: self.results[self.round].keys().map(String::as_str).collect(),
			}),
			history: &self.results[..finished],
		}
	}

	fn player(&self, id: &str) -> Option<&Player> {
		self.players.iter().find(|p| p.id == id && !p.left)
	}

	fn host_only(&self, by: &str) -> Result<(), Error> {
		if self.host == by { Ok(()) } else { Err(Error::NotHost) }
	}

	/// Whoever is here, in joining order; failing that, whoever may come back.
	fn promote(&mut self) {
		let seated = || self.players.iter().filter(|p| !p.left);
		self.host = seated()
			.find(|p| p.connected)
			.or_else(|| seated().next())
			.map(|p| p.id.clone())
			.unwrap_or_default();
	}

	fn begin_round(&mut self, index: usize, now: u64) {
		let timer = self.settings.get("timer").and_then(Value::as_f64).filter(|s| *s > 0.0);
		self.round = index;
		self.results.push(HashMap::new());
		self.ends_at = timer.map(|s| now + (s.min(MAX_TIMER_S) * 1000.0) as u64);
		self.phase = Phase::Playing;
	}

	fn end_round(&mut self) {
		self.phase = Phase::Result;
		self.ends_at = None;
	}

	/// Closes the round once everyone still awaited has guessed, and says so.
	/// With nobody connected it waits instead: whoever comes back should find
	/// their round open.
	fn settle(&mut self, now: u64) -> bool {
		if self.phase != Phase::Playing {
			return false;
		}
		let guesses = &self.results[self.round];
		let anyone_here = self.players.iter().any(|p| p.connected);
		let all_in = self
			.players
			.iter()
			.filter(|p| p.awaited(now))
			.all(|p| guesses.contains_key(&p.id));
		if anyone_here && all_in {
			self.end_round();
		}
		anyone_here && all_in
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;

	/// What the browser of the player of that name calls itself.
	fn who(name: &str) -> String {
		format!("{name:-<16}")
	}

	/// A lobby of connected players, the first of them hosting.
	fn lobby_of(names: &[&str]) -> (Lobby, Vec<String>) {
		let (mut lobby, token) = Lobby::hosted("ABCDEF".into(), names[0], &who(names[0]), 0).unwrap();
		let mut ids = vec![lobby.rejoin(&token).unwrap()];
		ids.extend(names[1..].iter().map(|name| lobby.join(name, &who(name), 0).unwrap()));
		(lobby, ids)
	}

	fn started(names: &[&str], timer: u64, rounds: usize) -> (Lobby, Vec<String>) {
		let (mut lobby, ids) = lobby_of(names);
		let rounds = (0..rounds).map(|i| json!({ "id": i })).collect();
		lobby.start(&ids[0], json!({ "timer": timer }), rounds, 1_000).unwrap();
		(lobby, ids)
	}

	fn view(lobby: &Lobby) -> Value {
		serde_json::to_value(lobby.snapshot()).unwrap()
	}

	fn seats(lobby: &Lobby) -> usize {
		view(lobby)["players"].as_array().unwrap().len()
	}

	#[test]
	fn the_creator_hosts_and_only_the_host_starts() {
		let (mut lobby, ids) = lobby_of(&["ann", "bob"]);
		assert_eq!(view(&lobby)["host"], json!(ids[0]));
		let start = lobby.start(&ids[1], json!({}), vec![json!(1)], 0);
		assert_eq!(start, Err(Error::NotHost));
		assert_eq!(lobby.set_settings(&ids[1], json!({})), Err(Error::NotHost));
	}

	#[test]
	fn names_are_cleaned_and_required() {
		assert_eq!(
			Lobby::hosted("ABCDEF".into(), "   ", &who("ann"), 0).err(),
			Some(Error::BadRequest)
		);
		let (mut lobby, _) = lobby_of(&["ann"]);
		assert_eq!(lobby.join(" \u{0} ", &who("nul"), 0), Err(Error::BadRequest));
		lobby
			.join(&format!("  b\u{0}{}  ", "x".repeat(40)), &who("b"), 0)
			.unwrap();
		let name = format!("b{}", "x".repeat(MAX_NAME_CHARS - 1));
		assert_eq!(view(&lobby)["players"][1]["name"], json!(name));
	}

	#[test]
	fn a_full_lobby_turns_joiners_away() {
		let names: Vec<String> = (0..MAX_PLAYERS).map(|i| format!("p{i}")).collect();
		let names: Vec<&str> = names.iter().map(String::as_str).collect();
		let (mut lobby, _) = lobby_of(&names);
		assert_eq!(lobby.join("late", &who("late"), 0), Err(Error::Full));
	}

	#[test]
	fn a_game_that_is_over_seats_players_for_the_next_and_keeps_none_who_go() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 1);
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		lobby.guess(&ids[1], 0, json!(1), 0).unwrap();
		lobby.next(&ids[0], 0, 0).unwrap();

		// Looking in and leaving by the door, or by dropping off.
		let late = lobby.join("late", &who("late"), 0).unwrap();
		lobby.leave(&late, 0);
		assert_eq!(seats(&lobby), 2);
		let ghost = lobby.join("ghost", &who("ghost"), 0).unwrap();
		lobby.disconnect(&ghost, 1_000);
		assert!(!lobby.tick(1_000 + AWAY_GRACE_MS - 1));
		assert_eq!(seats(&lobby), 3);
		assert!(lobby.tick(1_000 + AWAY_GRACE_MS));
		assert_eq!(seats(&lobby), 2);

		// Who played stays on the scoreboard; who waits is in the next game.
		lobby.leave(&ids[1], 0);
		let cat = lobby.join("cat", &who("cat"), 0).unwrap();
		lobby.tick(1_000 + AWAY_GRACE_MS);
		assert_eq!(seats(&lobby), 3);
		lobby.start(&ids[0], json!({}), vec![json!(1)], 0).unwrap();
		assert_eq!(view(&lobby)["players"][1]["id"], json!(cat));
		assert_eq!(seats(&lobby), 2);

		// And is in it for good, from then on.
		lobby.leave(&cat, 0);
		assert_eq!(seats(&lobby), 2);
	}

	#[test]
	fn a_game_under_way_takes_a_player_from_the_round_it_is_on() {
		let (mut lobby, ids) = started(&["ann"], 0, 2);
		let late = lobby.join("late", &who("late"), 0).unwrap();

		// The round waits for them as for anyone.
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		assert_eq!(view(&lobby)["phase"], json!("playing"));
		lobby.guess(&late, 0, json!(2), 0).unwrap();
		assert_eq!(view(&lobby)["history"][0][&late], json!(2));

		// And keeps their name when they go, as anyone's.
		lobby.leave(&late, 0);
		assert_eq!(seats(&lobby), 2);
	}

	#[test]
	fn a_game_does_not_take_players_without_end() {
		let (mut lobby, _) = started(&["ann"], 0, 1);
		// Each one who goes for good frees a place among those the game waits on.
		for i in 1..MAX_SEATS {
			let name = format!("p{i}");
			let id = lobby.join(&name, &who(&name), 0).unwrap();
			lobby.leave(&id, 0);
		}
		assert_eq!(seats(&lobby), MAX_SEATS);
		assert_eq!(lobby.join("late", &who("late"), 0), Err(Error::Full));
	}

	#[test]
	fn a_seat_abandoned_before_a_game_is_cleared_and_frees_its_place() {
		let names: Vec<String> = (0..MAX_PLAYERS).map(|i| format!("p{i}")).collect();
		let names: Vec<&str> = names.iter().map(String::as_str).collect();
		let (mut lobby, ids) = lobby_of(&names);
		lobby.disconnect(&ids[3], 1_000);
		assert_eq!(
			lobby.join("late", &who("late"), 1_000 + AWAY_GRACE_MS - 1),
			Err(Error::Full)
		);
		lobby.join("late", &who("late"), 1_000 + AWAY_GRACE_MS).unwrap();

		assert!(lobby.tick(1_000 + AWAY_GRACE_MS));
		assert_eq!(seats(&lobby), MAX_PLAYERS);
	}

	#[test]
	fn a_round_closes_when_everyone_has_guessed_and_hides_guesses_until_then() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 2);
		lobby.guess(&ids[0], 0, json!({ "points": 10 }), 0).unwrap();
		assert_eq!(lobby.guess(&ids[0], 0, json!({}), 0), Err(Error::AlreadyGuessed));

		let open = view(&lobby);
		assert_eq!(open["phase"], json!("playing"));
		assert_eq!(open["round"]["guessed"], json!([ids[0]]));
		assert_eq!(open["history"], json!([]));

		lobby.guess(&ids[1], 0, json!({ "points": 20 }), 0).unwrap();
		let closed = view(&lobby);
		assert_eq!(closed["phase"], json!("result"));
		assert_eq!(closed["history"][0][&ids[1]]["points"], json!(20));
	}

	#[test]
	fn the_host_walks_the_game_to_its_end_and_can_start_another() {
		let (mut lobby, ids) = started(&["ann"], 0, 2);
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		lobby.next(&ids[0], 0, 0).unwrap();
		assert_eq!(view(&lobby)["round"]["index"], json!(1));
		lobby.guess(&ids[0], 1, json!(2), 0).unwrap();
		lobby.next(&ids[0], 1, 0).unwrap();

		let done = view(&lobby);
		assert_eq!(done["phase"], json!("final"));
		assert_eq!(done["round"], Value::Null);
		assert_eq!(done["history"].as_array().unwrap().len(), 2);
		assert_eq!(lobby.next(&ids[0], 1, 0), Err(Error::BadPhase));

		lobby.start(&ids[0], json!({}), vec![json!(1)], 0).unwrap();
		assert_eq!(view(&lobby)["history"], json!([]));
	}

	#[test]
	fn a_second_click_or_a_late_one_moves_nothing() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 3);
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		lobby.guess(&ids[1], 0, json!(1), 0).unwrap();

		// The round closed on its own just as the host went to close it.
		assert_eq!(lobby.close_round(&ids[0], 0), Err(Error::BadPhase));
		assert_eq!(view(&lobby)["phase"], json!("result"));

		lobby.next(&ids[0], 0, 0).unwrap();
		assert_eq!(lobby.next(&ids[0], 0, 0), Err(Error::BadPhase));
		let after = view(&lobby);
		assert_eq!(after["phase"], json!("playing"));
		assert_eq!(after["round"]["index"], json!(1));
	}

	#[test]
	fn a_guess_for_a_round_gone_by_does_not_answer_the_next() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 2);
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		lobby.close_round(&ids[0], 0).unwrap();
		lobby.next(&ids[0], 0, 0).unwrap();

		// Bob's guess at the first round, arriving after his socket came back.
		assert_eq!(lobby.guess(&ids[1], 0, json!(1), 0), Err(Error::BadPhase));
		assert_eq!(view(&lobby)["round"]["guessed"], json!([]));
		lobby.guess(&ids[1], 1, json!(2), 0).unwrap();
	}

	#[test]
	fn the_host_can_close_a_round_someone_is_sitting_on() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 1);
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		assert_eq!(lobby.close_round(&ids[1], 0), Err(Error::NotHost));
		lobby.close_round(&ids[0], 0).unwrap();
		assert_eq!(view(&lobby)["phase"], json!("result"));
	}

	#[test]
	fn the_clock_closes_a_round_after_its_grace() {
		let (mut lobby, ids) = started(&["ann", "bob"], 60, 1);
		assert_eq!(view(&lobby)["round"]["ends_at"], json!(61_000));
		assert!(!lobby.tick(61_000 + DEADLINE_GRACE_MS - 1));
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		assert!(lobby.tick(61_000 + DEADLINE_GRACE_MS));
		assert_eq!(view(&lobby)["phase"], json!("result"));
		assert_eq!(lobby.guess(&ids[1], 0, json!(1), 0), Err(Error::BadPhase));
	}

	#[test]
	fn a_dropped_player_holds_the_round_for_the_grace_and_keeps_their_seat() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 1);
		let token = lobby.token(&ids[1]).unwrap().to_owned();
		lobby.disconnect(&ids[1], 5_000);
		lobby.guess(&ids[0], 0, json!(1), 5_000).unwrap();
		assert!(!lobby.tick(5_000 + AWAY_GRACE_MS - 1));
		assert_eq!(view(&lobby)["phase"], json!("playing"));

		assert!(lobby.tick(5_000 + AWAY_GRACE_MS));
		assert_eq!(view(&lobby)["phase"], json!("result"));
		assert_eq!(lobby.rejoin(&token), Ok(ids[1].clone()));
		assert_eq!(lobby.rejoin("nope"), Err(Error::NotFound));
	}

	#[test]
	fn a_player_back_within_the_grace_still_gets_their_guess() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 1);
		let token = lobby.token(&ids[1]).unwrap().to_owned();
		lobby.disconnect(&ids[1], 5_000);
		lobby.guess(&ids[0], 0, json!(1), 5_000).unwrap();
		lobby.rejoin(&token).unwrap();
		assert!(!lobby.tick(5_000 + AWAY_GRACE_MS));
		lobby.guess(&ids[1], 0, json!(2), 5_000 + AWAY_GRACE_MS).unwrap();
		assert_eq!(view(&lobby)["history"][0][&ids[1]], json!(2));
	}

	#[test]
	fn an_empty_lobby_keeps_its_round_open_then_expires() {
		let (mut lobby, ids) = started(&["ann"], 0, 1);
		lobby.disconnect(&ids[0], 5_000);
		lobby.tick(5_000);
		lobby.tick(5_000 + AWAY_GRACE_MS);
		assert_eq!(view(&lobby)["phase"], json!("playing"));
		assert!(!lobby.expired(5_000 + EMPTY_TTL_MS - 1));
		assert!(lobby.expired(5_000 + EMPTY_TTL_MS));
	}

	#[test]
	fn coming_back_stops_the_expiry_at_once() {
		let (mut lobby, ids) = started(&["ann"], 0, 1);
		let token = lobby.token(&ids[0]).unwrap().to_owned();
		lobby.disconnect(&ids[0], 5_000);
		lobby.tick(5_000);
		lobby.rejoin(&token).unwrap();
		assert!(!lobby.expired(5_000 + EMPTY_TTL_MS));
	}

	#[test]
	fn a_lobby_everyone_left_closes_at_once() {
		let (mut lobby, ids) = lobby_of(&["ann", "bob"]);
		lobby.leave(&ids[0], 0);
		assert!(!lobby.expired(0));
		lobby.leave(&ids[1], 0);
		assert!(lobby.expired(0));

		let (mut lobby, ids) = started(&["ann"], 0, 1);
		lobby.leave(&ids[0], 0);
		assert!(lobby.expired(0));
	}

	#[test]
	fn a_clock_stepping_back_expires_nothing() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 1);
		lobby.disconnect(&ids[0], 50_000);
		lobby.disconnect(&ids[1], 50_000);
		lobby.tick(50_000);
		assert!(!lobby.tick(10_000));
		assert!(!lobby.expired(10_000));
		assert_eq!(view(&lobby)["host"], json!(ids[0]));
	}

	#[test]
	fn a_host_gone_too_long_hands_over_and_one_who_leaves_hands_over_at_once() {
		let (mut lobby, ids) = started(&["ann", "bob", "cat"], 0, 1);
		lobby.disconnect(&ids[0], 1_000);
		assert!(!lobby.tick(1_000 + AWAY_GRACE_MS - 1));
		assert!(lobby.tick(1_000 + AWAY_GRACE_MS));
		assert_eq!(view(&lobby)["host"], json!(ids[1]));

		lobby.leave(&ids[1], 30_000);
		assert_eq!(view(&lobby)["host"], json!(ids[2]));
	}

	#[test]
	fn leaving_once_a_game_has_begun_keeps_the_name_until_the_next_start() {
		let (mut lobby, ids) = started(&["ann", "bob", "cat"], 0, 1);
		let token = lobby.token(&ids[1]).unwrap().to_owned();
		// With no answer to its name: a seat is not kept for its score.
		lobby.leave(&ids[1], 0);
		assert_eq!(seats(&lobby), 3);
		assert_eq!(lobby.rejoin(&token), Err(Error::NotFound));

		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		lobby.guess(&ids[2], 0, json!(1), 0).unwrap();
		lobby.next(&ids[0], 0, 0).unwrap();
		// The scoreboard is where a name matters most.
		lobby.leave(&ids[2], 0);
		lobby.tick(AWAY_GRACE_MS);
		assert_eq!(seats(&lobby), 3);

		lobby.start(&ids[0], json!({}), vec![json!(1)], 0).unwrap();
		assert_eq!(seats(&lobby), 1);
	}

	#[test]
	fn a_player_who_comes_in_again_takes_their_own_seat() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 2);
		lobby.guess(&ids[1], 0, json!(7), 0).unwrap();
		lobby.leave(&ids[1], 0);

		// By the invite once more, under another name: the seat they had.
		assert_eq!(lobby.join("bobby", &who("bob"), 0), Ok(ids[1].clone()));
		assert_eq!(seats(&lobby), 2);
		let back = &view(&lobby)["players"][1];
		assert_eq!((&back["name"], &back["connected"]), (&json!("bobby"), &json!(true)));

		// Their guess still stands, and the next round waits for them again.
		lobby.guess(&ids[0], 0, json!(1), 0).unwrap();
		assert_eq!(view(&lobby)["history"][0][&ids[1]], json!(7));
		lobby.next(&ids[0], 0, 0).unwrap();
		lobby.guess(&ids[0], 1, json!(1), 0).unwrap();
		assert_eq!(view(&lobby)["phase"], json!("playing"));
		lobby.guess(&ids[1], 1, json!(1), 0).unwrap();
		lobby.next(&ids[0], 1, 0).unwrap();

		// A game that is over gives them their place on its scoreboard back.
		lobby.leave(&ids[1], 0);
		assert_eq!(lobby.join("bob", &who("bob"), 0), Ok(ids[1].clone()));
		assert_eq!(seats(&lobby), 2);
	}

	#[test]
	fn an_identity_is_kept_from_the_other_players_and_what_is_not_one_is_refused() {
		let (lobby, _) = lobby_of(&["ann", "bob"]);
		assert!(!view(&lobby).to_string().contains(&who("ann")));

		let long = "x".repeat(65);
		for identity in [
			"",
			"short",
			long.as_str(),
			"with a space in it",
			"nul\u{0}in-the-middle",
		] {
			let hosted = Lobby::hosted("ABCDEF".into(), "ann", identity, 0);
			assert_eq!(hosted.err(), Some(Error::BadRequest), "{identity:?}");
		}
	}

	#[test]
	fn a_seat_dropped_mid_game_is_kept_for_its_return() {
		let (mut lobby, ids) = started(&["ann", "bob"], 0, 2);
		let token = lobby.token(&ids[1]).unwrap().to_owned();
		lobby.disconnect(&ids[1], 1_000);
		lobby.tick(1_000 + AWAY_GRACE_MS);
		assert_eq!(seats(&lobby), 2);
		assert_eq!(lobby.rejoin(&token), Ok(ids[1].clone()));
	}

	#[test]
	fn what_cannot_be_relayed_or_stored_is_refused() {
		let (mut lobby, ids) = lobby_of(&["ann"]);
		let big = json!("x".repeat(MAX_ROUND_BYTES));
		assert_eq!(lobby.start(&ids[0], json!({}), vec![big], 0), Err(Error::BadRequest));
		assert_eq!(lobby.start(&ids[0], json!({}), vec![], 0), Err(Error::BadRequest));
		let long = vec![json!(1); MAX_ROUNDS + 1];
		assert_eq!(lobby.start(&ids[0], json!({}), long, 0), Err(Error::BadRequest));
		assert_eq!(
			lobby.start(&ids[0], json!([]), vec![json!(1)], 0),
			Err(Error::BadRequest)
		);
		assert_eq!(
			lobby.set_settings(&ids[0], json!({ "a": "\u{0}" })),
			Err(Error::BadRequest)
		);

		let (mut lobby, ids) = started(&["ann"], 0, 1);
		let big = json!("x".repeat(MAX_GUESS_BYTES));
		assert_eq!(lobby.guess(&ids[0], 0, big, 0), Err(Error::BadRequest));
		assert_eq!(lobby.guess(&ids[0], 0, json!("a\u{0}b"), 0), Err(Error::BadRequest));
	}

	#[test]
	fn a_stored_lobby_comes_back_mid_round_and_waits_for_its_players() {
		let (mut lobby, ids) = started(&["ann", "bob"], 60, 3);
		lobby.guess(&ids[0], 0, json!({ "points": 7 }), 2_000).unwrap();
		let ann = lobby.token(&ids[0]).unwrap().to_owned();
		let bob = lobby.token(&ids[1]).unwrap().to_owned();

		let stored = serde_json::to_value(&lobby).unwrap();
		let mut back: Lobby = serde_json::from_value(stored).unwrap();
		let restored = view(&back);
		assert_eq!(restored["round"]["ends_at"], json!(61_000));
		assert_eq!(restored["round"]["guessed"], json!([ids[0]]));
		assert_eq!(restored["players"][0]["connected"], json!(false));

		// Ann, who had guessed, is back first: the round still waits for Bob.
		back.tick(10_000);
		back.rejoin(&ann).unwrap();
		assert!(!back.tick(10_000 + AWAY_GRACE_MS - 1));
		assert_eq!(view(&back)["phase"], json!("playing"));

		assert_eq!(back.rejoin(&bob), Ok(ids[1].clone()));
		back.guess(&ids[1], 0, json!({ "points": 9 }), 12_000).unwrap();
		assert_eq!(view(&back)["phase"], json!("result"));
	}
}

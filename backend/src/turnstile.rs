//! Proof that a person is at the page: a Turnstile token, which Cloudflare vouches for.

use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tokio::time::timeout;
use tracing::{error, info};

use crate::lobby::Error;
use crate::metrics;

pub const SITEVERIFY: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/// Cloudflare's own cap: anything longer is not one of its tokens.
const MAX_TOKEN_BYTES: usize = 2048;
const TIMEOUT: Duration = Duration::from_secs(3);
/// The rest wait their turn. Unbounded, a flood of made-up tokens would time
/// its own checks out, and a check that cannot be made lets its visitor in.
const CHECKS_AT_ONCE: usize = 32;
/// Under `TIMEOUT`, so a turn that did not come is not one that was about to.
const TURN_TIMEOUT: Duration = Duration::from_secs(2);
const UNKNOWN_SECRET: [&str; 2] = ["missing-input-secret", "invalid-input-secret"];
/// Refusals that are about this server or Cloudflare, and say nothing of the visitor.
const NOT_THE_VISITOR: [&str; 3] = ["missing-input-secret", "invalid-input-secret", "internal-error"];

pub struct Turnstile {
	pub secret: String,
	/// `SITEVERIFY`, or a test's stand-in for it.
	pub verify_url: String,
	/// What is refused without proof. The rest is checked, logged and let in.
	pub require: Vec<Action>,
}

/// The two openings that make something: a lobby, or a seat in one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
	Create,
	Join,
}

impl Action {
	pub const ALL: [Self; 2] = [Self::Create, Self::Join];

	/// As the page names it to Cloudflare, and `TURNSTILE_REQUIRE` to the server.
	pub fn name(self) -> &'static str {
		match self {
			Self::Create => "create",
			Self::Join => "join",
		}
	}
}

impl FromStr for Action {
	type Err = String;

	fn from_str(name: &str) -> Result<Self, String> {
		Self::ALL
			.into_iter()
			.find(|action| action.name() == name)
			.ok_or_else(|| format!("{name:?} is not something to require proof for: create, join"))
	}
}

#[derive(Debug, PartialEq, Eq)]
pub enum Proof {
	Held,
	Absent,
	/// Cloudflare does not vouch for it: made up, expired, already used, or
	/// made for the other opening.
	Refused,
	/// Cloudflare could not be asked.
	Unchecked,
}

impl Proof {
	pub const ALL: [Self; 4] = [Self::Held, Self::Absent, Self::Refused, Self::Unchecked];

	pub fn name(&self) -> &'static str {
		match self {
			Self::Held => "held",
			Self::Absent => "absent",
			Self::Refused => "refused",
			Self::Unchecked => "unchecked",
		}
	}
}

/// What a token says before anyone is asked: `Err` when that settles it.
fn at_sight(token: Option<&str>) -> Result<&str, Proof> {
	match token {
		None | Some("") => Err(Proof::Absent),
		Some(token) if token.len() > MAX_TOKEN_BYTES => Err(Proof::Refused),
		Some(token) => Ok(token),
	}
}

fn note(action: Action, proof: &Proof, refused: bool) {
	metrics::proof(action, proof);
	if *proof != Proof::Held {
		info!(?action, ?proof, refused, "no proof of a person");
	}
}

#[derive(Serialize)]
struct Claim<'a> {
	secret: &'a str,
	response: &'a str,
}

#[derive(Deserialize)]
struct Verdict {
	success: bool,
	#[serde(rename = "error-codes", default)]
	error_codes: Vec<String>,
	/// What the page said the token was for. Cloudflare's test keys say nothing.
	action: Option<String>,
}

impl Verdict {
	fn blames(&self, codes: &[&str]) -> bool {
		self.error_codes.iter().any(|code| codes.contains(&code.as_str()))
	}
}

pub struct Verifier {
	config: Turnstile,
	client: reqwest::Client,
	turns: Semaphore,
}

impl Verifier {
	pub fn new(config: Turnstile) -> Result<Self, reqwest::Error> {
		Ok(Self {
			config,
			client: reqwest::Client::builder().timeout(TIMEOUT).build()?,
			turns: Semaphore::new(CHECKS_AT_ONCE),
		})
	}

	/// `Err` for a secret Cloudflare does not know. Running on one would pass
	/// for an outage: every made-up token let in, and only the visitor with
	/// none refused.
	pub async fn knows_secret(&self) -> Result<(), String> {
		match self.verdict("startup").await {
			Ok(verdict) if verdict.blames(&UNKNOWN_SECRET) => Err("Cloudflare does not know TURNSTILE_SECRET".into()),
			Ok(_) => Ok(()),
			Err(error) => {
				error!(%error, "turnstile did not answer: its secret goes unchecked");
				Ok(())
			}
		}
	}

	/// `Unverified` for an opening that needed proof and has none that holds,
	/// `Busy` for one there was no turn to check.
	pub async fn admit(self: &Arc<Self>, action: Action, token: Option<String>) -> Result<(), Error> {
		let seen = at_sight(token.as_deref());
		if !self.config.require.contains(&action) {
			match seen {
				Err(proof) => note(action, &proof, false),
				// Nobody waits on an answer that refuses nobody, and it takes
				// no turn from one that might: with none free it goes unasked.
				Ok(_) => {
					let watcher = self.clone();
					tokio::spawn(async move {
						if let (Ok(_turn), Some(token)) = (watcher.turns.try_acquire(), &token) {
							note(action, &watcher.ask(action, token).await, false);
						}
					});
				}
			}
			return Ok(());
		}
		let proof = match seen {
			Err(proof) => proof,
			Ok(token) => {
				// A flood is turned away: waiting it out would hold every
				// socket in it open, and timing it out would let it in.
				let Ok(Ok(_turn)) = timeout(TURN_TIMEOUT, self.turns.acquire()).await else {
					info!(?action, "no turn to check a proof");
					return Err(Error::Busy);
				};
				self.ask(action, token).await
			}
		};
		// Unchecked gets in: Cloudflare being down costs the check, not the game.
		let refused = matches!(proof, Proof::Absent | Proof::Refused);
		note(action, &proof, refused);
		if refused { Err(Error::Unverified) } else { Ok(()) }
	}

	async fn ask(&self, action: Action, token: &str) -> Proof {
		match self.verdict(token).await {
			Ok(verdict) if verdict.success => match verdict.action.as_deref() {
				Some(made_for) if !made_for.is_empty() && made_for != action.name() => Proof::Refused,
				_ => Proof::Held,
			},
			Ok(verdict) if verdict.blames(&NOT_THE_VISITOR) => {
				error!(codes = ?verdict.error_codes, "turnstile refused this server");
				Proof::Unchecked
			}
			Ok(_) => Proof::Refused,
			Err(error) => {
				error!(%error, "turnstile did not answer");
				Proof::Unchecked
			}
		}
	}

	async fn verdict(&self, token: &str) -> Result<Verdict, reqwest::Error> {
		let claim = Claim {
			secret: &self.config.secret,
			response: token,
		};
		let answer = self.client.post(&self.config.verify_url).json(&claim).send().await?;
		answer.json().await
	}
}

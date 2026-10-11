//! Multiplayer lobbies over WebSockets: the relay between the players of a game.

use std::sync::Arc;

use axum::Router;
use axum::http::header;
use axum::routing::get;
use tokio::sync::Semaphore;
use tracing::info;

mod lobby;
mod metrics;
mod protocol;
mod registry;
mod store;
mod turnstile;
mod ws;

use registry::Registry;
use store::Store;
use turnstile::Verifier;
pub use turnstile::{Action, SITEVERIFY, Turnstile};
pub use ws::MAX_SOCKETS;

pub struct Config {
	/// Unset, lobbies live in memory only and end with the process.
	pub database_url: Option<String>,
	/// Origins a browser may connect from. Empty allows any, for development.
	pub allowed_origins: Vec<String>,
	/// Unset, nobody is asked for proof that they are a person.
	pub turnstile: Option<Turnstile>,
	/// Sockets open at once before more are refused: `MAX_SOCKETS`, deployed.
	pub max_sockets: usize,
}

struct App {
	registry: Arc<Registry>,
	origins: Vec<String>,
	turnstile: Option<Arc<Verifier>>,
	/// A place for each socket that may still open.
	sockets: Arc<Semaphore>,
}

pub async fn app(config: Config) -> Result<Router, Box<dyn std::error::Error + Send + Sync>> {
	let store = Store::connect(config.database_url.as_deref()).await?;
	let registry = Registry::new(store);
	let restored = registry.restore().await?;
	info!(restored, "lobbies restored");
	tokio::spawn(registry.clone().reconcile());

	let turnstile = match config.turnstile {
		Some(config) => {
			let verifier = Verifier::new(config)?;
			verifier.knows_secret().await?;
			Some(Arc::new(verifier))
		}
		None => None,
	};
	let app = Arc::new(App {
		registry,
		origins: config.allowed_origins,
		turnstile,
		sockets: Arc::new(Semaphore::new(config.max_sockets)),
	});
	Ok(Router::new()
		.route("/ws", get(ws::upgrade))
		.route("/healthz", get(|| async { "ok" }))
		.with_state(app))
}

/// The server's counts. For a listener of their own: whatever `app` serves is
/// open to anyone.
pub fn metrics() -> Router {
	let read = || async { ([(header::CONTENT_TYPE, prometheus::TEXT_FORMAT)], metrics::render()) };
	Router::new().route("/metrics", get(read))
}

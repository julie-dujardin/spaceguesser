//! Multiplayer lobbies over WebSockets: the relay between the players of a game.

use std::sync::Arc;

use axum::Router;
use axum::routing::get;
use tracing::info;

mod lobby;
mod protocol;
mod registry;
mod store;
mod ws;

use registry::Registry;
use store::Store;

pub struct Config {
	/// Unset, lobbies live in memory only and end with the process.
	pub database_url: Option<String>,
	/// Origins a browser may connect from. Empty allows any, for development.
	pub allowed_origins: Vec<String>,
}

struct App {
	registry: Arc<Registry>,
	origins: Vec<String>,
}

pub async fn app(config: Config) -> Result<Router, Box<dyn std::error::Error + Send + Sync>> {
	let store = Store::connect(config.database_url.as_deref()).await?;
	let registry = Registry::new(store);
	let restored = registry.restore().await?;
	info!(restored, "lobbies restored");
	tokio::spawn(registry.clone().reconcile());

	let app = Arc::new(App {
		registry,
		origins: config.allowed_origins,
	});
	Ok(Router::new()
		.route("/ws", get(ws::upgrade))
		.route("/healthz", get(|| async { "ok" }))
		.with_state(app))
}

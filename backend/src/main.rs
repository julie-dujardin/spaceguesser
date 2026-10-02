use std::env;

use spaceguesser_backend::{Config, app};
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
	tracing_subscriber::fmt::init();

	let config = Config {
		database_url: env::var("DATABASE_URL").ok().filter(|url| !url.is_empty()),
		allowed_origins: env::var("ALLOWED_ORIGINS")
			.unwrap_or_default()
			.split(',')
			.map(|origin| origin.trim().to_owned())
			.filter(|origin| !origin.is_empty())
			.collect(),
	};
	let bind = env::var("BIND").unwrap_or_else(|_| "127.0.0.1:8787".into());

	let router = app(config).await?;
	let listener = TcpListener::bind(&bind).await?;
	info!(bind, "listening");

	// Every change is already stored, so stopping is just stopping: waiting on
	// open sockets would hold a redeploy for as long as a game lasts.
	let mut terminate = signal(SignalKind::terminate())?;
	tokio::select! {
		served = axum::serve(listener, router) => served?,
		_ = terminate.recv() => {}
		_ = tokio::signal::ctrl_c() => {}
	}
	Ok(())
}

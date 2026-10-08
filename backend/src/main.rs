use std::env;

use spaceguesser_backend::{Action, Config, SITEVERIFY, Turnstile, app};
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};
use tracing::info;

/// The items of a comma-separated variable; none when it is unset.
fn list(variable: &str) -> Vec<String> {
	env::var(variable)
		.unwrap_or_default()
		.split(',')
		.map(|item| item.trim().to_owned())
		.filter(|item| !item.is_empty())
		.collect()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
	tracing_subscriber::fmt::init();

	let require = list("TURNSTILE_REQUIRE")
		.iter()
		.map(|action| action.parse())
		.collect::<Result<Vec<Action>, _>>()?;
	let secret = env::var("TURNSTILE_SECRET").ok().filter(|secret| !secret.is_empty());
	// Starting anyway would leave open a door the configuration says is shut.
	if secret.is_none() && !require.is_empty() {
		return Err("TURNSTILE_REQUIRE needs TURNSTILE_SECRET".into());
	}

	let config = Config {
		database_url: env::var("DATABASE_URL").ok().filter(|url| !url.is_empty()),
		allowed_origins: list("ALLOWED_ORIGINS"),
		turnstile: secret.map(|secret| Turnstile {
			secret,
			verify_url: SITEVERIFY.into(),
			require,
		}),
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

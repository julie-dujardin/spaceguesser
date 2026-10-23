//! The daily challenge as a page asks for it.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use reqwest::header::{ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN};
use spaceguesser_backend::{Config, MAX_SOCKETS, app, utc_day};
use tokio::net::TcpListener;

const SITE: &str = "https://spaceguesser.example";

async fn serve(daily_dir: Option<PathBuf>, allowed_origins: Vec<String>) -> String {
	let router = app(Config {
		database_url: None,
		allowed_origins,
		turnstile: None,
		max_sockets: MAX_SOCKETS,
		daily_dir,
	})
	.await
	.unwrap();
	let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
	let url = format!("http://{}/daily.json", listener.local_addr().unwrap());
	tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
	url
}

/// An empty folder for one test.
fn folder(test: &str) -> PathBuf {
	let dir = std::env::temp_dir().join(format!("spaceguesser-daily-{test}-{}", std::process::id()));
	let _ = fs::remove_dir_all(&dir);
	fs::create_dir_all(&dir).unwrap();
	dir
}

fn write_day(dir: &Path, day: &str) {
	fs::write(dir.join(format!("{day}.json")), format!(r#"{{"day":"{day}"}}"#)).unwrap();
}

#[tokio::test]
async fn serves_the_current_day_only() {
	let dir = folder("current");
	let today = utc_day(SystemTime::now());
	let tomorrow = utc_day(SystemTime::now() + Duration::from_secs(86_400));
	write_day(&dir, &today);
	write_day(&dir, &tomorrow);
	let url = serve(Some(dir.clone()), Vec::new()).await;

	let answer = reqwest::get(&url).await.unwrap();
	assert_eq!(answer.status(), 200);
	assert_eq!(answer.headers()["content-type"], "application/json");
	assert_eq!(answer.text().await.unwrap(), format!(r#"{{"day":"{today}"}}"#));

	fs::remove_file(dir.join(format!("{today}.json"))).unwrap();
	assert_eq!(reqwest::get(&url).await.unwrap().status(), 404);
	fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn no_folder_is_no_challenge() {
	let url = serve(None, Vec::new()).await;
	assert_eq!(reqwest::get(&url).await.unwrap().status(), 404);
}

#[tokio::test]
async fn names_only_an_allowed_origin() {
	let dir = folder("origin");
	write_day(&dir, &utc_day(SystemTime::now()));
	let url = serve(Some(dir.clone()), vec![SITE.into()]).await;
	let client = reqwest::Client::new();

	let allowed = client.get(&url).header(ORIGIN, SITE).send().await.unwrap();
	assert_eq!(allowed.status(), 200);
	assert_eq!(allowed.headers()[ACCESS_CONTROL_ALLOW_ORIGIN], SITE);

	let other = client
		.get(&url)
		.header(ORIGIN, "https://other.example")
		.send()
		.await
		.unwrap();
	assert!(other.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN).is_none());

	// The page reads a missing day as none today, not as a failed request.
	fs::remove_dir_all(&dir).unwrap();
	let missing = client.get(&url).header(ORIGIN, SITE).send().await.unwrap();
	assert_eq!(missing.status(), 404);
	assert_eq!(missing.headers()[ACCESS_CONTROL_ALLOW_ORIGIN], SITE);
}

#[tokio::test]
async fn any_origin_in_development() {
	let dir = folder("any");
	write_day(&dir, &utc_day(SystemTime::now()));
	let url = serve(Some(dir.clone()), Vec::new()).await;
	let answer = reqwest::Client::new()
		.get(&url)
		.header(ORIGIN, SITE)
		.send()
		.await
		.unwrap();
	assert_eq!(answer.headers()[ACCESS_CONTROL_ALLOW_ORIGIN], "*");
	fs::remove_dir_all(&dir).unwrap();
}

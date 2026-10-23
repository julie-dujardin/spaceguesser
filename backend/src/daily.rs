//! The daily challenge: one file per UTC day in a folder. Only the file of the
//! current day goes out, so nobody can read a later day before it starts.

use std::io::ErrorKind;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use tracing::warn;

use crate::App;

/// The UTC date of `at`, as `YYYY-MM-DD`.
pub fn utc_day(at: SystemTime) -> String {
	let days = at
		.duration_since(UNIX_EPOCH)
		.map_or(0, |since| since.as_secs() / 86_400) as i64;
	// Howard Hinnant's `civil_from_days`.
	let z = days + 719_468;
	let era = z.div_euclid(146_097);
	let doe = z.rem_euclid(146_097);
	let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
	let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
	let mp = (5 * doy + 2) / 153;
	let day = doy - (153 * mp + 2) / 5 + 1;
	let month = if mp < 10 { mp + 3 } else { mp - 9 };
	let year = yoe + era * 400 + i64::from(month <= 2);
	format!("{year:04}-{month:02}-{day:02}")
}

pub async fn today(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
	let mut response = match &app.daily_dir {
		None => StatusCode::NOT_FOUND.into_response(),
		Some(dir) => {
			let path = dir.join(format!("{}.json", utc_day(SystemTime::now())));
			match tokio::fs::read(&path).await {
				Ok(body) => (
					[
						(header::CONTENT_TYPE, "application/json"),
						// A corrected file reaches everyone at once.
						(header::CACHE_CONTROL, "no-cache"),
					],
					body,
				)
					.into_response(),
				Err(error) if error.kind() == ErrorKind::NotFound => StatusCode::NOT_FOUND.into_response(),
				Err(error) => {
					warn!(%error, path = %path.display(), "daily challenge unreadable");
					StatusCode::INTERNAL_SERVER_ERROR.into_response()
				}
			}
		}
	};
	// The page is on another host. A 404 gets the header too, so that the page
	// can read it as no challenge today.
	let origin = headers.get(header::ORIGIN).and_then(|o| o.to_str().ok());
	let allowed = if app.origins.is_empty() {
		Some("*")
	} else {
		origin.filter(|o| app.origins.iter().any(|allowed| allowed == o))
	};
	let headers = response.headers_mut();
	if let Some(allowed) = allowed.and_then(|a| HeaderValue::from_str(a).ok()) {
		headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, allowed);
	}
	if !app.origins.is_empty() {
		headers.insert(header::VARY, HeaderValue::from_static("Origin"));
	}
	response
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use super::*;

	fn day_at(seconds: u64) -> String {
		utc_day(UNIX_EPOCH + Duration::from_secs(seconds))
	}

	#[test]
	fn dates_by_the_calendar() {
		assert_eq!(day_at(0), "1970-01-01");
		assert_eq!(day_at(86_399), "1970-01-01");
		assert_eq!(day_at(86_400), "1970-01-02");
		assert_eq!(day_at(951_782_400), "2000-02-29");
		assert_eq!(day_at(951_868_800), "2000-03-01");
		assert_eq!(day_at(1_709_164_800), "2024-02-29");
		assert_eq!(day_at(1_798_761_599), "2026-12-31");
		assert_eq!(day_at(1_798_761_600), "2027-01-01");
	}
}

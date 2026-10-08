//! What the server counts about itself, in the text Prometheus reads.

use std::sync::LazyLock;

use prometheus::{
	IntCounter, IntCounterVec, IntGauge, TextEncoder, register_int_counter, register_int_counter_vec,
	register_int_gauge,
};

use crate::lobby::Error;
use crate::registry::MAX_LOBBIES;
use crate::turnstile::{Action, Proof};

struct Metrics {
	lobbies: IntGauge,
	sockets: IntGauge,
	proofs: IntCounterVec,
	errors: IntCounterVec,
	store_failures: IntCounter,
}

/// The process's, like the registry they are read from: two servers in one
/// process count as one.
static METRICS: LazyLock<Metrics> = LazyLock::new(|| {
	let named = "metric names are valid, and each is registered once";
	register_int_gauge!(
		"spaceguesser_max_lobbies",
		"Lobbies the server opens before it refuses more."
	)
	.expect(named)
	.set(MAX_LOBBIES as i64);
	let metrics = Metrics {
		lobbies: register_int_gauge!("spaceguesser_lobbies", "Lobbies open.").expect(named),
		sockets: register_int_gauge!("spaceguesser_sockets", "Sockets open.").expect(named),
		proofs: register_int_counter_vec!(
			"spaceguesser_proofs_total",
			"Proofs of a person, by the opening they came with and what they were found to be.",
			&["action", "proof"]
		)
		.expect(named),
		errors: register_int_counter_vec!(
			"spaceguesser_errors_total",
			"Errors sent to clients, by code.",
			&["code"]
		)
		.expect(named),
		store_failures: register_int_counter!("spaceguesser_store_failures_total", "Writes the database did not take.")
			.expect(named),
	};
	// Every series is there from the start, at zero: a rate over one that
	// appears with its first event does not see that event.
	for action in Action::ALL {
		for proof in Proof::ALL {
			metrics.proofs.with_label_values(&[action.name(), proof.name()]);
		}
	}
	for code in Error::ALL {
		metrics.errors.with_label_values(&[code.name()]);
	}
	metrics
});

pub fn lobbies(open: usize) {
	METRICS.lobbies.set(open as i64);
}

/// An open socket, counted until this is dropped.
pub struct Socket(());

impl Socket {
	pub fn open() -> Self {
		METRICS.sockets.inc();
		Self(())
	}
}

impl Drop for Socket {
	fn drop(&mut self) {
		METRICS.sockets.dec();
	}
}

pub fn proof(action: Action, proof: &Proof) {
	METRICS.proofs.with_label_values(&[action.name(), proof.name()]).inc();
}

pub fn error(code: Error) {
	METRICS.errors.with_label_values(&[code.name()]).inc();
}

pub fn store_failure() {
	METRICS.store_failures.inc();
}

pub fn render() -> String {
	LazyLock::force(&METRICS);
	// Only the write to the string could fail.
	TextEncoder::new()
		.encode_to_string(&prometheus::gather())
		.unwrap_or_default()
}

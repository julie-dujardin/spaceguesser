// k6 load test for the multiplayer server. Each VU is one lobby: it opens
// PLAYERS sockets, plays a whole game the way the frontend would, has everyone
// leave and starts another. Leaving matters: a lobby left closes at once, where
// one merely dropped lingers five minutes, and a sweep of those hits the
// server's lobby cap and measures refusals.
//
//   LOBBIES=200 k6 run lobby-load.js
//
// Closed-loop (constant-vus), so a saturated server slows the games down
// rather than piling up sockets it will never serve.
//
// Env: WS_URL, LOBBIES (concurrent lobbies), PLAYERS (per lobby), ROUNDS,
//      THINK_MS (mean time a player takes to guess), DURATION (s), TAG.

import { WebSocket } from 'k6/websockets';
import { Counter, Trend } from 'k6/metrics';

const URL = __ENV.WS_URL || 'ws://127.0.0.1:8787/ws';
const LOBBIES = parseInt(__ENV.LOBBIES || '50', 10);
const PLAYERS = parseInt(__ENV.PLAYERS || '4', 10);
const ROUNDS = parseInt(__ENV.ROUNDS || '5', 10);
const THINK_MS = parseInt(__ENV.THINK_MS || '2000', 10);
const DURATION = parseInt(__ENV.DURATION || '30', 10);
const TAG = __ENV.TAG || 'na';

// Opening a socket to holding a seat.
const joinMs = new Trend('join_ms', true);
// The round's last guess leaving to each player seeing the results: the
// server's own work, a store write and a broadcast.
const roundCloseMs = new Trend('round_close_ms', true);
const games = new Counter('games_completed');
const errors = new Counter('lobby_errors');

export const options = {
	summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
	scenarios: {
		load: {
			executor: 'constant-vus',
			vus: LOBBIES,
			duration: `${DURATION}s`,
			// A game in flight at the bell is left to finish, so it counts.
			gracefulStop: `${Math.ceil((ROUNDS * THINK_MS * 2) / 1000) + 10}s`
		}
	},
	thresholds: {
		// Informational only (abortOnFail off): past this a round's results
		// visibly lag the last guess.
		round_close_ms: [{ threshold: 'p(95)<250', abortOnFail: false }]
	}
};

// The size of what the frontend sends, not its meaning: the server relays both.
const SETTINGS = { rounds: ROUNDS, movement: 'free', timer: 0 };
const ROUND_ENTRIES = Array.from({ length: ROUNDS }, (_, i) => ({
	id: `mars2020/sol-${1000 + i}/mastcam-z-${i}`,
	mission: 'mars2020',
	title: `Sol ${1000 + i}: Mastcam-Z 360° panorama of the delta front`,
	lat: 18.4447 + i / 1000,
	lon: 77.4508 + i / 1000,
	sphere_percent: 62.5,
	heading_deg: 141.2,
	credit: 'NASA/JPL-Caltech/ASU/MSSS'
}));

function guess(playerIndex, round) {
	return {
		type: 'guess',
		result: {
			truth: ROUND_ENTRIES[round].id,
			guess: { lat: -4.5895 + playerIndex, lon: 137.4417 + round },
			distanceKm: 3712.48,
			points: 11,
			secondsLeft: null,
			timedOut: false
		}
	};
}

export default function () {
	const seats = [];
	let code = null;
	let started = false;
	let finished = false;
	let lastGuessAt = 0;

	const closeAll = () => seats.forEach((seat) => seat.ws.close());
	// The server answers a leave by closing the socket.
	const leaveAll = () => seats.forEach((seat) => seat.ws.send(JSON.stringify({ type: 'leave' })));

	function open(index, hello) {
		const ws = new WebSocket(URL);
		const seat = { ws, index, openedAt: Date.now(), guessed: -1, seen: -1 };
		seats.push(seat);
		ws.onopen = () => ws.send(JSON.stringify(hello));
		ws.onmessage = (event) => receive(seat, JSON.parse(event.data));
		ws.onerror = () => {
			errors.add(1);
			closeAll();
		};
	}

	function receive(seat, msg) {
		const send = (out) => seat.ws.send(JSON.stringify(out));
		const host = seat.index === 0;

		if (msg.type === 'joined') return joinMs.add(Date.now() - seat.openedAt);
		if (msg.type === 'error') {
			errors.add(1);
			return closeAll();
		}

		const lobby = msg.lobby;
		if (host && code === null) {
			code = lobby.code;
			for (let i = 1; i < PLAYERS; i++) open(i, { type: 'join', code, name: `Player ${i}` });
		}
		if (host && !started && lobby.players.length === PLAYERS) {
			started = true;
			send({ type: 'start', settings: SETTINGS, rounds: ROUND_ENTRIES });
		}

		const round = lobby.round ? lobby.round.index : -1;
		if (lobby.phase === 'playing' && seat.guessed < round) {
			seat.guessed = round;
			setTimeout(
				() => {
					lastGuessAt = Date.now();
					send(guess(seat.index, round));
				},
				THINK_MS * (0.5 + Math.random())
			);
		}
		if (lobby.phase === 'result' && seat.seen < round) {
			seat.seen = round;
			roundCloseMs.add(Date.now() - lastGuessAt);
			if (host) send({ type: 'next', round });
		}
		// Once: the others' leaves reach the host as further snapshots.
		if (lobby.phase === 'final' && host && !finished) {
			finished = true;
			games.add(1);
			leaveAll();
		}
	}

	open(0, { type: 'create', name: 'Host' });
}

export function handleSummary(data) {
	const m = data.metrics;
	const g = (name, stat) => (m[name] && m[name].values ? m[name].values[stat] : null);
	const trend = (name) => ({
		p50: g(name, 'med'),
		p95: g(name, 'p(95)'),
		p99: g(name, 'p(99)'),
		max: g(name, 'max')
	});
	const out = {
		tag: TAG,
		lobbies: LOBBIES,
		players: LOBBIES * PLAYERS,
		think_ms: THINK_MS,
		games_completed: g('games_completed', 'count'),
		errors: g('lobby_errors', 'count') || 0,
		msgs_sent_per_s: g('ws_msgs_sent', 'rate'),
		msgs_received_per_s: g('ws_msgs_received', 'rate'),
		join_ms: trend('join_ms'),
		round_close_ms: trend('round_close_ms')
	};
	const file = `results/summary_${TAG}.json`;
	return {
		stdout: '\n' + JSON.stringify(out, null, 2) + '\n',
		[file]: JSON.stringify(out, null, 2)
	};
}

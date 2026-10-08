/**
 * A multiplayer game as the server tells it. The server relays and keeps time;
 * settings, rounds and guesses are this app's own JSON, and are read back here.
 */

import type { LonLat } from 'spacemap';
import { profileOf, type Profile } from './players';
import type { Round } from './rounds';
import { QUICK_PLAY, type Movement, type RunSettings } from './rules';
import { NO_SKY, score, type Guess, type Score } from './scoring';
import type { Played } from './run';

export type LobbyPhase = 'lobby' | 'playing' | 'result' | 'final';

export interface Seat {
	id: string;
	name: string;
	connected: boolean;
}

export interface LobbyRound {
	index: number;
	total: number;
	/** The round itself. The server calls it an entry, and does not read it. */
	entry: Round;
	/** Epoch milliseconds on the server's clock; null on an untimed run. */
	ends_at: number | null;
	guessed: string[];
}

export interface Lobby {
	code: string;
	phase: LobbyPhase;
	host: string;
	players: Seat[];
	settings: unknown;
	/** There while playing and on the result screen. */
	round: LobbyRound | null;
	/** The finished rounds' guesses, by player id. */
	history: Record<string, Played>[];
}

export type LobbyError =
	| 'not_found'
	| 'full'
	| 'not_host'
	| 'bad_phase'
	| 'bad_request'
	| 'already_guessed'
	| 'busy'
	| 'unverified';

export type ClientMessage =
	// `proof` is a Turnstile token, which a server may want before it opens either.
	| { type: 'create'; name: string; proof?: string }
	| { type: 'join'; code: string; name: string; proof?: string }
	| { type: 'rejoin'; code: string; token: string }
	| { type: 'settings'; settings: RunSettings }
	| { type: 'start'; settings: RunSettings; rounds: Round[] }
	// These name the round they mean, so a second click or a late guess moves
	// nothing.
	| { type: 'guess'; round: number; result: Played }
	| { type: 'close_round'; round: number }
	| { type: 'next'; round: number }
	| { type: 'leave' };

export type ServerMessage =
	| { type: 'joined'; you: string; token: string }
	| { type: 'lobby'; now: number; lobby: Lobby }
	| { type: 'error'; code: LobbyError };

export const CODE_LENGTH = 6;

/** The status the server closes a socket with when its seat was opened on
 *  another one. */
export const SEAT_TAKEN = 4000;

/** The code an invite link carries, if `path` is one. */
export function inviteCode(path: string): string | null {
	return /^\/j\/([a-z0-9]{6})\/?$/i.exec(path)?.[1].toUpperCase() ?? null;
}

export function invitePath(code: string): string {
	return `/j/${code}`;
}

const MOVEMENTS: Movement[] = ['free', 'look', 'frozen'];

/** The host's settings, which another build of the app may have written. */
export function settingsOf(value: unknown): RunSettings {
	const given = (value ?? {}) as Partial<RunSettings>;
	return {
		rounds: Number.isInteger(given.rounds) && given.rounds! > 0 ? given.rounds! : QUICK_PLAY.rounds,
		movement: MOVEMENTS.includes(given.movement!) ? given.movement! : QUICK_PLAY.movement,
		timer: typeof given.timer === 'number' && given.timer > 0 ? given.timer : 0,
		// Neither switched on is no run at all.
		modes:
			given.modes && (given.modes.ground || given.modes.orbit)
				? { ground: !!given.modes.ground, orbit: !!given.modes.orbit }
				: QUICK_PLAY.modes
	};
}

/** What a guess carries of the round it answered. The server keeps every
 *  guess in every later snapshot, so a panorama's credits and geometry stay
 *  behind; this is what the recaps read. */
export function slim(round: Round): Round {
	if (round.mode === 'orbit') return round;
	const { id, mission, sol, time, lat, lon } = round.entry;
	return { ...round, entry: { id, mission, sol, time, lat, lon } };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;
const isText = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => Number.isFinite(value);
const isPlace = (value: unknown): value is LonLat =>
	isRecord(value) && isNumber(value.lat) && isNumber(value.lon);

/** A round as a guess carries it, see `slim`. */
function isRound(value: unknown): value is Round {
	if (!isRecord(value) || !isText(value.body) || !isNumber(value.time)) return false;
	if (value.mode === 'orbit') return isNumber(value.u) && isNumber(value.v);
	const { entry } = value;
	return (
		value.mode === 'ground' &&
		isRecord(entry) &&
		isPlace(entry) &&
		isText(entry.id) &&
		isText(entry.time) &&
		(entry.mission === undefined || isText(entry.mission)) &&
		(entry.sol === undefined || isNumber(entry.sol))
	);
}

function isGuess(value: unknown): value is Guess {
	return isRecord(value) && isText(value.body) && (value.at === null || isPlace(value.at));
}

function isScore(value: unknown): value is Score {
	return (
		isRecord(value) &&
		[value.points, value.system, value.body, value.surface].every(isNumber) &&
		[value.groundKm, value.spaceKm].every((km) => km === null || isNumber(km))
	);
}

function isPlayed(value: unknown): value is Played {
	if (!isRecord(value)) return false;
	const { round, truth, guess, score, secondsLeft, timedOut } = value;
	return (
		isRound(round) &&
		isRecord(truth) &&
		isText(truth.body) &&
		isPlace(truth) &&
		(guess === null || isGuess(guess)) &&
		isScore(score) &&
		(secondsLeft === null || isNumber(secondsLeft)) &&
		typeof timedOut === 'boolean'
	);
}

/**
 * A snapshot as this build can draw it. The server relays guesses unread, so
 * one another build of the app wrote, or none did, is dropped here rather than
 * met in a render: its player sat the round out.
 */
export function lobbyOf(told: Lobby): Lobby {
	const history = told.history.map((round) =>
		Object.fromEntries(Object.entries(round).filter(([, played]) => isPlayed(played)))
	);
	return { ...told, history };
}

export interface Standing {
	seat: Seat;
	profile: Profile;
	total: number;
	/** Their guess in the latest finished round, if they made one. */
	last: Played | undefined;
}

/** Everyone seated, best total first. */
export function standings(lobby: Lobby): Standing[] {
	const latest = lobby.history[lobby.history.length - 1];
	return lobby.players
		.map((seat) => ({
			seat,
			profile: profileOf(seat.name),
			total: lobby.history.reduce((sum, round) => sum + (round[seat.id]?.score.points ?? 0), 0),
			last: latest?.[seat.id]
		}))
		.sort((a, b) => b.total - a.total);
}

/** One player's round. A round they sat out still happened somewhere, which
 *  another player's guess can say; null for one nobody answered. */
export function playedIn(lobby: Lobby, id: string, index: number): Played | null {
	const round = lobby.history[index] ?? {};
	const own = round[id];
	if (own) return own;
	const other = Object.values(round)[0];
	if (!other) return null;
	return {
		round: other.round,
		truth: other.truth,
		guess: null,
		score: score(other.truth, null, NO_SKY, null),
		secondsLeft: null,
		timedOut: false
	};
}

/** One player's run, round by round, less the rounds nobody answered. */
export function playedBy(lobby: Lobby, id: string): Played[] {
	return lobby.history.flatMap((_, index) => playedIn(lobby, id, index) ?? []);
}

/**
 * A multiplayer game as the server tells it. The server relays and keeps time;
 * settings, rounds and guesses are this app's own JSON, and are read back here.
 */

import type { PanoramaEntry } from 'spacemap';
import { profileOf, type Profile } from './players';
import { QUICK_PLAY, type Movement, type RunSettings } from './rules';
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
	entry: PanoramaEntry;
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
	| 'in_progress'
	| 'not_host'
	| 'bad_phase'
	| 'bad_request'
	| 'already_guessed'
	| 'busy';

export type ClientMessage =
	| { type: 'create'; name: string }
	| { type: 'join'; code: string; name: string }
	| { type: 'rejoin'; code: string; token: string }
	| { type: 'settings'; settings: RunSettings }
	| { type: 'start'; settings: RunSettings; rounds: PanoramaEntry[] }
	| { type: 'guess'; result: Played }
	// Both name the round they mean, so a second click moves nothing.
	| { type: 'close_round'; round: number }
	| { type: 'next'; round: number }
	| { type: 'leave' };

export type ServerMessage =
	| { type: 'joined'; you: string; token: string }
	| { type: 'lobby'; now: number; lobby: Lobby }
	| { type: 'error'; code: LobbyError };

export const CODE_LENGTH = 6;

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
		timer: typeof given.timer === 'number' && given.timer > 0 ? given.timer : 0
	};
}

/** What a guess carries of the place it was scored against. The server keeps
 *  every guess in every later snapshot, so the entry's credits and geometry
 *  stay behind; this is what the recaps read. */
export function slim(entry: PanoramaEntry): PanoramaEntry {
	const { id, mission, sol, time, lat, lon } = entry;
	return { id, mission, sol, time, lat, lon };
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
			total: lobby.history.reduce((sum, round) => sum + (round[seat.id]?.points ?? 0), 0),
			last: latest?.[seat.id]
		}))
		.sort((a, b) => b.total - a.total);
}

/** One player's run, round by round. A round they sat out still happened
 *  somewhere, which another player's guess can say; one nobody answered is
 *  left out. */
export function playedBy(lobby: Lobby, id: string): Played[] {
	return lobby.history.flatMap((round) => {
		const own = round[id];
		if (own) return [own];
		const other = Object.values(round)[0];
		if (!other) return [];
		return [
			{
				truth: other.truth,
				guess: null,
				distanceKm: 0,
				points: 0,
				secondsLeft: null,
				timedOut: false
			}
		];
	});
}

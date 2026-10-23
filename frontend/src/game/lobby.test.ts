import { describe, expect, it } from 'vitest';
import {
	guessesOf,
	held,
	lobbyOf,
	outdated,
	playedBy,
	playedIn,
	slim,
	standings,
	streakRounds,
	type Lobby,
	type ToldLobby
} from './lobby';
import type { Round } from './rounds';
import { play, type Played } from './run';
import { NO_SKY } from './scoring';

const MARS = 'naif-499';
const TIME = Date.UTC(2026, 9, 8);

const GROUND: Round = {
	mode: 'ground',
	body: MARS,
	time: TIME,
	entry: {
		id: 'mars2020/sol-1000',
		mission: 'perseverance',
		sol: 1000,
		time: '2023-12-12',
		lat: 18.4,
		lon: 77.4,
		north_offset_deg: 0
	}
};
const ORBIT: Round = { mode: 'orbit', body: 'naif-502', time: TIME, u: 0.25, v: 0.75 };

/** A guess as it crosses the server: this app's own JSON, read back. */
function sent(played: Played): Played {
	return JSON.parse(JSON.stringify(played)) as Played;
}

const ON_MARS = sent(
	play(
		slim(GROUND),
		{ body: MARS, lat: 18.4, lon: 77.4 },
		{ body: MARS, at: { lat: 18, lon: 77 } },
		NO_SKY,
		3389.5,
		12,
		false
	)
);
const OVER_EUROPA = sent(
	play(
		ORBIT,
		{ body: 'naif-502', lat: -10, lon: 120 },
		{ body: 'naif-503', at: null },
		NO_SKY,
		1560.8,
		null,
		false
	)
);
const NO_PICK = sent(
	play(ORBIT, { body: 'naif-502', lat: -10, lon: 120 }, null, NO_SKY, 1560.8, 0, true)
);

/** A game the server says has `finished` rounds over. */
function told(finished: number): ToldLobby {
	return {
		code: 'ABCDEF',
		phase: 'final',
		host: 'ann',
		players: ['ann', 'bob'].map((id) => ({ id, name: id, connected: true, observing: false })),
		settings: {},
		round: null,
		finished
	};
}

/** The lobby a socket has once it is told those rounds, then that they are over. */
function lobby(rounds: Record<string, unknown>[]): Lobby {
	return lobbyOf(told(rounds.length), rounds.map(guessesOf));
}

describe('lobbyOf', () => {
	it('keeps every guess this app writes', () => {
		const rounds = [{ ann: ON_MARS, bob: OVER_EUROPA }, { ann: NO_PICK }];
		expect(lobby(rounds).history).toEqual(rounds);
	});

	it('counts the rounds the server says are over, and no others', () => {
		const last: Record<string, Played>[] = [
			{ ann: ON_MARS },
			{ ann: NO_PICK },
			{ bob: OVER_EUROPA }
		];
		// A game started over: the last one's rounds are still held, and not its.
		expect(lobbyOf(told(0), last).history).toEqual([]);
		expect(lobbyOf(told(1), [{ bob: ON_MARS }, ...last.slice(1)]).history).toEqual([
			{ bob: ON_MARS }
		]);
		// A round nobody answered is told as nobody's, and one never told reads the same.
		expect(lobbyOf(told(2), [{ ann: ON_MARS }]).history).toEqual([{ ann: ON_MARS }, {}]);
	});

	it('drops a guess it cannot read, and counts its player out of the round', () => {
		const wrong: unknown[] = [
			{},
			null,
			'guess',
			{ ...ON_MARS, score: undefined },
			{ ...ON_MARS, score: { ...ON_MARS.score, points: '5000' } },
			{ ...ON_MARS, truth: { body: MARS } },
			{ ...ON_MARS, guess: { body: MARS } },
			{ ...ON_MARS, round: { ...GROUND, entry: { id: 7 } } },
			{ ...OVER_EUROPA, round: { ...ORBIT, mode: 'submarine' } },
			{ ...OVER_EUROPA, secondsLeft: 'soon' }
		];
		for (const guess of wrong) {
			const read = lobby([{ ann: ON_MARS, bob: guess }]);
			expect(read.history).toEqual([{ ann: ON_MARS }]);
			expect(standings(read).map(({ seat, total }) => [seat.id, total])).toEqual([
				['ann', ON_MARS.score.points],
				['bob', 0]
			]);
			expect(playedBy(read, 'bob')).toHaveLength(1);
		}
	});
});

describe('streakRounds', () => {
	const read = lobby([
		{ ann: ON_MARS },
		{ ann: NO_PICK, bob: OVER_EUROPA },
		{ ann: ON_MARS },
		{ bob: ON_MARS }
	]);

	it("starts at a seat's first answer, as one that joined late", () => {
		expect(streakRounds(read, 'bob', 2)).toEqual([OVER_EUROPA]);
		expect(streakRounds(read, 'bob', 1)).toEqual([]);
		expect(streakRounds(read, 'cat')).toEqual([]);
	});

	it('counts a round let go by after it as one with no guess', () => {
		const rounds = streakRounds(read, 'bob');
		expect(rounds).toEqual([OVER_EUROPA, playedIn(read, 'bob', 2), ON_MARS]);
		expect(rounds[1].guess).toBeNull();
	});
});

describe('standings', () => {
	it('leaves out the host observing', () => {
		const read = lobby([{ bob: ON_MARS }]);
		read.players[0].observing = true;
		expect(standings(read).map(({ seat }) => seat.id)).toEqual(['bob']);
	});
});

describe('held', () => {
	const playing = (timer: number, ends_at: number | null): Lobby => ({
		...lobby([]),
		phase: 'playing',
		settings: { timer },
		round: { index: 0, total: 1, entry: GROUND, ends_at, guessed: [] }
	});

	it('holds a timed round back until its clock starts', () => {
		expect(held(playing(60, null))).toBe(true);
		expect(held(playing(60, TIME))).toBe(false);
	});

	it('shows an untimed round at once, and holds back no result', () => {
		expect(held(playing(0, null))).toBe(false);
		expect(held({ ...playing(60, null), phase: 'result' })).toBe(false);
	});
});

describe('outdated', () => {
	it("takes a refusal a page of the server's build can get as said", () => {
		for (const code of ['not_found', 'full', 'bad_phase', 'busy', 'unverified'])
			expect(outdated(code)).toBe(false);
	});

	it('reads a message the server could not read, or a code it does not know, as builds apart', () => {
		expect(outdated('bad_request')).toBe(true);
		expect(outdated('too_late')).toBe(true);
	});
});

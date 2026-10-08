import { describe, expect, it } from 'vitest';
import { lobbyOf, outdated, playedBy, slim, standings, type Lobby } from './lobby';
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
		lon: 77.4
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

function lobby(history: Record<string, unknown>[]): Lobby {
	return {
		code: 'ABCDEF',
		phase: 'final',
		host: 'ann',
		players: ['ann', 'bob'].map((id) => ({ id, name: id, connected: true })),
		settings: {},
		round: null,
		history: history as Lobby['history']
	};
}

describe('lobbyOf', () => {
	it('keeps every guess this app writes', () => {
		const told = lobby([{ ann: ON_MARS, bob: OVER_EUROPA }, { ann: NO_PICK }]);
		expect(lobbyOf(told)).toEqual(told);
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
			const read = lobbyOf(lobby([{ ann: ON_MARS, bob: guess }]));
			expect(read.history).toEqual([{ ann: ON_MARS }]);
			expect(standings(read).map(({ seat, total }) => [seat.id, total])).toEqual([
				['ann', ON_MARS.score.points],
				['bob', 0]
			]);
			expect(playedBy(read, 'bob')).toHaveLength(1);
		}
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

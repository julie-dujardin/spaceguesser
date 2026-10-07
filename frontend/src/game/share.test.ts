import { describe, expect, it, vi } from 'vitest';
import type { PanoramaEntry } from 'spacemap';
import { bodyOf } from './bodies';
import type { Round } from './rounds';
import { play, type Played } from './run';
import { NO_SKY, TIERS, type Guess, type Sky } from './scoring';
import { openShared, sharePath, sharedCode } from './share';

const MARS = 'naif-499';
const CALLISTO = 'naif-504';
const JUPITER = 'naif-599';
const EROS = 'spkid-20000433';
const TIME = Date.UTC(2026, 8, 14, 2, 20, 31, 417);

/** The sky a guess on another body is told, with no export to read it from. */
const SKY: Sky = { systemsKm: 0, bodiesKm: 1_882_700, systemExtentKm: 3_765_400 };
vi.mock('./measure', () => ({
	measure: async (_round: Round, truth: { body: string }, guessed: string | null) =>
		!guessed || guessed === truth.body ? NO_SKY : SKY
}));

const GALE = {
	id: 'curiosity-n_l000_0002_edr002cyltum0000_corr_m2',
	mission: 'curiosity',
	sol: 2,
	time: '2012-08-08T05:12:00',
	lat: -4.589466996,
	lon: 137.441632997
} as PanoramaEntry;
const VENERA = { id: 'venera13-lpi', time: '1982-03-01', lat: -7.5, lon: 303 } as PanoramaEntry;

/** A link the first layout wrote: Gale guessed on Mars, Callisto taken for Jupiter. */
const FIRST = 'AUJ6Cdt085AABAAAAfNDP62nz782pgAAAfP9UVrAUc6wIAMAAAH4PoAAAD8gAADueeqAqp3I4AAAAlc';

const panoramas = async (body: string) => (body === MARS ? [VENERA, GALE] : []);

function ground(entry: PanoramaEntry, guess: Guess | null): Played {
	const round: Round = { mode: 'ground', body: MARS, time: TIME, entry };
	const truth = { body: MARS, lat: entry.lat, lon: entry.lon };
	return play(round, truth, guess, NO_SKY, bodyOf(MARS)!.radiusKm, null, false);
}

function orbit(body: string, guess: Guess | null, sky = NO_SKY): Played {
	const round: Round = { mode: 'orbit', body, time: TIME, u: 0.25, v: 0.625 };
	const truth = { body, lat: -29.4, lon: -143.25 };
	return play(round, truth, guess, sky, bodyOf(body)!.radiusKm, null, false);
}

const reopen = (played: Played[]) => openShared(sharedCode(sharePath(played)!)!, panoramas);

describe('a shared run', () => {
	it('comes back as it was played', async () => {
		const run = [
			ground(GALE, { body: MARS, at: { lat: -4.5, lon: 137.25 } }),
			orbit(CALLISTO, { body: JUPITER, at: null }, SKY),
			orbit(EROS, { body: MARS, at: { lat: 12.5, lon: -70.75 } }, SKY),
			orbit(JUPITER, { body: JUPITER, at: null }),
			ground(GALE, null)
		];
		expect(await reopen(run)).toEqual(run);
	});

	it('scores a guess on another body against the sky', async () => {
		const [played] = await reopen([orbit(CALLISTO, { body: JUPITER, at: null })]);
		expect(played.score.system).toBe(TIERS.system);
		expect(played.score.spaceKm).toBe(SKY.bodiesKm);
		expect(played.score.points).toBeGreaterThan(TIERS.system);
	});

	it('keeps a place to the centimetre, east of 180° or not', async () => {
		const at = { lat: -4.589466996, lon: 303.123456789 };
		const [played] = await reopen([ground(GALE, { body: MARS, at })]);
		expect(played.guess!.at!.lat).toBeCloseTo(at.lat, 7);
		expect(played.guess!.at!.lon).toBeCloseTo(at.lon - 360, 7);
	});

	it('leaves the clock out', async () => {
		const timed = { ...ground(GALE, null), secondsLeft: 12, timedOut: true };
		const [played] = await reopen([timed]);
		expect(played).toMatchObject({ secondsLeft: null, timedOut: false });
	});

	it('is a link short enough to pass round', () => {
		const run = Array.from({ length: 5 }, () =>
			orbit(CALLISTO, { body: EROS, at: { lat: 1, lon: 2 } })
		);
		expect(sharePath(run)!.length).toBeLessThan(240);
	});

	// Links stay out there for good: this one was made by the first layout.
	it('still reads a link the first layout wrote', async () => {
		const run = await openShared(FIRST, panoramas);
		expect(run).toEqual([
			ground(GALE, { body: MARS, at: { lat: -4.5, lon: 137.25 } }),
			orbit(CALLISTO, { body: JUPITER, at: null }, SKY)
		]);
	});

	it('is not a run when the link does not read', async () => {
		const code = sharedCode(sharePath([ground(GALE, null), orbit(CALLISTO, null)])!)!;
		await expect(openShared('', panoramas)).rejects.toThrow();
		await expect(openShared('A', panoramas)).rejects.toThrow();
		await expect(openShared(code.slice(0, -3), panoramas)).rejects.toThrow();
		await expect(openShared(`Ag${code.slice(2)}`, panoramas)).rejects.toThrow('layout');
	});

	it('is not a run once its panorama is gone', async () => {
		const code = sharedCode(sharePath([ground(GALE, null)])!)!;
		await expect(openShared(code, async () => [VENERA])).rejects.toThrow('gone');
	});

	it('has no link for no rounds, or for a body a link cannot name', () => {
		expect(sharePath([])).toBeNull();
		expect(sharePath([orbit(MARS, { body: 'probe-voyager1', at: null })])).toBeNull();
	});
});

describe('sharedCode', () => {
	it('reads the run off a share link and nothing else', () => {
		expect(sharedCode('/r/AUJ5_-x')).toBe('AUJ5_-x');
		expect(sharedCode('/r/AUJ5_-x/')).toBe('AUJ5_-x');
		expect(sharedCode('/j/ABC123')).toBeNull();
		expect(sharedCode('/r/')).toBeNull();
		expect(sharedCode('/')).toBeNull();
	});
});

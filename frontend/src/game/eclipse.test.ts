import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanoramaEntry } from 'spacemap';
import { BODIES } from './bodies';
import { eclipsed, shadedOn } from './eclipse';
import { drawLitRun, type Stop } from './rounds';

const MOON = 'naif-301';
const IO = 'naif-501';
const EUROPA = 'naif-502';
const JUPITER = 'naif-599';
const MOONS = BODIES.filter((body) => body.system !== body.id).map((body) => body.id);

/** What the export is told to answer: full sunlight unless `SUNLIGHT` says,
 *  and nothing at all once `down`. `asked` is what it was asked. */
const SUNLIGHT = new Map<string, number | null>();
let down: 'failing' | 'silent' | null = null;
let asked: { id: string; date: Date }[] = [];
vi.mock('spacemap', async (original) => ({
	...(await original<typeof import('spacemap')>()),
	sunlight: (id: string, date: Date): Promise<number | null> => {
		asked.push({ id, date });
		if (down === 'silent') return new Promise(() => {});
		if (down === 'failing') return Promise.reject(new Error('no export'));
		return Promise.resolve(SUNLIGHT.has(id) ? SUNLIGHT.get(id)! : 1);
	}
}));

/** A date no other case has read: what one reads is kept. */
let clock = 0;
const fresh = () => ++clock;

beforeEach(() => {
	SUNLIGHT.clear();
	down = null;
	asked = [];
});

describe('eclipsed', () => {
	it('names the moons with less than their full sunlight', async () => {
		SUNLIGHT.set(IO, 0);
		SUNLIGHT.set(EUROPA, 0.97);
		// Earth is not in play, and its moon is.
		SUNLIGHT.set(MOON, 0.4);
		expect(await eclipsed(fresh())).toEqual(new Set([MOON, IO, EUROPA]));
	});

	it('asks about every moon on the date, and about no planet', async () => {
		SUNLIGHT.set(JUPITER, 0.999);
		const time = Date.UTC(2026, 9, 8);
		expect(await eclipsed(time)).toEqual(new Set());
		expect(asked.map(({ id }) => id)).toEqual(MOONS);
		expect(new Set(asked.map(({ date }) => date.getTime()))).toEqual(new Set([time]));
	});

	it('takes a moon the sky has no answer for as lit', async () => {
		SUNLIGHT.set(IO, null);
		expect(await eclipsed(fresh())).toEqual(new Set());
	});

	it('keeps what a date answered', async () => {
		const time = fresh();
		expect(shadedOn(time)).toEqual(new Set());
		SUNLIGHT.set(IO, 0);
		await eclipsed(time);
		expect(shadedOn(time)).toEqual(new Set([IO]));
		SUNLIGHT.clear();
		asked = [];
		expect(await eclipsed(time)).toEqual(new Set([IO]));
		expect(asked).toEqual([]);
	});

	it('stops asking at the first failure, and asks again the next time', async () => {
		const time = fresh();
		SUNLIGHT.set(IO, 0);
		down = 'failing';
		expect(await eclipsed(time)).toEqual(new Set());
		expect(asked).toHaveLength(1);
		expect(shadedOn(time)).toEqual(new Set());
		down = null;
		expect(await eclipsed(time)).toEqual(new Set([IO]));
	});
});

describe('drawLitRun', () => {
	const stops: Stop[] = Array.from({ length: 4 }, (_, i) => ({
		body: 'naif-499',
		entry: { id: `p${i}`, mission: 'rover', lat: i, lon: i, time: '' } as PanoramaEntry
	}));
	afterEach(() => vi.useRealTimers());

	it('flies over no moon in eclipse', async () => {
		for (const id of MOONS) if (id !== EUROPA) SUNLIGHT.set(id, 0);
		const run = await drawLitRun([], 200, { ground: false, orbit: true }, [], fresh());
		const flown = new Set(run.map((round) => round.body));
		expect(MOONS.filter((id) => flown.has(id))).toEqual([EUROPA]);
	});

	it('does not ask the sky for a draw that cannot fly', async () => {
		const run = await drawLitRun(stops, 2, { ground: true, orbit: false }, [], fresh());
		expect(run.map((round) => round.mode)).toEqual(['ground', 'ground']);
		expect(asked).toEqual([]);
		// With no stop to stand on, the same modes are flown.
		await drawLitRun([], 1, { ground: true, orbit: false }, [], fresh());
		expect(asked.length).toBeGreaterThan(0);
	});

	it('draws without a sky that has not answered in five seconds', async () => {
		vi.useFakeTimers();
		down = 'silent';
		let run: unknown = null;
		void drawLitRun([], 3, { ground: false, orbit: true }, [], fresh()).then((drawn) => {
			run = drawn;
		});
		await vi.advanceTimersByTimeAsync(4_900);
		expect(run).toBeNull();
		await vi.advanceTimersByTimeAsync(200);
		expect(run).toHaveLength(3);
	});
});

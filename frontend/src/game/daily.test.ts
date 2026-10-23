import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LonLat, PanoramaEntry } from 'spacemap';
import {
	DAILY,
	checkDaily,
	dailyRun,
	dayBefore,
	endOf,
	keepStarted,
	parseDaily,
	recallStarted,
	utcDay,
	type Daily
} from './daily';
import { spot, type Stop } from './rounds';

const MARS = 'naif-499';
const MOON = 'naif-301';
const IO = 'naif-501';
/** Offered only at hard difficulty. */
const JANUS = 'naif-610';

/** What the sky is told to answer. */
const NOON = new Map<string, LonLat | null>();
const SUNLIGHT = new Map<string, number>();
let asked: string[] = [];
vi.mock('spacemap', async (original) => ({
	...(await original<typeof import('spacemap')>()),
	subsolarPoint: (id: string): Promise<LonLat | null> =>
		Promise.resolve(NOON.has(id) ? NOON.get(id)! : { lat: 0, lon: 0 }),
	sunlight: (id: string): Promise<number> => {
		asked.push(id);
		return Promise.resolve(SUNLIGHT.get(id) ?? 1);
	}
}));

beforeEach(() => {
	NOON.clear();
	SUNLIGHT.clear();
	asked = [];
});

const STOPS: Stop[] = [
	{ body: MARS, entry: { id: 'jezero', lat: 18.4, lon: 77.5, time: '' } as PanoramaEntry },
	{ body: MOON, entry: { id: 'apollo17', lat: 20.2, lon: 30.8, time: '' } as PanoramaEntry }
];

/** A day's file as it is written: flown rounds with or without their `noon`. */
function file(patch: Record<string, unknown> = {}) {
	return {
		day: '2026-10-24',
		time: '2026-10-24T15:30:00Z',
		rounds: [
			{ mode: 'ground', body: MARS, panorama: 'jezero' },
			{ mode: 'orbit', body: IO, over: { lat: 10, lon: 20 }, noon: { lat: 0, lon: 15 } },
			{ mode: 'ground', body: MOON, panorama: 'apollo17' },
			{ mode: 'orbit', body: MARS, over: { lat: -5, lon: 100 }, noon: { lat: 4, lon: 95 } },
			{ mode: 'ground', body: MARS, panorama: 'jezero' }
		],
		...patch
	};
}

describe('the days', () => {
	it('are UTC dates', () => {
		expect(utcDay(Date.UTC(2026, 9, 24, 23, 59, 59))).toBe('2026-10-24');
		expect(utcDay(Date.UTC(2026, 9, 25))).toBe('2026-10-25');
	});

	it('step back over months, years and leap days', () => {
		expect(dayBefore('2026-11-01')).toBe('2026-10-31');
		expect(dayBefore('2027-01-01')).toBe('2026-12-31');
		expect(dayBefore('2028-03-01')).toBe('2028-02-29');
	});

	it('end at the next UTC midnight', () => {
		expect(endOf('2026-10-24')).toBe(Date.UTC(2026, 9, 25));
	});
});

describe('parseDaily', () => {
	it('reads a day', () => {
		expect(parseDaily(file())).toEqual(file());
	});

	it('names what is wrong', () => {
		expect(() => parseDaily(file({ day: '2026-02-30' }))).toThrow('`day`');
		expect(() => parseDaily(file({ day: '24/10/2026' }))).toThrow('`day`');
		expect(() => parseDaily(file({ time: 'noon' }))).toThrow('`time`');
		expect(() => parseDaily(file({ rounds: file().rounds.slice(1) }))).toThrow('5 rounds');
		const rounds = file().rounds;
		rounds[1] = { mode: 'orbit', body: IO, over: { lat: 10, lon: 20 } } as (typeof rounds)[1];
		expect(() => parseDaily(file({ rounds }))).toThrow('round 2');
		expect(() => parseDaily(null)).toThrow();
	});
});

describe('dailyRun', () => {
	const daily = parseDaily(file()) as Daily;

	it('plays every round at the time of the file', () => {
		const rounds = dailyRun(daily, STOPS, true)!;
		expect(rounds.map((round) => round.mode)).toEqual([
			'ground',
			'orbit',
			'ground',
			'orbit',
			'ground'
		]);
		expect(new Set(rounds.map((round) => round.time))).toEqual(
			new Set([Date.parse('2026-10-24T15:30:00Z')])
		);
	});

	it('flies over the place picked, under the Sun of the file', () => {
		const flown = dailyRun(daily, STOPS, true)![1];
		if (flown.mode !== 'orbit') throw new Error('not flown');
		const { lat, lon } = spot(flown, { lat: 0, lon: 15 });
		expect(lat).toBeCloseTo(10, 6);
		expect(lon).toBeCloseTo(20, 6);
	});

	it('is not played where a round of it cannot be', () => {
		expect(dailyRun(daily, STOPS.slice(0, 1), true)).toBeNull();
		expect(dailyRun(daily, STOPS, false)).toBeNull();
	});
});

describe('checkDaily', () => {
	it('passes a good day', async () => {
		expect(await checkDaily('2026-10-24.json', file(), STOPS)).toEqual({ filled: 0, problems: [] });
	});

	it('writes in the noon a flown round leaves out', async () => {
		NOON.set(IO, { lat: 0.123456, lon: 14.98765 });
		const value = file();
		delete (value.rounds[1] as { noon?: LonLat }).noon;
		expect(await checkDaily('2026-10-24.json', value, STOPS)).toEqual({ filled: 1, problems: [] });
		expect(value.rounds[1]).toMatchObject({ noon: { lat: 0.1235, lon: 14.9877 } });
	});

	it('names every problem', async () => {
		NOON.set(JANUS, { lat: 0, lon: 0 });
		SUNLIGHT.set(IO, 0.2);
		const value = file({
			rounds: [
				{ mode: 'ground', body: MARS, panorama: 'gone' },
				{ mode: 'orbit', body: IO, over: { lat: 10, lon: 20 }, noon: { lat: 0, lon: 15 } },
				{ mode: 'orbit', body: JANUS, over: { lat: 0, lon: 0 } },
				// Opposite noon: night.
				{ mode: 'orbit', body: MARS, over: { lat: -4, lon: -85 }, noon: { lat: 4, lon: 95 } },
				{ mode: 'ground', body: MARS, panorama: 'jezero' }
			]
		});
		const { problems } = await checkDaily('2026-10-25.json', value, STOPS);
		expect(problems).toEqual([
			'the file of 2026-10-24 is named 2026-10-25.json',
			'round 1: naif-499 has no playable panorama gone',
			'round 2: naif-501 is in shadow at 2026-10-24T15:30:00Z',
			'round 3: the guess panel does not offer naif-610',
			'round 4: the Sun is too low over that place at 2026-10-24T15:30:00Z'
		]);
	});

	it('asks about the shadow of a moon only', async () => {
		await checkDaily('2026-10-24.json', file(), STOPS);
		expect(asked).toEqual([IO]);
	});

	it('says so when the sky has no Sun for a body', async () => {
		NOON.set(IO, null);
		const value = file();
		delete (value.rounds[1] as { noon?: LonLat }).noon;
		const { problems } = await checkDaily('2026-10-24.json', value, STOPS);
		expect(problems[0]).toBe('round 2: no position of the Sun over naif-501');
	});
});

describe('the day started', () => {
	beforeEach(() => {
		const kept = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => void kept.set(key, value)
		});
	});

	it('is kept', () => {
		expect(recallStarted()).toBeNull();
		expect(keepStarted('2026-10-24')).toBe('2026-10-24');
		expect(recallStarted()).toBe('2026-10-24');
	});
});

it('times every round of the challenge', () => {
	expect(DAILY.timer).toBe(120);
	expect(DAILY.rounds).toBe(5);
});

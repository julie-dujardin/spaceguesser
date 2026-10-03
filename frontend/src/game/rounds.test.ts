import { describe, expect, it } from 'vitest';
import type { PanoramaEntry } from 'spacemap';
import { BODIES, bodyOf, viewDistance } from './bodies';
import { altitudeKm, anywhere, drawDate, drawRun, shownDate, spot, type Stop } from './rounds';

const RAD = Math.PI / 180;

/** Degrees between two places, which is the Sun's zenith angle when one of
 *  them is where it stands overhead. */
function apart(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const cos =
		Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
		Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD);
	return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
}

/** A repeatable stream of numbers in [0, 1). */
function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

function stops(count: number): Stop[] {
	return Array.from({ length: count }, (_, i) => ({
		body: 'naif-499',
		entry: { id: `p${i}`, mission: `rover${i % 3}`, lat: i, lon: i * 2, time: '' } as PanoramaEntry
	}));
}

describe('spot', () => {
	it('always lands where the Sun is at least 40° up', () => {
		const random = seeded(7);
		for (let i = 0; i < 2000; i++) {
			const noon = { lat: random() * 160 - 80, lon: random() * 360 - 180 };
			const at = spot({ u: random(), v: random() }, noon);
			expect(apart(at, noon)).toBeLessThanOrEqual(50 + 1e-6);
			expect(Math.abs(at.lon)).toBeLessThanOrEqual(180);
			expect(Math.abs(at.lat)).toBeLessThanOrEqual(90);
		}
	});

	it('is the sub-solar point itself at u = 0, and the edge of the cap at u = 1', () => {
		const noon = { lat: 12, lon: -40 };
		expect(apart(spot({ u: 0, v: 0.3 }, noon), noon)).toBeCloseTo(0, 6);
		expect(apart(spot({ u: 1, v: 0.3 }, noon), noon)).toBeCloseTo(50, 6);
	});

	it('covers the whole sphere when there is no noon to stay near', () => {
		expect(anywhere({ u: 0, v: 0 })).toEqual({ lat: -90, lon: -180 });
		expect(anywhere({ u: 0.5, v: 0.5 }).lat).toBeCloseTo(0, 9);
	});
});

describe('drawRun', () => {
	const now = Date.UTC(2026, 9, 2);

	it('tosses a coin between the two modes', () => {
		const run = drawRun(stops(400), 200, { ground: true, orbit: true }, [], now, seeded(1));
		const ground = run.filter((round) => round.mode === 'ground').length;
		expect(ground).toBeGreaterThan(70);
		expect(ground).toBeLessThan(130);
	});

	it('plays one mode alone when the other is switched off', () => {
		const ground = drawRun(stops(40), 10, { ground: true, orbit: false }, [], now, seeded(2));
		expect(ground.every((round) => round.mode === 'ground')).toBe(true);
		const orbit = drawRun(stops(40), 10, { ground: false, orbit: true }, [], now, seeded(2));
		expect(orbit.every((round) => round.mode === 'orbit')).toBe(true);
	});

	it('flies the rounds it has no stop for', () => {
		const run = drawRun([], 5, { ground: true, orbit: false }, [], now, seeded(3));
		expect(run.map((round) => round.mode)).toEqual(Array(5).fill('orbit'));
		const short = drawRun(stops(2), 5, { ground: true, orbit: false }, [], now, seeded(3));
		expect(short).toHaveLength(5);
		expect(short.filter((round) => round.mode === 'ground')).toHaveLength(2);
	});

	it('does not fly over one body twice while another is left', () => {
		const count = BODIES.length;
		const run = drawRun([], count, { ground: false, orbit: true }, [], now, seeded(4));
		expect(new Set(run.map((round) => round.body)).size).toBe(count);
	});

	it('gives every round of a run the one date', () => {
		const run = drawRun(stops(40), 50, { ground: true, orbit: true }, [], now, seeded(5));
		expect(new Set(run.map((round) => round.time))).toEqual(new Set([now]));
	});

	it('draws a date within thirty days of now', () => {
		const random = seeded(6);
		for (let i = 0; i < 200; i++)
			expect(Math.abs(drawDate(now, random) - now)).toBeLessThanOrEqual(30 * 86_400_000);
	});
});

describe('shownDate', () => {
	const on = (time: string) =>
		shownDate({ mode: 'ground', body: 'naif-499', time: 0, entry: { time } as PanoramaEntry });

	it('shows a panorama at its own date, in UTC whatever the export left off', () => {
		expect(on('2012-08-08T05:01:47Z')).toBe('2012-08-08 05:01 UTC');
		expect(on('2004-01-04T05:01:47.477')).toBe('2004-01-04 05:01 UTC');
	});

	it('shows no time of day the export does not have', () => {
		expect(on('1969-07-21')).toBe('1969-07-21');
	});

	it("shows a flown round at the run's date", () => {
		const time = Date.UTC(2026, 9, 2, 12, 30);
		expect(shownDate({ mode: 'orbit', body: 'naif-499', time, u: 0, v: 0 })).toBe(
			'2026-10-02 12:30 UTC'
		);
	});
});

describe('altitudeKm', () => {
	const on = (entry: Partial<PanoramaEntry>) =>
		altitudeKm({ mode: 'ground', body: 'naif-606', time: 0, entry: entry as PanoramaEntry });

	it('is nothing for a panorama taken on the ground', () => {
		expect(on({})).toBeNull();
	});

	it('is how high a panorama was taken on the way down', () => {
		expect(on({ altitude_m: 10_000 })).toBe(10);
	});

	it('is the standoff of a flown round', () => {
		const km = altitudeKm({ mode: 'orbit', body: 'naif-499', time: 0, u: 0, v: 0 });
		expect(km).toBeGreaterThan(0);
	});
});

describe('viewDistance', () => {
	it('comes close over a fine map and stands back from a coarse one', () => {
		const mars = viewDistance(bodyOf('naif-499')!);
		const ganymede = viewDistance(bodyOf('naif-503')!);
		expect(mars).toBeGreaterThanOrEqual(1.25);
		expect(mars).toBeLessThan(1.5);
		expect(ganymede).toBeGreaterThan(3);
		expect(viewDistance(bodyOf('naif-699')!)).toBe(5);
	});

	it('stays off the ground and within sight for every body in play', () => {
		for (const body of BODIES) {
			expect(viewDistance(body)).toBeGreaterThanOrEqual(1.25);
			expect(viewDistance(body)).toBeLessThanOrEqual(5);
		}
	});
});

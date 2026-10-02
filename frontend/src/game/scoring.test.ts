import { describe, expect, it } from 'vitest';
import { MAX_POINTS, SOLAR_EXTENT_KM, TIERS, falloff, score, type Sky } from './scoring';

const AU = 149_597_870.7;
const MARS = 'naif-499';
const PHOBOS = 'naif-401';
const SATURN = 'naif-699';
const ENCELADUS = 'naif-602';
const TITAN = 'naif-606';
const JUPITER = 'naif-599';

const NO_SKY: Sky = { systemsKm: null, bodiesKm: null, systemExtentKm: null };
const gale = { body: MARS, lat: -4.6, lon: 137.4 };

describe('falloff', () => {
	it('is everything on the spot and next to nothing at the far end', () => {
		expect(falloff(1000, 0, 500)).toBe(1000);
		expect(falloff(1000, 50, 500)).toBe(368);
		expect(falloff(1000, 500, 500)).toBe(0);
	});
});

describe('score', () => {
	it('gives every point for the place itself', () => {
		const s = score(gale, { body: MARS, at: gale }, NO_SKY, 3389.5);
		expect(s.points).toBe(MAX_POINTS);
		expect(s.groundKm).toBeCloseTo(0, 6);
	});

	it('keeps the system and body tiers for the wrong side of the right body', () => {
		const s = score(gale, { body: MARS, at: { lat: 4.6, lon: -42.6 } }, NO_SKY, 3389.5);
		expect(s.system + s.body).toBe(TIERS.system + TIERS.body);
		expect(s.surface).toBe(0);
		expect(s.groundKm).toBeCloseTo(Math.PI * 3389.5, 0);
	});

	it('tells a moon from its neighbour, which one curve over the Solar System cannot', () => {
		const titan = { body: TITAN, lat: 0, lon: 0 };
		const sky: Sky = { systemsKm: 0, bodiesKm: 1_200_000, systemExtentKm: 7_100_000 };
		const s = score(titan, { body: ENCELADUS, at: { lat: 0, lon: 0 } }, sky, 2574.8);
		expect(s.system).toBe(TIERS.system);
		expect(s.body).toBe(falloff(TIERS.body, 1_200_000, 7_100_000));
		expect(s.body).toBeGreaterThan(200);
		expect(s.body).toBeLessThan(TIERS.body / 2);
		expect(s.surface).toBe(0);
		expect(s.spaceKm).toBe(1_200_000);
	});

	it('scores the wrong system by how far off it is that day', () => {
		const sky = (au: number): Sky => ({ ...NO_SKY, systemsKm: au * AU });
		const near = score({ body: SATURN, lat: 0, lon: 0 }, { body: JUPITER, at: null }, sky(5), null);
		const far = score({ body: SATURN, lat: 0, lon: 0 }, { body: JUPITER, at: null }, sky(15), null);
		expect(near.points).toBe(falloff(TIERS.system, 5 * AU, SOLAR_EXTENT_KM));
		expect(near.points).toBeGreaterThan(far.points);
		expect(far.body + far.surface).toBe(0);
	});

	it('takes a body with no map as the whole answer', () => {
		const s = score({ body: SATURN, lat: 10, lon: 20 }, { body: SATURN, at: null }, NO_SKY, 58300);
		expect(s.points).toBe(MAX_POINTS);
		expect(s.groundKm).toBeNull();
	});

	it('gives no surface points for a mapped body named without a place', () => {
		const s = score(gale, { body: MARS, at: null }, NO_SKY, 3389.5);
		expect(s.points).toBe(TIERS.system + TIERS.body);
	});

	it('scores a moon guessed for its planet inside the system', () => {
		const sky: Sky = { systemsKm: 0, bodiesKm: 9_400, systemExtentKm: 47_000 };
		const s = score(gale, { body: PHOBOS, at: { lat: 0, lon: 0 } }, sky, 3389.5);
		expect(s.points).toBe(TIERS.system + falloff(TIERS.body, 9_400, 47_000));
	});

	it('is nothing without a guess, and misses the tiers the sky cannot measure', () => {
		expect(score(gale, null, NO_SKY, 3389.5).points).toBe(0);
		expect(score(gale, { body: JUPITER, at: null }, NO_SKY, 3389.5).points).toBe(0);
	});
});

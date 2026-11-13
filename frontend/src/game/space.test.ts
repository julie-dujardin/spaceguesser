import { describe, expect, it } from 'vitest';
import { between } from './space';

describe('between', () => {
	it('goes its share of the way along the great circle', () => {
		const middle = between({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }, 0.5);
		expect(middle.lat).toBeCloseTo(0);
		expect(middle.lon).toBeCloseTo(45);
		expect(between({ lat: 0, lon: 0 }, { lat: 60, lon: 0 }, 0.25).lat).toBeCloseTo(15);
	});

	it('stays put at none of the way and arrives at all of it', () => {
		const from = { lat: -4, lon: 170 };
		const to = { lat: 10, lon: -170 };
		expect(between(from, to, 0).lat).toBeCloseTo(-4);
		expect(between(from, to, 0).lon).toBeCloseTo(170);
		expect(between(from, to, 1)).toEqual(to);
	});

	it('crosses the antimeridian the short way', () => {
		expect(Math.abs(between({ lat: 0, lon: 170 }, { lat: 0, lon: -170 }, 0.5).lon)).toBeCloseTo(
			180
		);
	});
});

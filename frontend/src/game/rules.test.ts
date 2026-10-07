import { afterEach, describe, expect, it } from 'vitest';
import { baseLocale, overwriteGetLocale } from '../paraglide/runtime.js';
import { QUICK_PLAY, describeRun, formatAltitude, formatDistance, formatNumber } from './rules';

afterEach(() => overwriteGetLocale(() => baseLocale));

describe('formatDistance', () => {
	it('picks the unit a miss reads in', () => {
		expect(formatDistance(0.4)).toBe('400 m');
		expect(formatDistance(12.34)).toBe('12.3 km');
		expect(formatDistance(4321.6)).toBe('4,322 km');
		expect(formatDistance(1.5 * 149_597_870.7)).toBe('1.50 AU');
	});

	it("writes numbers and units as the reader's language does", () => {
		overwriteGetLocale(() => 'fr');
		expect(formatDistance(12.34)).toBe('12,3 km');
		expect(formatDistance(4321.6)).toBe('4\u202f322 km');
		expect(formatDistance(1.5 * 149_597_870.7)).toBe('1,50 UA');
		expect(formatAltitude(1.5)).toBe('1,5 km');
		expect(formatNumber(25000)).toBe('25\u202f000');
	});
});

describe('describeRun', () => {
	it("says the rules in the reader's language", () => {
		expect(describeRun({ ...QUICK_PLAY, timer: 30 })).toEqual([
			'5 rounds',
			'ground and orbit',
			'free movement',
			'30 s per round'
		]);
		overwriteGetLocale(() => 'fr');
		expect(describeRun({ ...QUICK_PLAY, rounds: 1 })).toEqual([
			'1 manche',
			'sol et orbite',
			'déplacement libre',
			'sans chrono'
		]);
	});
});

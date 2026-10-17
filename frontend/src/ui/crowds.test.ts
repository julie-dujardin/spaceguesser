import { describe, expect, it } from 'vitest';
import { crowds, overlaps, settle, type Box } from './crowds';

const box = (left: number, top: number, width = 20, height = 20): Box => ({
	left,
	top,
	right: left + width,
	bottom: top + height
});

const SCREEN = box(0, 0, 1000, 1000);

describe('crowds', () => {
	it('groups the boxes that touch, and only those', () => {
		expect(crowds([box(0, 0), box(15, 0), box(500, 500)])).toEqual([[0, 1]]);
	});

	it('takes in a box that only touches another of the group', () => {
		expect(crowds([box(0, 0), box(15, 0), box(30, 0)])).toEqual([[0, 1, 2]]);
	});

	it('counts boxes a little apart as touching, for the rings round the pins', () => {
		expect(crowds([box(0, 0), box(24, 0)])).toEqual([[0, 1]]);
		expect(crowds([box(0, 0), box(40, 0)])).toEqual([]);
	});
});

describe('settle', () => {
	it('leaves a box where it is when nothing is in its way', () => {
		expect(settle(box(100, 100), [box(400, 400)], SCREEN)).toEqual([0, 0]);
	});

	it('moves a box clear of what is in its way, by as little as it can', () => {
		const offset = settle(box(100, 100), [box(100, 100)], SCREEN);
		expect(overlaps(box(100 + offset[0], 100 + offset[1]), box(100, 100), 8)).toBe(false);
		expect(Math.hypot(...offset)).toBeLessThanOrEqual(40);
	});

	it('keeps a box on the screen', () => {
		const [dx, dy] = settle(box(0, 0), [box(0, 0)], SCREEN);
		expect(dx).toBeGreaterThanOrEqual(0);
		expect(dy).toBeGreaterThanOrEqual(0);
	});

	it('keeps to where it went last while that is still free', () => {
		expect(settle(box(100, 100), [box(100, 100)], SCREEN, [-48, 0])).toEqual([-48, 0]);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseLocale, overwriteGetLocale } from '../paraglide/runtime.js';
import {
	clearHistory,
	dayOf,
	describePast,
	formatDay,
	keepRun,
	kindOf,
	recallHistory,
	weeksOf,
	type PastRun
} from './history';
import { QUICK_PLAY } from './rules';

/** A Wednesday evening. */
const NOW = new Date(2026, 9, 7, 21, 40).getTime();

afterEach(() => overwriteGetLocale(() => baseLocale));

function run(patch: Partial<PastRun> = {}): PastRun {
	return { at: NOW, settings: QUICK_PLAY, total: 14028, code: 'AbC', ...patch };
}

describe('weeksOf', () => {
	it('ends on this week, as far as today', () => {
		const weeks = weeksOf([], 26, NOW);
		expect(weeks).toHaveLength(26);
		const last = weeks[25];
		expect(last.slice(0, 3).map((day) => day && new Date(day.at).getDate())).toEqual([5, 6, 7]);
		expect(last.slice(3)).toEqual([null, null, null, null]);
	});

	it('starts every week on its Monday, at midnight', () => {
		for (const week of weeksOf([], 60, NOW)) {
			const monday = new Date(week[0]!.at);
			expect(monday.getDay()).toBe(1);
			expect(monday.getHours()).toBe(0);
		}
		expect(weeksOf([], 26, NOW)[0][0]!.at).toBe(new Date(2026, 3, 13).getTime());
	});

	it('counts the runs that ended on a day', () => {
		const sunday = new Date(2026, 9, 4);
		const runs = [
			run(),
			run({ at: NOW - 3_600_000 }),
			run({ at: new Date(2026, 9, 4, 0, 0, 1).getTime() }),
			run({ at: new Date(2026, 9, 4, 23, 59).getTime() }),
			run({ at: new Date(2026, 9, 4, 12).getTime() }),
			// Too long ago to be in the weeks asked for.
			run({ at: new Date(2025, 0, 1).getTime() })
		];
		const weeks = weeksOf(runs, 4, NOW);
		expect(weeks[3][2]).toEqual({ at: dayOf(NOW), runs: 2 });
		expect(weeks[2][6]).toEqual({ at: sunday.getTime(), runs: 3 });
		expect(weeks.flat().reduce((sum, day) => sum + (day?.runs ?? 0), 0)).toBe(5);
	});
});

describe('the kept history', () => {
	beforeEach(() => {
		const kept = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => void kept.set(key, value),
			removeItem: (key: string) => void kept.delete(key)
		});
	});

	it('keeps the newest run first', () => {
		keepRun(run({ code: 'first' }));
		expect(keepRun(run({ code: 'second', at: NOW + 1 })).map((kept) => kept.code)).toEqual([
			'second',
			'first'
		]);
		expect(recallHistory()).toHaveLength(2);
	});

	it('does not keep the same run twice', () => {
		keepRun(run());
		expect(keepRun(run({ at: NOW + 60_000 }))).toEqual([run()]);
	});

	it('keeps every run that has no link to tell it by', () => {
		keepRun(run({ code: null }));
		expect(keepRun(run({ code: null }))).toHaveLength(2);
	});

	it('reads back what it wrote', () => {
		const friends = run({ code: 'friends', place: 2, of: 4 });
		keepRun(friends);
		expect(recallHistory()).toEqual([friends]);
	});

	it('drops what it did not write, and mends what it can', () => {
		localStorage.setItem(
			'spaceguesser.history',
			JSON.stringify([null, 'run', { at: NOW }, { at: NOW, total: 900, settings: { rounds: 3 } }])
		);
		expect(recallHistory()).toEqual([
			{ at: NOW, total: 900, code: null, settings: { ...QUICK_PLAY, rounds: 3 } }
		]);
		localStorage.setItem('spaceguesser.history', '{not json');
		expect(recallHistory()).toEqual([]);
	});

	it('forgets', () => {
		keepRun(run());
		clearHistory();
		expect(recallHistory()).toEqual([]);
	});
});

describe('a run in a row', () => {
	it('is quick play when its rules are quick play’s', () => {
		expect(kindOf(run())).toBe('quick');
		expect(kindOf(run({ settings: { ...QUICK_PLAY, timer: 60 } }))).toBe('custom');
		expect(kindOf(run({ place: 1, of: 3 }))).toBe('friends');
	});

	it('says how long it was, or how it went', () => {
		expect(describePast(run())).toBe('5 rounds');
		expect(describePast(run({ settings: { ...QUICK_PLAY, rounds: 10, timer: 60 } }))).toBe(
			'10 rounds · 60 s'
		);
		expect(describePast(run({ place: 2, of: 4 }))).toBe('2nd of 4');
		expect(describePast(run({ place: 11, of: 12 }))).toBe('11th of 12');
		expect(formatDay(NOW)).toBe('Oct 7');
	});

	it("says it as the reader's language does", () => {
		overwriteGetLocale(() => 'fr');
		expect(describePast(run({ settings: { ...QUICK_PLAY, rounds: 10, timer: 60 } }))).toBe(
			'10 manches · 60 s'
		);
		expect(describePast(run({ place: 1, of: 3 }))).toBe('1er sur 3');
		expect(describePast(run({ place: 2, of: 4 }))).toBe('2e sur 4');
		expect(formatDay(NOW, true)).toBe('7 oct. 2026');
	});
});

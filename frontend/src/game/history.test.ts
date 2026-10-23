import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseLocale, overwriteGetLocale } from '../paraglide/runtime.js';
import {
	NO_DAYS,
	NO_STREAK,
	clearHistory,
	dayNews,
	dayOf,
	describePast,
	extendDays,
	extendStreak,
	finishDay,
	formatDay,
	keepRun,
	kindOf,
	recallDays,
	recallHistory,
	recallStreak,
	roundNews,
	standingDays,
	streakNews,
	weeksOf,
	type PastRun
} from './history';
import type { Round } from './rounds';
import { QUICK_PLAY } from './rules';
import { play, type Played } from './run';
import { NO_SKY } from './scoring';

/** A Wednesday evening. */
const NOW = new Date(2026, 9, 7, 21, 40).getTime();

afterEach(() => overwriteGetLocale(() => baseLocale));

function run(patch: Partial<PastRun> = {}): PastRun {
	return { at: NOW, settings: QUICK_PLAY, total: 14028, code: 'AbC', ...patch };
}

const MARS = 'naif-499';
const ORBIT: Round = { mode: 'orbit', body: MARS, time: NOW, u: 0.25, v: 0.5 };

/** A round over Mars, guessed on `body`, or not guessed. */
function round(body: string | null): Played {
	const guess = body ? { body, at: null } : null;
	return play(ORBIT, { body: MARS, lat: 0, lon: 0 }, guess, NO_SKY, null, null, false);
}
const RIGHT = round(MARS);
const WRONG = round('naif-501');

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
		keepRun(run({ code: 'first' }), []);
		expect(keepRun(run({ code: 'second', at: NOW + 1 }), []).map((kept) => kept.code)).toEqual([
			'second',
			'first'
		]);
		expect(recallHistory()).toHaveLength(2);
	});

	it('does not keep the same run twice', () => {
		keepRun(run(), []);
		expect(keepRun(run({ at: NOW + 60_000 }), [])).toEqual([run()]);
	});

	it('keeps every run that has no link to tell it by', () => {
		keepRun(run({ code: null }), []);
		expect(keepRun(run({ code: null }), [])).toHaveLength(2);
	});

	it('reads back what it wrote', () => {
		const friends = run({ code: 'friends', place: 2, of: 4 });
		const tutorial = run({ code: 'tutorial', tutorial: true });
		const daily = run({ code: 'daily', daily: '2026-10-07' });
		keepRun(friends, []);
		keepRun(tutorial, []);
		keepRun(daily, []);
		expect(recallHistory()).toEqual([daily, tutorial, friends]);
		expect(kindOf(daily)).toBe('daily');
	});

	it('keeps a daily challenge once', () => {
		keepRun(run({ code: 'part', daily: '2026-10-07' }), []);
		expect(keepRun(run({ code: 'whole', daily: '2026-10-07' }), [])).toHaveLength(1);
		expect(keepRun(run({ code: 'next', daily: '2026-10-08' }), [])).toHaveLength(2);
	});

	it('keeps the day streak, and forgets it with the rest', () => {
		finishDay('2026-10-06');
		finishDay('2026-10-07');
		expect(recallDays()).toEqual({ current: 2, best: 2, last: '2026-10-07' });
		clearHistory();
		expect(recallDays()).toEqual(NO_DAYS);
	});

	it('reads back no day streak it did not write', () => {
		for (const kept of [
			'{not json',
			'{"current":2,"best":1,"last":"2026-10-07"}',
			'{"current":1,"best":1}'
		]) {
			localStorage.setItem('spaceguesser.days', kept);
			expect(recallDays()).toEqual(NO_DAYS);
		}
	});

	it('drops what it did not write, and mends what it can', () => {
		localStorage.setItem(
			'spaceguesser.history',
			JSON.stringify([null, 'run', { at: NOW }, { at: NOW, total: 900, settings: { rounds: 3 } }])
		);
		expect(recallHistory()).toEqual([
			{
				at: NOW,
				total: 900,
				code: null,
				settings: { ...QUICK_PLAY, rounds: 3, difficulty: 'hard' }
			}
		]);
		localStorage.setItem('spaceguesser.history', '{not json');
		expect(recallHistory()).toEqual([]);
	});

	it('forgets', () => {
		keepRun(run(), [RIGHT]);
		clearHistory();
		expect(recallHistory()).toEqual([]);
		expect(recallStreak()).toEqual(NO_STREAK);
	});

	it('keeps the streak going from one run to the next', () => {
		keepRun(run({ code: 'first' }), [RIGHT, RIGHT]);
		keepRun(run({ code: 'second' }), [RIGHT, WRONG, RIGHT]);
		expect(recallStreak()).toEqual({ current: 1, best: 3 });
	});

	it('counts a run in the streak once', () => {
		keepRun(run(), [RIGHT]);
		keepRun(run(), [RIGHT]);
		expect(recallStreak()).toEqual({ current: 1, best: 1 });
	});

	it('reads back no streak it did not write', () => {
		for (const kept of ['{not json', '[]', '{"current":2,"best":1}', '{"current":1.5,"best":2}']) {
			localStorage.setItem('spaceguesser.streak', kept);
			expect(recallStreak()).toEqual(NO_STREAK);
		}
	});
});

describe('the day streak', () => {
	const ON_7TH = { current: 3, best: 5, last: '2026-10-07' };

	it('goes on with the next day, and starts over after a day missed', () => {
		expect(extendDays(NO_DAYS, '2026-10-07')).toEqual({ current: 1, best: 1, last: '2026-10-07' });
		expect(extendDays(ON_7TH, '2026-10-08')).toEqual({ current: 4, best: 5, last: '2026-10-08' });
		expect(extendDays(ON_7TH, '2026-10-09')).toEqual({ current: 1, best: 5, last: '2026-10-09' });
		expect(extendDays({ ...ON_7TH, best: 3 }, '2026-10-08').best).toBe(4);
	});

	it('counts a day once', () => {
		expect(extendDays(ON_7TH, '2026-10-07')).toBe(ON_7TH);
		expect(extendDays(ON_7TH, '2026-10-06')).toBe(ON_7TH);
	});

	it('runs on through the day after, and stops when it is missed', () => {
		expect(standingDays(ON_7TH, '2026-10-07')).toBe(ON_7TH);
		expect(standingDays(ON_7TH, '2026-10-08')).toBe(ON_7TH);
		expect(standingDays(ON_7TH, '2026-10-09')).toEqual({ ...ON_7TH, current: 0 });
	});

	it('names a best once there is one to beat', () => {
		expect(dayNews(NO_DAYS, '2026-10-07')).toEqual({
			count: 1,
			ended: false,
			best: null,
			newBest: false
		});
		expect(dayNews(ON_7TH, '2026-10-08')).toEqual({
			count: 4,
			ended: false,
			best: 5,
			newBest: false
		});
		expect(dayNews({ ...ON_7TH, best: 3 }, '2026-10-08')).toMatchObject({ best: 4, newBest: true });
	});
});

describe('the streak', () => {
	it('counts the rounds running whose world the guess named', () => {
		expect(extendStreak(NO_STREAK, [RIGHT, RIGHT, WRONG, RIGHT])).toEqual({ current: 1, best: 2 });
		expect(extendStreak({ current: 4, best: 4 }, [RIGHT, RIGHT])).toEqual({ current: 6, best: 6 });
	});

	it('ends on a round with no guess', () => {
		expect(extendStreak({ current: 3, best: 5 }, [round(null)])).toEqual({ current: 0, best: 5 });
	});
});

describe('what a recap says of the streak', () => {
	const news = (current: number, best: number, rounds: Played[]) =>
		streakNews({ current, best }, rounds);

	it('says how long it is, and how it stands to the best', () => {
		expect(news(5, 23, [RIGHT])).toEqual({ count: 6, ended: false, best: 23, newBest: false });
		expect(news(23, 23, [RIGHT])).toEqual({ count: 24, ended: false, best: 24, newBest: true });
	});

	it('has no best to tell of until a first streak is over', () => {
		for (const rounds of [[RIGHT], [RIGHT, RIGHT, RIGHT], [RIGHT, RIGHT, WRONG]])
			expect(news(0, 0, rounds)?.best).toBeNull();
		expect(news(0, 0, [RIGHT, RIGHT, WRONG, RIGHT])).toEqual({
			count: 1,
			ended: false,
			best: 2,
			newBest: false
		});
		expect(news(0, 0, [RIGHT, RIGHT, WRONG, RIGHT, RIGHT, RIGHT])).toEqual({
			count: 3,
			ended: false,
			best: 3,
			newBest: true
		});
	});

	it('says how long the streak a miss ended was', () => {
		expect(news(8, 23, [WRONG])).toEqual({ count: 8, ended: true, best: 23, newBest: false });
		expect(news(22, 23, [RIGHT, RIGHT, WRONG, WRONG])).toEqual({
			count: 24,
			ended: true,
			best: 24,
			newBest: true
		});
	});

	it('calls the record a miss ended a new best, as the tally after it does', () => {
		expect(news(3, 5, [RIGHT, RIGHT, RIGHT, WRONG])).toEqual({
			count: 6,
			ended: true,
			best: 6,
			newBest: true
		});
	});

	it('keeps a best the run set before losing it', () => {
		expect(news(22, 23, [RIGHT, RIGHT, WRONG, RIGHT, RIGHT])).toEqual({
			count: 2,
			ended: false,
			best: 24,
			newBest: true
		});
	});

	it('says nothing of a run of misses from the start', () => {
		expect(news(0, 23, [WRONG, WRONG])).toBeNull();
		expect(news(0, 0, [])).toBeNull();
	});
});

describe('what a round says of the streak', () => {
	const start = { current: 8, best: 23 };

	it('says what the tally would of the rounds so far', () => {
		for (const rounds of [[RIGHT], [WRONG], [RIGHT, RIGHT], [WRONG, RIGHT]])
			expect(roundNews(start, rounds)).toEqual(streakNews(start, rounds));
	});

	it('says nothing of a miss after a miss, which the tally tells as the end of the streak', () => {
		expect(roundNews(start, [WRONG, WRONG])).toBeNull();
		expect(streakNews(start, [WRONG, WRONG])).toEqual({
			count: 8,
			ended: true,
			best: 23,
			newBest: false
		});
	});
});

describe('a run in a row', () => {
	it('is quick play when its rules are quick play’s', () => {
		expect(kindOf(run())).toBe('quick');
		expect(kindOf(run({ settings: { ...QUICK_PLAY, timer: 60 } }))).toBe('custom');
		expect(kindOf(run({ place: 1, of: 3 }))).toBe('friends');
		expect(kindOf(run({ tutorial: true }))).toBe('tutorial');
	});

	it('says how long it was, or how it went', () => {
		expect(describePast(run())).toBe('5 rounds');
		expect(describePast(run({ settings: { ...QUICK_PLAY, rounds: 10, timer: 60 } }))).toBe(
			'10 rounds · 60 s'
		);
		expect(describePast(run({ settings: { ...QUICK_PLAY, difficulty: 'hard' } }))).toBe(
			'5 rounds · hard mode'
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

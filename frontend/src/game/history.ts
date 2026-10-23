/**
 * The runs finished in this browser, newest first: what a list of them shows,
 * and each run as a share link packs it, so its results can be opened again.
 * Beside them, the streak of rounds whose world the guess named.
 */

import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { settingsOf } from './lobby';
import { DIFFICULTY_NAMES, QUICK_PLAY, type RunSettings } from './rules';
import type { Played } from './run';
import { shareCode } from './share';

export interface PastRun {
	/** When it ended, in epoch milliseconds. */
	at: number;
	settings: RunSettings;
	total: number;
	/** Null for a run that does not fit in a link: it is listed, and cannot be
	 *  opened. */
	code: string | null;
	/** Played with friends: where this player finished, and among how many. */
	place?: number;
	of?: number;
	/** The tutorial, which its settings alone do not tell from a custom run. */
	tutorial?: true;
}

export type RunKind = 'quick' | 'custom' | 'friends' | 'tutorial';

export const KIND_LABELS: Record<RunKind, () => string> = {
	quick: m.quick_play,
	custom: m.custom_run,
	friends: m.with_friends,
	tutorial: m.tutorial
};

export function kindOf(run: PastRun): RunKind {
	if (run.of !== undefined) return 'friends';
	if (run.tutorial) return 'tutorial';
	const { rounds, movement, timer, modes } = run.settings;
	const quick =
		rounds === QUICK_PLAY.rounds &&
		movement === QUICK_PLAY.movement &&
		timer === QUICK_PLAY.timer &&
		modes.ground === QUICK_PLAY.modes.ground &&
		modes.orbit === QUICK_PLAY.modes.orbit;
	return quick ? 'quick' : 'custom';
}

/** What a row says of a run besides its kind: how it went among friends, or
 *  how long it was and, where it is not Quick Play's, its difficulty. */
export function describePast(run: PastRun): string {
	if (run.place !== undefined && run.of !== undefined)
		return m.place_of({ place: run.place, of: run.of });
	const { rounds, timer, difficulty } = run.settings;
	return [
		m.rules_rounds({ count: rounds }),
		...(timer ? [m.timer_seconds({ count: timer })] : []),
		...(difficulty === QUICK_PLAY.difficulty ? [] : [DIFFICULTY_NAMES[difficulty]()])
	].join(' · ');
}

/** A day as the reader's own clock has it, and as their language writes it. */
export function formatDay(at: number, year = false): string {
	return new Date(at).toLocaleDateString(getLocale(), {
		day: 'numeric',
		month: 'short',
		year: year ? 'numeric' : undefined
	});
}

/** A run just finished, as the history keeps it. */
export function pastRun(
	played: readonly Played[],
	settings: RunSettings,
	kind: Pick<PastRun, 'place' | 'of' | 'tutorial'> = {}
): PastRun {
	return {
		at: Date.now(),
		settings,
		total: played.reduce((sum, round) => sum + round.score.points, 0),
		code: shareCode(played),
		...kind
	};
}

const KEY = 'spaceguesser.history';
const STREAK_KEY = 'spaceguesser.streak';

/** The oldest runs go past this: the browser gives a site a few megabytes. */
const MAX_RUNS = 1000;

/** Null for anything `keepRun` did not write. */
function read(value: unknown): PastRun | null {
	const run = (value ?? {}) as Partial<PastRun>;
	if (typeof run.at !== 'number' || typeof run.total !== 'number') return null;
	const friends = Number.isInteger(run.place) && Number.isInteger(run.of);
	return {
		at: run.at,
		settings: settingsOf(run.settings),
		total: run.total,
		code: typeof run.code === 'string' ? run.code : null,
		...(friends ? { place: run.place, of: run.of } : {}),
		...(run.tutorial === true ? { tutorial: true } : {})
	};
}

export function recallHistory(): PastRun[] {
	try {
		const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		if (Array.isArray(kept)) return kept.flatMap((run) => read(run) ?? []);
	} catch {
		// Storage that is blocked or holds something else: no history.
	}
	return [];
}

/**
 * Adds a finished run, and returns the whole history. `rounds` are those of it
 * the streak goes on through. Both are read afresh, so a run finished in
 * another tab is not written over. A run already there is left alone: the
 * final screen of a game with friends comes back on a reload.
 */
export function keepRun(run: PastRun, rounds: readonly Played[]): PastRun[] {
	const kept = recallHistory();
	if (run.code !== null && kept.some((old) => old.code === run.code)) return kept;
	const next = [run, ...kept].slice(0, MAX_RUNS);
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
		localStorage.setItem(STREAK_KEY, JSON.stringify(extendStreak(recallStreak(), rounds)));
	} catch {
		// Not remembered, then.
	}
	return next;
}

export function clearHistory() {
	try {
		localStorage.removeItem(KEY);
		localStorage.removeItem(STREAK_KEY);
	} catch {
		// Nothing was kept there to begin with.
	}
}

/** Rounds running whose world the guess named. Which runs they were in is the
 *  history's to tell. */
export interface Streak {
	/** The one going on, which a wrong world ends. */
	current: number;
	best: number;
}

export const NO_STREAK: Streak = { current: 0, best: 0 };

function named({ guess, truth }: Played): boolean {
	return guess?.body === truth.body;
}

/** The streak once `rounds` are played after it. */
export function extendStreak(streak: Streak, rounds: readonly Played[]): Streak {
	let { current, best } = streak;
	for (const round of rounds) {
		current = named(round) ? current + 1 : 0;
		best = Math.max(best, current);
	}
	return { current, best };
}

/** What a recap says of the streak. */
export interface StreakNews {
	/** The streak going on, or the one the latest miss ended. */
	count: number;
	ended: boolean;
	/** Null while it is the first streak there has been, with no best to beat. */
	best: number | null;
	newBest: boolean;
}

/**
 * What the tally says: `rounds` are the run's, from where it found the streak.
 * Null when they leave none to speak of, as a run of misses from the start.
 */
export function streakNews(start: Streak, rounds: readonly Played[]): StreakNews | null {
	// Misses at the end end the streak told of, and leave the best as it was.
	let built = rounds.length;
	while (built > 0 && !named(rounds[built - 1])) built--;
	const { current: count, best } = extendStreak(start, rounds.slice(0, built));
	if (!count) return null;
	const ended = built < rounds.length;
	// The best there was when the streak began, which it had to beat.
	const began = built - count;
	const beaten = began > 0 ? extendStreak(start, rounds.slice(0, began)).best : start.best;
	if (!beaten) return { count, ended, best: null, newBest: false };
	return {
		count,
		ended,
		best,
		// A streak short of the best tells of the run's own, if it set one.
		newBest: count === best ? count > beaten : start.best > 0 && best > start.best
	};
}

/** What a round's result says, `rounds` being those so far: as the tally would
 *  of them, and so the same of the record, but nothing for a miss after a
 *  miss, which ended no streak. */
export function roundNews(start: Streak, rounds: readonly Played[]): StreakNews | null {
	const news = streakNews(start, rounds);
	return news?.ended && !extendStreak(start, rounds.slice(0, -1)).current ? null : news;
}

export function recallStreak(): Streak {
	try {
		const kept = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null') as Partial<Streak> | null;
		const { current = -1, best = -1 } = kept ?? {};
		if (Number.isInteger(current) && Number.isInteger(best) && current >= 0 && best >= current)
			return { current, best };
	} catch {
		// Storage that is blocked or holds something else: no streak.
	}
	return NO_STREAK;
}

/** The reader's own day a moment falls in, as its midnight. */
export function dayOf(at: number): number {
	const date = new Date(at);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export interface Day {
	/** Its midnight. */
	at: number;
	runs: number;
}

/**
 * The last `count` weeks, oldest first and each from its Monday, with how many
 * runs ended on each day. The days of this week still to come are null.
 */
export function weeksOf(
	runs: readonly PastRun[],
	count: number,
	now = Date.now()
): (Day | null)[][] {
	const ended = new Map<number, number>();
	for (const run of runs) ended.set(dayOf(run.at), (ended.get(dayOf(run.at)) ?? 0) + 1);
	const today = new Date(now);
	const monday = today.getDate() - ((today.getDay() + 6) % 7);
	return Array.from({ length: count }, (_, week) =>
		Array.from({ length: 7 }, (_, weekday) => {
			// Counted on the calendar: a day is not 24 hours when the clocks change.
			const date = monday - 7 * (count - 1 - week) + weekday;
			const at = new Date(today.getFullYear(), today.getMonth(), date).getTime();
			return at > now ? null : { at, runs: ended.get(at) ?? 0 };
		})
	);
}

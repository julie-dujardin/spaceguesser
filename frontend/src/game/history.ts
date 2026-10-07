/**
 * The runs finished in this browser, newest first: what a list of them shows,
 * and each run as a share link packs it, so its results can be opened again.
 */

import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { settingsOf } from './lobby';
import { QUICK_PLAY, type RunSettings } from './rules';
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
}

export type RunKind = 'quick' | 'custom' | 'friends';

export const KIND_LABELS: Record<RunKind, () => string> = {
	quick: m.quick_play,
	custom: m.custom_run,
	friends: m.with_friends
};

export function kindOf(run: PastRun): RunKind {
	if (run.of !== undefined) return 'friends';
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
 *  how long it was. */
export function describePast(run: PastRun): string {
	if (run.place !== undefined && run.of !== undefined)
		return m.place_of({ place: run.place, of: run.of });
	const { rounds, timer } = run.settings;
	const length = m.rules_rounds({ count: rounds });
	return timer ? `${length} · ${m.timer_seconds({ count: timer })}` : length;
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
	standing?: { place: number; of: number }
): PastRun {
	return {
		at: Date.now(),
		settings,
		total: played.reduce((sum, round) => sum + round.score.points, 0),
		code: shareCode(played),
		...standing
	};
}

const KEY = 'spaceguesser.history';

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
		...(friends ? { place: run.place, of: run.of } : {})
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
 * Adds a finished run, and returns the whole history. It is read afresh, so a
 * run finished in another tab is not written over. A run already there is left
 * alone: the final screen of a game with friends comes back on a reload.
 */
export function keepRun(run: PastRun): PastRun[] {
	const kept = recallHistory();
	if (run.code !== null && kept.some((old) => old.code === run.code)) return kept;
	const next = [run, ...kept].slice(0, MAX_RUNS);
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// Not remembered, then.
	}
	return next;
}

export function clearHistory() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing was kept there to begin with.
	}
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

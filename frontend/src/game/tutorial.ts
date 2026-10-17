/**
 * The tutorial: nine rounds chosen to teach the game, the same for everyone.
 * The first walks through a whole guess; the later ones have a tip each, then
 * none; every recap says what gave the place away.
 */

import type { LonLat } from 'spacemap';
import * as m from '../paraglide/messages.js';
import { bodyOf } from './bodies';
import { aim, type Round, type Stop } from './rounds';
import type { RunSettings } from './rules';

export const TUTORIAL: RunSettings = {
	rounds: 9,
	movement: 'free',
	timer: 0,
	modes: { ground: true, orbit: true }
};

/** The run's date. One for every round, as a run and its link carry one, and
 *  an hour that lights each place flown over. */
export const TUTORIAL_DATE = Date.parse('2026-10-27T15:30:00Z');

/** What the reader has done in the round so far. */
export interface Progress {
	/** When they first turned the view, in epoch milliseconds. */
	dragged: number | null;
	/** When they first opened the guess panel. */
	opened: number | null;
	/** The body picked, if one is. */
	picked: string | null;
	/** A place picked on it. */
	placed: boolean;
	/** What a tip's wait is measured against. */
	now: number;
}

/** A tip that is over a while after the reader does something: time to
 *  look round, or to read the map, before being told what comes next. */
interface Wait {
	from: 'dragged' | 'opened';
	ms: number;
}

/** What a tip is about, ringed while it is shown. */
export type Highlight = 'panel' | 'surface' | 'guess' | 'tools';

export interface Tip {
	id: string;
	lines: (() => string)[];
	/** Under the round's pills, beside the guess panel, or over the view's own
	 *  controls. */
	at: 'view' | 'panel' | 'tools';
	/** Not shown before this holds. */
	when?: (progress: Progress) => boolean;
	/** Over once this holds, as if the reader had said they got it. */
	done?: (progress: Progress) => boolean;
	/** Or over once this has run out. */
	wait?: Wait;
	ring?: (progress: Progress) => Highlight;
}

type Where =
	| { mode: 'ground'; body: string; panorama: string }
	/** `noon` is where the Sun stands at `TUTORIAL_DATE`, as the map says. */
	| { mode: 'orbit'; body: string; over: LonLat; noon: LonLat };

export interface Lesson {
	where: Where;
	tips: Tip[];
	/** What gave the place away, a paragraph each. */
	recap: (() => string)[];
}

/** A whole guess, a step at a time. */
const GUIDED: Tip[] = [
	{
		id: 'look',
		lines: [m.tutorial_look, m.tutorial_look_more],
		at: 'view',
		wait: { from: 'dragged', ms: 6_000 }
	},
	{
		id: 'map',
		lines: [m.tutorial_map, m.tutorial_map_more],
		at: 'panel',
		wait: { from: 'opened', ms: 2_000 },
		ring: () => 'panel'
	},
	{
		id: 'levels',
		lines: [m.tutorial_levels, m.tutorial_levels_more],
		at: 'panel',
		when: (progress) => progress.opened !== null,
		done: (progress) => progress.picked !== null,
		ring: () => 'surface'
	},
	{
		id: 'place',
		lines: [m.tutorial_place, m.tutorial_place_more],
		at: 'panel',
		// A body with no map has no place to pick.
		when: (progress) => !!bodyOf(progress.picked ?? '')?.surface,
		ring: (progress) => (progress.placed ? 'guess' : 'surface')
	}
];

/** One tip, under the round's pills, until the reader says they got it. */
const aside = (id: string, ...lines: (() => string)[]): Tip[] => [{ id, lines, at: 'view' }];

export const LESSONS: Lesson[] = [
	{
		where: {
			mode: 'ground',
			body: 'naif-499',
			panorama: 'perseverance-mastcamz-mastcam-z_360_butler_landing_1_sols03-11_360'
		},
		tips: GUIDED,
		recap: [m.tutorial_recap_perseverance, m.tutorial_recap_perseverance_more]
	},
	{
		// Over Herschel, with Saturn up on the eastern horizon.
		where: {
			mode: 'orbit',
			body: 'naif-601',
			over: { lat: -1.7, lon: -111.8 },
			noon: { lat: -6.88, lon: -102.338 }
		},
		tips: aside('mimas', m.tutorial_mimas, m.tutorial_mimas_more),
		recap: [m.tutorial_recap_mimas, m.tutorial_recap_mimas_more]
	},
	{
		where: { mode: 'ground', body: 'naif-606', panorama: 'huygens-2km' },
		tips: aside('huygens', m.tutorial_huygens),
		recap: [m.tutorial_recap_huygens, m.tutorial_recap_huygens_more]
	},
	{
		// Bradbury Landing, with Mount Sharp to the south-east.
		where: {
			mode: 'ground',
			body: 'naif-499',
			panorama: 'curiosity-n_l000_0002_edr002cyltum0000_corr_m2'
		},
		tips: aside('curiosity', m.tutorial_curiosity, m.tutorial_curiosity_more),
		recap: [m.tutorial_recap_curiosity, m.tutorial_recap_curiosity_more]
	},
	{
		// Near the middle of the face turned away from Jupiter, which the moon
		// hides from there whichever way the view is turned: it shows only once
		// the camera is flown round.
		where: {
			mode: 'orbit',
			body: 'naif-503',
			over: { lat: 0, lon: -172 },
			noon: { lat: 0.314, lon: -167.787 }
		},
		tips: [
			{
				id: 'ganymede',
				lines: [m.tutorial_ganymede, m.tutorial_ganymede_more],
				at: 'tools',
				ring: () => 'tools'
			}
		],
		recap: [m.tutorial_recap_ganymede, m.tutorial_recap_ganymede_more]
	},
	{
		where: {
			mode: 'orbit',
			body: 'naif-902',
			over: { lat: -52, lon: 70.9 },
			noon: { lat: -51.968, lon: 70.889 }
		},
		tips: aside('nix', m.tutorial_nix),
		recap: [m.tutorial_recap_nix, m.tutorial_recap_nix_more]
	},
	{
		// Over Occator.
		where: {
			mode: 'orbit',
			body: 'naif-2000001',
			over: { lat: 19.8, lon: -120.7 },
			noon: { lat: -3.43, lon: -111.579 }
		},
		tips: aside('ceres', m.tutorial_ceres),
		recap: [m.tutorial_recap_ceres, m.tutorial_recap_ceres_more]
	},
	{
		// Over Loki, on the side that faces Jupiter.
		where: {
			mode: 'orbit',
			body: 'naif-501',
			over: { lat: 13, lon: 51 },
			noon: { lat: 0.239, lon: 27.149 }
		},
		tips: [],
		recap: [m.tutorial_recap_io, m.tutorial_recap_io_more]
	},
	{
		where: { mode: 'ground', body: 'naif-301', panorama: 'apollo17-landing' },
		tips: [],
		recap: [m.tutorial_recap_apollo, m.tutorial_recap_apollo_more]
	}
];

/**
 * The tutorial's rounds, each with its lesson. One whose panorama is not among
 * `stops`, or that is flown where there is no map to fly in, is left out.
 */
export function tutorialRun(
	stops: readonly Stop[],
	canOrbit: boolean
): { rounds: Round[]; lessons: Lesson[] } {
	const rounds: Round[] = [];
	const lessons: Lesson[] = [];
	for (const lesson of LESSONS) {
		const { where } = lesson;
		let round: Round;
		if (where.mode === 'ground') {
			const stop = stops.find(
				(stop) => stop.body === where.body && stop.entry.id === where.panorama
			);
			if (!stop) continue;
			round = { mode: 'ground', body: where.body, entry: stop.entry, time: TUTORIAL_DATE };
		} else {
			if (!canOrbit) continue;
			round = {
				mode: 'orbit',
				body: where.body,
				time: TUTORIAL_DATE,
				...aim(where.over, where.noon)
			};
		}
		rounds.push(round);
		lessons.push(lesson);
	}
	return { rounds, lessons };
}

/** The tips the reader waved off, by id, and the earlier one they went back
 *  to, by its place. */
export interface Seen {
	dismissed: readonly string[];
	back: number | null;
}

export const UNSEEN: Seen = { dismissed: [], back: null };

/** The first tip the reader has neither done nor waved off; past the end
 *  when there is none. */
/** When a tip's wait runs out; null before it has begun, or for a tip that
 *  has none. */
function endOf(tip: Tip, progress: Progress): number | null {
	if (!tip.wait) return null;
	const from = progress[tip.wait.from];
	return from === null ? null : from + tip.wait.ms;
}

/** When the next wait runs out, which may move the tips on; null when none
 *  is running. */
export function nextEnd(tips: readonly Tip[], progress: Progress): number | null {
	const ends = tips
		.flatMap((tip) => endOf(tip, progress) ?? [])
		.filter((end) => end > progress.now);
	return ends.length ? Math.min(...ends) : null;
}

function over(tip: Tip, progress: Progress): boolean {
	const end = endOf(tip, progress);
	return !!tip.done?.(progress) || (end !== null && end <= progress.now);
}

function due(tips: readonly Tip[], progress: Progress, seen: Seen): number {
	const at = tips.findIndex((tip) => !seen.dismissed.includes(tip.id) && !over(tip, progress));
	return at < 0 ? tips.length : at;
}

/** The wait the tip at `at` is counting down, while it is. */
export function countdown(
	tips: readonly Tip[],
	at: number,
	progress: Progress
): { end: number; ms: number } | null {
	const tip = tips[at];
	const end = tip && endOf(tip, progress);
	return tip?.wait && end !== null && end > progress.now ? { end, ms: tip.wait.ms } : null;
}

/**
 * The place of the tip to show, -1 for none: the one gone back to, else the
 * one due once it is time for it.
 */
export function shownTip(tips: readonly Tip[], progress: Progress, seen: Seen): number {
	if (seen.back !== null) return seen.back;
	const at = due(tips, progress, seen);
	return at < tips.length && (tips[at].when?.(progress) ?? true) ? at : -1;
}

/** "Got it": the tip shown is done with. One gone back to leads on to the one
 *  after it, as far as the one due. */
export function onward(tips: readonly Tip[], progress: Progress, seen: Seen): Seen {
	if (seen.back !== null) {
		const next = seen.back + 1;
		return { ...seen, back: next < due(tips, progress, seen) ? next : null };
	}
	const at = shownTip(tips, progress, seen);
	return at < 0 ? seen : { ...seen, dismissed: [...seen.dismissed, tips[at].id] };
}

/** "Previous": the tip before the one shown. */
export function backward(tips: readonly Tip[], progress: Progress, seen: Seen): Seen {
	const at = shownTip(tips, progress, seen);
	return at > 0 ? { ...seen, back: at - 1 } : seen;
}

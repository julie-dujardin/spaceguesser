/** One solo run: the rounds drawn for it, and what the reader made of them. */

import type { PanoramaEntry } from 'spacemap';
import type { Place, Round } from './rounds';
import type { RunSettings } from './rules';
import { score, type Guess, type Score, type Sky } from './scoring';

export interface Played {
	round: Round;
	/** Where the round was: the panorama's place, or the one flown over. */
	truth: Place;
	/** Null when the round ran out with nothing picked. */
	guess: Guess | null;
	score: Score;
	/** Seconds still on the clock when the guess went in; null on an untimed run. */
	secondsLeft: number | null;
	timedOut: boolean;
}

/** What a guess is worth. `radiusKm` is the true body's. */
export function play(
	round: Round,
	truth: Place,
	guess: Guess | null,
	sky: Sky,
	radiusKm: number | null,
	secondsLeft: number | null,
	timedOut: boolean
): Played {
	return { round, truth, guess, score: score(truth, guess, sky, radiusKm), secondsLeft, timedOut };
}

export type Phase = 'home' | 'setup' | 'playing' | 'result' | 'final';

export interface Run {
	phase: Phase;
	/** Opened from a link rather than played here: a tally to look at, with no
	 *  rules to play it again by. */
	shared: boolean;
	settings: RunSettings;
	drawn: Round[];
	round: number;
	/** Where the reader is standing, which free movement lets them change. */
	standing: PanoramaEntry | null;
	played: Played[];
}

export type Action =
	| { kind: 'home' }
	| { kind: 'setup' }
	| { kind: 'start'; settings: RunSettings; drawn: Round[] }
	/** A run someone shared, as its link told it. */
	| { kind: 'visit'; played: Played[] }
	| { kind: 'stand'; entry: PanoramaEntry }
	/** The round on screen cannot be played, and this one takes its turn. */
	| { kind: 'redraw'; round: Round }
	| { kind: 'commit'; played: Played }
	| { kind: 'next' };

export const INITIAL: Run = {
	phase: 'home',
	shared: false,
	settings: { rounds: 0, movement: 'free', timer: 0, modes: { ground: true, orbit: true } },
	drawn: [],
	round: 0,
	standing: null,
	played: []
};

export function reduce(run: Run, action: Action): Run {
	switch (action.kind) {
		case 'home':
			return INITIAL;
		case 'setup':
			return { ...INITIAL, phase: 'setup' };
		case 'start':
			return {
				phase: 'playing',
				shared: false,
				settings: action.settings,
				drawn: action.drawn,
				round: 0,
				standing: null,
				played: []
			};
		case 'visit':
			return { ...INITIAL, phase: 'final', shared: true, played: action.played };
		case 'stand':
			return { ...run, standing: action.entry };
		case 'redraw':
			return {
				...run,
				drawn: run.drawn.map((round, i) => (i === run.round ? action.round : round))
			};
		case 'commit':
			// A guess still being measured when the run was left has no run to land in.
			if (run.phase !== 'playing') return run;
			return { ...run, phase: 'result', played: [...run.played, action.played] };
		case 'next':
			return run.round + 1 >= run.drawn.length
				? { ...run, phase: 'final' }
				: { ...run, phase: 'playing', round: run.round + 1, standing: null };
	}
}

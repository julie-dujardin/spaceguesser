/** One solo run: the panoramas drawn for it, and what the reader made of them. */

import type { LonLat, PanoramaEntry } from 'spacemap';
import type { RunSettings } from './rules';

export interface Played {
	truth: PanoramaEntry;
	/** Null when the round ran out with nothing picked. */
	guess: LonLat | null;
	distanceKm: number;
	points: number;
	/** Seconds still on the clock when the guess went in; null on an untimed run. */
	secondsLeft: number | null;
	timedOut: boolean;
}

export type Phase = 'home' | 'setup' | 'playing' | 'result' | 'final';

export interface Run {
	phase: Phase;
	settings: RunSettings;
	/** The panorama each round opens on. */
	drawn: PanoramaEntry[];
	round: number;
	/** Where the reader is standing, which free movement lets them change. */
	standing: PanoramaEntry | null;
	played: Played[];
}

export type Action =
	| { kind: 'home' }
	| { kind: 'setup' }
	| { kind: 'start'; settings: RunSettings; drawn: PanoramaEntry[] }
	| { kind: 'stand'; entry: PanoramaEntry }
	| { kind: 'commit'; played: Played }
	| { kind: 'next' };

export const INITIAL: Run = {
	phase: 'home',
	settings: { rounds: 0, movement: 'free', timer: 0 },
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
				settings: action.settings,
				drawn: action.drawn,
				round: 0,
				standing: null,
				played: []
			};
		case 'stand':
			return { ...run, standing: action.entry };
		case 'commit':
			return { ...run, phase: 'result', played: [...run.played, action.played] };
		case 'next':
			return run.round + 1 >= run.drawn.length
				? { ...run, phase: 'final' }
				: { ...run, phase: 'playing', round: run.round + 1, standing: null };
	}
}

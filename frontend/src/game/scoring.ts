/**
 * What a guess is worth. A run now spans the Solar System, and one curve cannot
 * tell Titan from Enceladus and Saturn from Jupiter at once, so the points are
 * split three ways: for the system, for the body in it, for the place on it.
 * Each falls off as the genre has it, against the size of what it is about.
 */

import type { LonLat } from 'spacemap';
import { bodyOf, systemOf } from './bodies';
import type { Place } from './rounds';
import { distanceKm } from './rules';

export const MAX_POINTS = 5000;

export const TIERS = { system: 1000, body: 1500, surface: 2500 } as const;

const AU_KM = 149_597_870.7;

/** How far apart two systems in play can be: Pluto to the far side of
 *  Neptune's orbit, near enough. */
export const SOLAR_EXTENT_KM = 80 * AU_KM;

/** Where the reader said the round was. A body with no map to pick on is
 *  guessed whole, with no place. */
export interface Guess {
	body: string;
	at: LonLat | null;
}

/**
 * The sky at the round's time, as far as scoring needs it. Null where the map
 * could not say, which scores as a miss on that tier rather than as a guess.
 */
export interface Sky {
	/** Between the primaries of the guessed system and the true one. */
	systemsKm: number | null;
	/** Between the guessed body and the true one, when they share a system. */
	bodiesKm: number | null;
	/** How wide the true system is: twice its farthest body in play from the
	 *  primary. Zero for a system of one. */
	systemExtentKm: number | null;
}

export interface Score {
	points: number;
	/** What each tier gave. */
	system: number;
	body: number;
	surface: number;
	/** Along the ground, when the guess is on the right body's map. */
	groundKm: number | null;
	/** Through space, when it is on another body. */
	spaceKm: number | null;
}

/** Points fall off exponentially with the miss, as the genre has them. */
export function falloff(max: number, miss: number, size: number): number {
	if (miss <= 0) return max;
	if (size <= 0) return 0;
	return Math.round(max * Math.exp((-10 * miss) / size));
}

/** A sky nothing was asked of: enough to score a guess on the right body. */
export const NO_SKY: Sky = { systemsKm: null, bodiesKm: null, systemExtentKm: null };

const NOTHING: Score = { points: 0, system: 0, body: 0, surface: 0, groundKm: null, spaceKm: null };

/**
 * Score `guess` against `truth`. `radiusKm` is the true body's, which sets the
 * scale of a miss along its ground.
 */
export function score(truth: Place, guess: Guess | null, sky: Sky, radiusKm: number | null): Score {
	if (!guess) return NOTHING;
	const sameSystem = systemOf(guess.body) === systemOf(truth.body);
	const sameBody = guess.body === truth.body;

	const system = sameSystem
		? TIERS.system
		: sky.systemsKm === null
			? 0
			: falloff(TIERS.system, sky.systemsKm, SOLAR_EXTENT_KM);

	let body = 0;
	if (sameBody) body = TIERS.body;
	else if (sameSystem && sky.bodiesKm !== null && sky.systemExtentKm !== null)
		body = falloff(TIERS.body, sky.bodiesKm, sky.systemExtentKm);

	let surface = 0;
	let groundKm: number | null = null;
	if (sameBody) {
		// A body guessed whole is right once it is the right body.
		if (!bodyOf(truth.body)?.surface) surface = TIERS.surface;
		else if (guess.at && radiusKm) {
			groundKm = distanceKm(guess.at, truth, radiusKm);
			surface = falloff(TIERS.surface, groundKm, Math.PI * radiusKm);
		}
	}

	return {
		points: system + body + surface,
		system,
		body,
		surface,
		groundKm,
		spaceKm: sameBody ? null : sameSystem ? sky.bodiesKm : sky.systemsKm
	};
}

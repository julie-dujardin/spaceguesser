/** What a round asks: a place stood on, or a place stood over. */

import type { LonLat, PanoramaEntry } from 'spacemap';
import { BODIES, bodyOf, viewDistance, type BodyInfo } from './bodies';
import { drawRounds, formatTaken, formatWhen } from './rules';

/** A panorama, and the body it was taken on. */
export interface Stop {
	body: string;
	entry: PanoramaEntry;
}

interface Asked {
	body: string;
	/** Epoch milliseconds the round is measured at, the same for every round of
	 *  a run: the bodies are where they are then, which is what a guess on the
	 *  wrong one is measured against, and one map can show every miss of it.
	 *  A panorama shows its own date instead, see `shownDate`. */
	time: number;
}

/** Standing on the ground, in a panorama. */
export interface GroundRound extends Asked {
	mode: 'ground';
	entry: PanoramaEntry;
}

/**
 * Hanging over a body, somewhere on its lit side. The place is not stored: it
 * is `spot`, read off where the Sun stands at `time`, so the round is drawn
 * without knowing the sky and comes out the same for everyone playing it.
 */
export interface OrbitRound extends Asked {
	mode: 'orbit';
	/** Both in [0, 1): how far from the sub-solar point, and which way. */
	u: number;
	v: number;
}

export type Round = GroundRound | OrbitRound;
export type Mode = Round['mode'];

/** The date a round shows. A panorama has its own, the day it was taken; the
 *  run's date is only where the bodies are when a miss is measured. */
export function shownDate(round: Round): string {
	return round.mode === 'ground' ? formatTaken(round.entry.time) : formatWhen(round.time);
}

/** How high over the ground a round looks from, in km: a flown round's
 *  standoff, or a panorama taken on the way down. Null standing on it. */
export function altitudeKm(round: Round): number | null {
	if (round.mode === 'ground') return round.entry.altitude_m ? round.entry.altitude_m / 1000 : null;
	const body = bodyOf(round.body);
	return body ? (viewDistance(body) - 1) * body.radiusKm : null;
}

/** A place on a body, which is what a round is finally about. */
export interface Place extends LonLat {
	body: string;
}

/** A run is flown within this long of now, either side: near enough to be the
 *  sky as it is, wide enough that every run is not the same sky. */
const WINDOW_MS = 30 * 86_400_000;

/** The date of a run. */
export function drawDate(now = Date.now(), random: () => number = Math.random): number {
	return Math.round(now + (2 * random() - 1) * WINDOW_MS);
}

/** The Sun stands at least this high over a drawn place. A coarse map is seen
 *  from far enough to show the whole disc, and one centred any nearer the
 *  terminator is half night. */
const MIN_SUN_DEG = 40;

const RAD = Math.PI / 180;

/** Where an orbit round is, given where the Sun is overhead: uniform over the
 *  cap of the body the Sun stands high enough on. */
export function spot(round: Pick<OrbitRound, 'u' | 'v'>, noon: LonLat): LonLat {
	const reach = Math.acos(1 - round.u * (1 - Math.cos((90 - MIN_SUN_DEG) * RAD)));
	const bearing = round.v * 2 * Math.PI;
	const lat0 = noon.lat * RAD;
	const lat = Math.asin(
		Math.sin(lat0) * Math.cos(reach) + Math.cos(lat0) * Math.sin(reach) * Math.cos(bearing)
	);
	const lon =
		noon.lon * RAD +
		Math.atan2(
			Math.sin(bearing) * Math.sin(reach) * Math.cos(lat0),
			Math.cos(reach) - Math.sin(lat0) * Math.sin(lat)
		);
	return { lat: lat / RAD, lon: ((((lon / RAD + 180) % 360) + 360) % 360) - 180 };
}

/** The place a body with no measured spin is stood over: it has no noon, so
 *  anywhere is as good as anywhere. */
export function anywhere(round: Pick<OrbitRound, 'u' | 'v'>): LonLat {
	return { lat: Math.asin(2 * round.u - 1) / RAD, lon: round.v * 360 - 180 };
}

export interface Modes {
	ground: boolean;
	orbit: boolean;
}

function pickBody(spent: readonly Round[], random: () => number): BodyInfo {
	const used = new Set(spent.filter((round) => round.mode === 'orbit').map((round) => round.body));
	const fresh = BODIES.filter((body) => !used.has(body.id));
	const from = fresh.length ? fresh : BODIES;
	return from[Math.floor(random() * from.length)];
}

/**
 * `count` rounds, each a coin toss between the modes switched on. Stops are
 * drawn as they always were, spread across probes; bodies are drawn evenly and
 * not twice while there is one left. `before` is read as the rounds just before
 * these, and `date` is the run's when these go on with it. With no stops to
 * draw from, every round is from orbit.
 */
export function drawRun(
	stops: readonly Stop[],
	count: number,
	modes: Modes,
	before: readonly Round[] = [],
	date = drawDate(),
	random: () => number = Math.random
): Round[] {
	const ground = modes.ground && stops.length > 0;
	const orbit = modes.orbit || !ground;
	const drawn: Round[] = [];
	const bodyOfEntry = new Map(stops.map((stop) => [stop.entry.id, stop.body]));
	const entries = stops.map((stop) => stop.entry);
	for (let i = 0; i < count; i++) {
		const spent = [...before, ...drawn];
		if (ground && (!orbit || random() < 0.5)) {
			const stood = spent.flatMap((round) => (round.mode === 'ground' ? [round.entry] : []));
			const [entry] = drawRounds(entries, 1, stood);
			if (entry) {
				drawn.push({ mode: 'ground', body: bodyOfEntry.get(entry.id)!, entry, time: date });
				continue;
			}
			// The stops ran out: the rest of the run is flown.
		}
		drawn.push({
			mode: 'orbit',
			body: pickBody(spent, random).id,
			time: date,
			u: random(),
			v: random()
		});
	}
	return drawn;
}

/** What a round asks: a place stood on, or a place stood over. */

import type { LonLat, PanoramaEntry } from 'spacemap';
import { BODIES, type BodyInfo } from './bodies';
import { drawRounds } from './rules';

/** A panorama, and the body it was taken on. */
export interface Stop {
	body: string;
	entry: PanoramaEntry;
}

interface Asked {
	body: string;
	/** Epoch milliseconds the round happens at: the bodies are where they were
	 *  then, which is what a guess on the wrong one is measured against. */
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

/** A place on a body, which is what a round is finally about. */
export interface Place extends LonLat {
	body: string;
}

/** Rounds happen within this long of now, either side: near enough to be the
 *  sky as it is, wide enough that every round is not the same sky. */
const WINDOW_MS = 30 * 86_400_000;

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
 * not twice while there is one left. `taken` is read as the rounds just before
 * these. With no stops to draw from, every round is from orbit.
 */
export function drawRun(
	stops: readonly Stop[],
	count: number,
	modes: Modes,
	taken: readonly Round[] = [],
	now = Date.now(),
	random: () => number = Math.random
): Round[] {
	const ground = modes.ground && stops.length > 0;
	const orbit = modes.orbit || !ground;
	const drawn: Round[] = [];
	const bodyOfEntry = new Map(stops.map((stop) => [stop.entry.id, stop.body]));
	const entries = stops.map((stop) => stop.entry);
	for (let i = 0; i < count; i++) {
		const spent = [...taken, ...drawn];
		const time = Math.round(now + (2 * random() - 1) * WINDOW_MS);
		if (ground && (!orbit || random() < 0.5)) {
			const stood = spent.flatMap((round) => (round.mode === 'ground' ? [round.entry] : []));
			const [entry] = drawRounds(entries, 1, stood);
			if (entry) {
				drawn.push({ mode: 'ground', body: bodyOfEntry.get(entry.id)!, entry, time });
				continue;
			}
			// The stops ran out: the rest of the run is flown.
		}
		drawn.push({ mode: 'orbit', body: pickBody(spent, random).id, time, u: random(), v: random() });
	}
	return drawn;
}

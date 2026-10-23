/** What a round asks: a place stood on, or a place stood over. */

import type { LonLat, PanoramaEntry } from 'spacemap';
import { POOLS, bodyOf, viewDistance, type BodyInfo, type Difficulty } from './bodies';
import { eclipsed, shadedOn } from './eclipse';
import { drawRounds, formatWhen, takenAt } from './rules';

/** A panorama, and the body it was taken on. */
export interface Stop {
	body: string;
	entry: PanoramaEntry;
}

interface Asked {
	body: string;
	/** The run's date in epoch milliseconds, the same for every round of it:
	 *  when a flown round happens, and where one map shows the whole run. A
	 *  panorama has its own date, see `measuredAt`. */
	time: number;
}

/** Standing on the ground, in a panorama. */
export interface GroundRound extends Asked {
	mode: 'ground';
	entry: PanoramaEntry;
}

/**
 * Hanging over a body, somewhere on its lit side. The place is not stored: it
 * is `spot`, read off where the Sun stands at `time`, so it comes out the same
 * for everyone playing the round.
 */
export interface OrbitRound extends Asked {
	mode: 'orbit';
	/** Both in [0, 1): how far from the sub-solar point, and which way. */
	u: number;
	v: number;
}

export type Round = GroundRound | OrbitRound;
export type Mode = Round['mode'];

/** The date a round shows. Only a flown round shows one: where the Sun lights
 *  the body is worked out from it. */
export function shownDate(round: Round): string | null {
	return round.mode === 'orbit' ? formatWhen(round.time) : null;
}

/** Epoch milliseconds a miss is measured at: the bodies were where they were
 *  when the round happened, which for a panorama is when it was taken. */
export function measuredAt(round: Round): number {
	return (round.mode === 'ground' ? takenAt(round.entry.time) : null) ?? round.time;
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

export const RAD = Math.PI / 180;

/** Where a great circle from `from` lands after `reach` radians, setting off
 *  `bearing` radians clockwise from north. */
export function step(from: LonLat, bearing: number, reach: number): LonLat {
	const lat0 = from.lat * RAD;
	const lat = Math.asin(
		Math.sin(lat0) * Math.cos(reach) + Math.cos(lat0) * Math.sin(reach) * Math.cos(bearing)
	);
	const lon =
		from.lon * RAD +
		Math.atan2(
			Math.sin(bearing) * Math.sin(reach) * Math.cos(lat0),
			Math.cos(reach) - Math.sin(lat0) * Math.sin(lat)
		);
	return { lat: lat / RAD, lon: ((((lon / RAD + 180) % 360) + 360) % 360) - 180 };
}

/** Where an orbit round is, given where the Sun is overhead: uniform over the
 *  cap of the body the Sun stands high enough on. */
export function spot(round: Pick<OrbitRound, 'u' | 'v'>, noon: LonLat): LonLat {
	const reach = Math.acos(1 - round.u * (1 - Math.cos((90 - MIN_SUN_DEG) * RAD)));
	return step(noon, round.v * 2 * Math.PI, reach);
}

/** The `u` and `v` that `spot` takes to `over` with the Sun overhead at
 *  `noon`. A `u` past 1 is a place where the Sun stands too low. */
export function aim(over: LonLat, noon: LonLat): Pick<OrbitRound, 'u' | 'v'> {
	const lat0 = noon.lat * RAD;
	const lat = over.lat * RAD;
	const dlon = (over.lon - noon.lon) * RAD;
	const cos = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(dlon);
	const bearing = Math.atan2(
		Math.sin(dlon) * Math.cos(lat),
		Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(dlon)
	);
	return {
		u: (1 - cos) / (1 - Math.cos((90 - MIN_SUN_DEG) * RAD)),
		v: (((bearing / (2 * Math.PI)) % 1) + 1) % 1
	};
}

export interface Modes {
	ground: boolean;
	orbit: boolean;
}

/** What a run's rounds are drawn from. */
export interface Pool {
	modes: Modes;
	difficulty: Difficulty;
}

function pickBody(
	pool: readonly BodyInfo[],
	spent: readonly Round[],
	shaded: ReadonlySet<string>,
	random: () => number
): BodyInfo {
	const used = new Set(spent.filter((round) => round.mode === 'orbit').map((round) => round.body));
	const lit = pool.filter((body) => !shaded.has(body.id));
	const fresh = lit.filter((body) => !used.has(body.id));
	const from = fresh.length ? fresh : lit;
	return from[Math.floor(random() * from.length)];
}

/**
 * `count` rounds, each a coin toss between the modes switched on. Both draw
 * from the difficulty's pool: a stop on a body the guess panel does not offer
 * is left out. Stops are spread across probes; bodies are drawn evenly, none
 * twice while another is left and none of `shaded`. `before` is the rounds
 * just before these, and `date` the run's when these go on with it. With no
 * stops to draw from, every round is from orbit.
 */
export function drawRun(
	stops: readonly Stop[],
	count: number,
	{ modes, difficulty }: Pool,
	before: readonly Round[] = [],
	date = drawDate(),
	shaded: ReadonlySet<string> = new Set(),
	random: () => number = Math.random
): Round[] {
	const pool = POOLS[difficulty];
	const offered = new Set(pool.map((body) => body.id));
	const standing = stops.filter((stop) => offered.has(stop.body));
	const ground = modes.ground && standing.length > 0;
	const orbit = modes.orbit || !ground;
	const drawn: Round[] = [];
	const bodyOfEntry = new Map(standing.map((stop) => [stop.entry.id, stop.body]));
	const entries = standing.map((stop) => stop.entry);
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
			body: pickBody(pool, spent, shaded, random).id,
			time: date,
			u: random(),
			v: random()
		});
	}
	return drawn;
}

/** A sky that has not answered by now keeps no draw waiting. */
const SKY_TIMEOUT_MS = 5_000;

/**
 * `drawRun` once the sky of `date` is read, so over no moon in shadow then.
 * What cannot fly does not ask, and what is not read in time shades nothing.
 */
export async function drawLitRun(
	stops: readonly Stop[],
	count: number,
	pool: Pool,
	before: readonly Round[] = [],
	date = drawDate()
): Promise<Round[]> {
	if (pool.modes.orbit || !pool.modes.ground || stops.length === 0)
		await Promise.race([
			eclipsed(date),
			new Promise((resolve) => setTimeout(resolve, SKY_TIMEOUT_MS))
		]);
	return drawRun(stops, count, pool, before, date, shadedOn(date));
}

/** What a run is made of, and what a guess is worth. */

import type { PanoramaEntry } from 'spacemap';
import { groundDistanceM } from 'spacemap';

/** The only body with published panoramas today. `fetchPanoramaIndex` lists
 *  the rest as they land. */
export const MARS = 'naif-499';

/** The SDK names bodies but does not say what they are called, so the one
 *  body in play is named here. */
export const BODY_NAMES: Record<string, string> = { [MARS]: 'Mars' };

export type Movement = 'free' | 'look' | 'frozen';

export interface RunSettings {
	rounds: number;
	movement: Movement;
	/** Seconds a round lasts; 0 for no timer. */
	timer: number;
}

export const QUICK_PLAY: RunSettings = { rounds: 5, movement: 'free', timer: 0 };

export const MOVEMENT_LABELS: Record<Movement, string> = {
	free: 'free',
	look: 'look only',
	frozen: 'no pan or zoom'
};

/** A sweep narrower than this is a strip of ground with no horizon to read,
 *  which is a coin toss rather than a puzzle. */
const MIN_SPHERE_PERCENT = 25;

/** Two panoramas from the same stop are the same round twice over. */
const SAME_PLACE_DEG = 0.002;

/** Rounds this close together come from different probes where the pool
 *  allows it: one traverse several rounds running is one puzzle asked twice.
 *  Where it cannot, the gap shrinks rather than the run. */
const PROBE_GAP = 3;

/** Playable panoramas, in no particular order. */
export function playable(entries: readonly PanoramaEntry[]): PanoramaEntry[] {
	return entries.filter((e) => (e.sphere_percent ?? 0) >= MIN_SPHERE_PERCENT);
}

/** An entry with no mission stands alone rather than joining a pool of
 *  unknowns that would then block each other. */
function probeOf(entry: PanoramaEntry): string {
	return entry.mission ?? entry.id;
}

/** One of `rest`, preferring the probes missing from the last `PROBE_GAP - 1`
 *  rounds. A pool of too few probes relaxes the gap a round at a time. */
function pick(rest: readonly PanoramaEntry[], spent: readonly PanoramaEntry[]): PanoramaEntry {
	for (let gap = PROBE_GAP - 1; gap > 0; gap--) {
		const recent = new Set(spent.slice(-gap).map(probeOf));
		const fresh = rest.filter((e) => !recent.has(probeOf(e)));
		if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
	}
	return rest[Math.floor(Math.random() * rest.length)];
}

/** `count` panoramas, none of them from a stop already drawn or in `taken`,
 *  and spread across probes as far as the pool allows. `taken` is read as the
 *  rounds just before these, so an opener counts against the ones that follow
 *  it. */
export function drawRounds(
	pool: readonly PanoramaEntry[],
	count: number,
	taken: readonly PanoramaEntry[] = []
): PanoramaEntry[] {
	const rest = [...pool];
	const picked: PanoramaEntry[] = [];
	const spent = [...taken];
	while (picked.length < count && rest.length) {
		const entry = pick(rest, spent);
		rest.splice(rest.indexOf(entry), 1);
		const near = spent.some(
			(p) =>
				Math.abs(p.lat - entry.lat) < SAME_PLACE_DEG && Math.abs(p.lon - entry.lon) < SAME_PLACE_DEG
		);
		if (near) continue;
		picked.push(entry);
		spent.push(entry);
	}
	return picked;
}

export const MAX_POINTS = 5000;

/**
 * How far apart the ends of the pool are: the diagonal of what the panoramas
 * cover, which is the distance a guess can be wrong by and still be on the
 * board. Scoring against it rather than against the body keeps a run fair as
 * coverage grows — today two craters on Mars, tomorrow whatever lands.
 */
export function extentKm(pool: readonly PanoramaEntry[], radiusKm: number): number {
	if (pool.length < 2) return Math.PI * radiusKm;
	const lats = pool.map((e) => e.lat);
	const lons = pool.map((e) => e.lon);
	const corner = (pick: (values: number[]) => number) => ({
		lat: pick(lats),
		lon: pick(lons)
	});
	return distanceKm(
		corner((v) => Math.min(...v)),
		corner((v) => Math.max(...v)),
		radiusKm
	);
}

/** Points fall off exponentially with the miss, as the genre has them. */
export function scoreFor(distanceKm: number, extentKm: number): number {
	return Math.round(MAX_POINTS * Math.exp((-10 * distanceKm) / extentKm));
}

export function distanceKm(
	a: { lat: number; lon: number },
	b: { lat: number; lon: number },
	radiusKm: number
): number {
	return groundDistanceM(a, b, radiusKm) / 1000;
}

export function formatDistance(km: number): string {
	if (km < 1) return `${Math.round(km * 1000)} m`;
	if (km < 100) return `${km.toFixed(1)} km`;
	return `${Math.round(km).toLocaleString('en')} km`;
}

export function formatClock(seconds: number): string {
	const s = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

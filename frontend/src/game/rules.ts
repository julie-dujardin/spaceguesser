/** What a run is made of. */

import type { PanoramaEntry } from 'spacemap';
import { groundDistanceM, isViewable } from 'spacemap';
import type { Modes } from './rounds';

export type Movement = 'free' | 'look' | 'frozen';

export interface RunSettings {
	rounds: number;
	movement: Movement;
	/** Seconds a round lasts; 0 for no timer. */
	timer: number;
	/** Which kinds of round are drawn; a coin toss between them when both are. */
	modes: Modes;
}

export const QUICK_PLAY: RunSettings = {
	rounds: 5,
	movement: 'free',
	timer: 0,
	modes: { ground: true, orbit: true }
};

export const MOVEMENT_LABELS: Record<Movement, string> = {
	free: 'free',
	look: 'look only',
	frozen: 'no pan or zoom'
};

/** A movement named where no heading says what the word is about. */
export function movementName(movement: Movement): string {
	return movement === 'free' ? 'free movement' : MOVEMENT_LABELS[movement];
}

/** Only a full turn of the horizon plays: a partial sweep leaves the reader
 *  guessing what lies outside it. Full mosaics land a pixel short of 360°,
 *  with nothing between 358° and 359.6°. */
const MIN_HFOV_DEG = 359.5;

/** Played whatever their sweep, which the export does not measure: they are
 *  the only views there are of the Moon, Venus and Titan. */
const ANY_SWEEP = new Set([
	'apollo11',
	'apollo12',
	'apollo14',
	'apollo15',
	'apollo16',
	'apollo17',
	'venera13',
	'huygens'
]);

/** Whether a stop goes in the pool: the view can open it, all the way round. */
export function playable(entry: PanoramaEntry): boolean {
	if (!isViewable(entry)) return false;
	return ANY_SWEEP.has(entry.mission ?? '') || (entry.hfov_deg ?? 0) >= MIN_HFOV_DEG;
}

/** Two panoramas from the same stop are the same round twice over. */
const SAME_PLACE_DEG = 0.002;

/** Rounds this close together come from different probes where the pool
 *  allows it: one traverse several rounds running is one puzzle asked twice.
 *  Where it cannot, the gap shrinks rather than the run. */
const PROBE_GAP = 3;

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

export function distanceKm(
	a: { lat: number; lon: number },
	b: { lat: number; lon: number },
	radiusKm: number
): number {
	return groundDistanceM(a, b, radiusKm) / 1000;
}

/** A run's rules, as the labels a lobby shows them in. */
export function describeRun(settings: RunSettings): string[] {
	const { ground, orbit } = settings.modes;
	return [
		`${settings.rounds} rounds`,
		ground && orbit ? 'ground and orbit' : ground ? 'ground only' : 'orbit only',
		movementName(settings.movement),
		settings.timer ? `${settings.timer} s per round` : 'no timer'
	];
}

const AU_KM = 149_597_870.7;

export function formatDistance(km: number): string {
	if (km < 1) return `${Math.round(km * 1000)} m`;
	if (km < 100) return `${km.toFixed(1)} km`;
	// Between planets a count of kilometres is a row of digits.
	if (km > 0.05 * AU_KM) return `${(km / AU_KM).toFixed(2)} AU`;
	return `${Math.round(km).toLocaleString('en')} km`;
}

export function formatClock(seconds: number): string {
	const s = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A round's moment, to the minute: the sky is exact about it, so the reader
 *  who wants to work the positions out may. */
/** A panorama's date as the export writes it: a day, or a moment that is UTC
 *  whether or not it says so. Read as text, so no browser's timezone gets in. */
export function formatTaken(time: string): string {
	const [, day, clock] = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d))?/.exec(time) ?? [];
	if (!day) return time;
	return clock ? `${day} ${clock} UTC` : day;
}

export function formatWhen(time: number): string {
	return `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * The moons in shadow, which a run leaves out: from orbit one is a dark disc
 * with nothing on it to know it by.
 */

import { sunlight } from 'spacemap';
import { BODIES } from './bodies';

const NONE: ReadonlySet<string> = new Set();

/** What each date read answered. A run starts from an opener, on its date, so
 *  the answer is there for it without the export being asked again. */
const READ = new Map<number, ReadonlySet<string>>();

/** The moons known to be in shadow at `time`: none until it has been read. */
export function shadedOn(time: number): ReadonlySet<string> {
	return READ.get(time) ?? NONE;
}

/**
 * The moons with less than their full sunlight at `time`. A planet is not
 * asked about: the shadow of a moon is a dot on it. The export answers one
 * read at a time, so the moons are asked in turn and the first failure ends
 * it: one that is down is not left a queue to time out on.
 */
export async function eclipsed(time: number): Promise<ReadonlySet<string>> {
	const known = READ.get(time);
	if (known) return known;
	const date = new Date(time);
	const dark = new Set<string>();
	try {
		for (const { id, system } of BODIES) {
			if (system !== id && ((await sunlight(id, date)) ?? 1) < 1) dark.add(id);
		}
		READ.set(time, dark);
	} catch {
		// Not kept: the next draw on this date asks again.
	}
	return dark;
}

/**
 * The sky a guess on the wrong body is scored against: where the bodies were
 * when the round happened. It is read from the export, not from the map, so
 * it answers for a panorama taken decades from where the map's clock is.
 */

import { distanceKm } from 'spacemap';
import { membersOf, systemOf } from './bodies';
import { measuredAt, type Place, type Round } from './rounds';
import { NO_SKY, type Sky } from './scoring';

/** The right body needs no sky. A sky that cannot be read is no sky: the
 *  guess is still scored, for what it got right. */
export async function measure(round: Round, truth: Place, guessed: string | null): Promise<Sky> {
	if (!guessed || guessed === truth.body) return NO_SKY;
	const date = new Date(measuredAt(round));
	const between = (a: string, b: string) => distanceKm({ body: a }, { body: b }, date);
	try {
		const system = systemOf(truth.body);
		const sameSystem = systemOf(guessed) === system;
		const reaches = await Promise.all(
			membersOf(system)
				.filter((member) => member.id !== system)
				.map((member) => between(system, member.id))
		);
		return {
			systemsKm: sameSystem ? 0 : await between(system, systemOf(guessed)),
			bodiesKm: sameSystem ? await between(truth.body, guessed) : null,
			systemExtentKm: reaches.some((km) => km === null)
				? null
				: 2 * Math.max(0, ...(reaches as number[]))
		};
	} catch {
		return NO_SKY;
	}
}

/**
 * Links out of the app. The SDK hands out panorama entries but not the site's
 * own URLs, so the routes back to spacemap.co are spelled out here.
 */

import { panoramaAt, type PanoramaEntry } from 'spacemap';
import { bodyOf, viewDistance } from './bodies';
import type { OrbitRound, Place, Round } from './rounds';
import { AU_KM } from './rules';

const SITE = 'https://spacemap.co';

export const REPO = 'https://github.com/julie-dujardin/spaceguesser';

/** The site counts a camera's distance in these to the AU. */
const ZOOM_PER_AU = 10;

/** The site's URL segment for an export id's prefix. */
const TYPE_BY_PREFIX: Record<string, string> = {
	spkid: 's',
	norad_satcat: 'e',
	probe: 'p',
	extra: 'u',
	naif: 'b'
};

/** An export id as the site's routes spell it: `<type>/<id>`. */
function bodyPath(bodyId: string): string {
	const [prefix, ...rest] = bodyId.split('-');
	return `${TYPE_BY_PREFIX[prefix] ?? 'b'}/${rest.join('-')}`;
}

/** Standing in this panorama on spacemap.co. */
export function panoramaUrl(bodyId: string, entry: PanoramaEntry): string {
	return `${SITE}/view/${bodyPath(bodyId)}?at=${encodeURIComponent(panoramaAt(entry))}`;
}

/** The site's map as an orbit round had it: that date, over that place, from
 *  that high. */
export function orbitUrl(round: OrbitRound, over: Place): string {
	const at = [new Date(round.time).toISOString()];
	const body = bodyOf(round.body);
	if (body) {
		const zoom = ((viewDistance(body) * body.radiusKm) / AU_KM) * ZOOM_PER_AU;
		// A plus sign in a query is a space.
		at.push(over.lat.toFixed(5), over.lon.toFixed(5), zoom.toPrecision(5).replace('e+', 'e'));
	}
	return `${SITE}/${bodyPath(round.body)}?at=${at.join(',')}`;
}

/** Where a round was, on spacemap.co. */
export function roundUrl(round: Round, truth: Place): string {
	return round.mode === 'ground' ? panoramaUrl(round.body, round.entry) : orbitUrl(round, truth);
}

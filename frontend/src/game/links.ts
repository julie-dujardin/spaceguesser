/**
 * Links out of the app. The SDK hands out panorama entries but not the site's
 * own URLs, so the route back to spacemap.co is spelled out here.
 */

import { panoramaAt, type PanoramaEntry } from 'spacemap';
import type { Round } from './rounds';

const SITE = 'https://spacemap.co';

export const REPO = 'https://github.com/julie-dujardin/spaceguesser';

/** The site's URL segment for an export id, as `/view/<type>/<id>` wants it. */
const TYPE_BY_PREFIX: Record<string, string> = {
	spkid: 's',
	norad_satcat: 'e',
	probe: 'p',
	extra: 'u',
	naif: 'b'
};

/** The body's own page on spacemap.co. */
export function bodyUrl(bodyId: string): string {
	const [prefix, ...rest] = bodyId.split('-');
	return `${SITE}/view/${TYPE_BY_PREFIX[prefix] ?? 'b'}/${rest.join('-')}`;
}

/** Standing in this panorama on spacemap.co. */
export function panoramaUrl(bodyId: string, entry: PanoramaEntry): string {
	return `${bodyUrl(bodyId)}?at=${encodeURIComponent(panoramaAt(entry))}`;
}

/** Where a round was, on spacemap.co. */
export function roundUrl(round: Round): string {
	return round.mode === 'ground' ? panoramaUrl(round.body, round.entry) : bodyUrl(round.body);
}

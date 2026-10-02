/**
 * Links out of the app. The SDK hands out panorama entries but not the site's
 * own URLs, so the route back to spacemap.co is spelled out here.
 */

import { panoramaAt, type PanoramaEntry } from 'spacemap';

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

/** Standing in this panorama on spacemap.co. */
export function panoramaUrl(bodyId: string, entry: PanoramaEntry): string {
	const [prefix, ...rest] = bodyId.split('-');
	const type = TYPE_BY_PREFIX[prefix] ?? 'b';
	const at = encodeURIComponent(panoramaAt(entry));
	return `${SITE}/view/${type}/${rest.join('-')}?at=${at}`;
}

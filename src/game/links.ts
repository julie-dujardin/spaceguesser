/**
 * Deep links back to spacemap.co. The SDK hands out panorama entries but not
 * the site's own URLs, so the route is spelled out here.
 */

import { panoramaAt, type PanoramaEntry } from 'spacemap';

const SITE = 'https://spacemap.co';

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

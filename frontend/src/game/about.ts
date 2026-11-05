/** The pages beside the game: what it is, what it does with data, and the terms it comes with. */

export const ABOUT = ['about', 'privacy', 'terms'] as const;

export type AboutPage = (typeof ABOUT)[number];

export function aboutPath(page: AboutPage): string {
	return page === 'about' ? '/about' : `/about/${page}`;
}

/** The page `path` names, if it is one of them. */
export function aboutPage(path: string): AboutPage | null {
	const bare = path.replace(/(.)\/$/, '$1');
	return ABOUT.find((page) => aboutPath(page) === bare) ?? null;
}

/** When the privacy and terms wording last changed. */
export const UPDATED = '2026-10-08';

/** Where a question about either page goes. */
export const CONTACT = 'julie@dujardin.pw';

/** A publisher who is not a company may name their hosts in place of
 *  themselves, and owes the reader that much. */
export const HOSTS = [
	'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA',
	'OVH SAS, 2 rue Kellermann, 59100 Roubaix, France'
];

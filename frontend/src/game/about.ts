/** The pages beside the game: what it does with data, and the terms it comes with. */

export const ABOUT = ['privacy', 'terms'] as const;

export type AboutPage = (typeof ABOUT)[number];

export function aboutPath(page: AboutPage): string {
	return `/about/${page}`;
}

/** The page `path` names, if it is one of them. */
export function aboutPage(path: string): AboutPage | null {
	const named = /^\/about\/([a-z]+)\/?$/.exec(path)?.[1];
	return ABOUT.find((page) => page === named) ?? null;
}

/** When the wording last changed. */
export const UPDATED = '2026-10-08';

/** Where a question about either page goes. */
export const CONTACT = 'julie@dujardin.pw';

/** A publisher who is not a company may name their hosts in place of
 *  themselves, and owes the reader that much. */
export const HOSTS = [
	'Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA',
	'OVH SAS, 2 rue Kellermann, 59100 Roubaix, France'
];

/** What the page accepts of the imagery's licences. */

import { configureHost } from 'spacemap';

/** The game is not commercial and takes the imagery licensed for that: the
 *  Uranus map and the Huygens view of Titan. Every view the SDK makes sets
 *  the page's terms afresh, so each one is handed this. */
export const TERMS = { includeNonCommercial: true } as const;

/** The same terms for what is read before any view exists. */
export function acceptTerms(): void {
	configureHost({ textures: 'non-commercial' });
}

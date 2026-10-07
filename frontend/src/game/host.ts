/** What the page tells the SDK of itself: the licences it accepts, and the
 *  language it reads in. */

import { configureHost, type CoreMessages } from 'spacemap';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

/** The SDK's own wording is in the app's bundle, under the SDK's keys. */
const messages = m satisfies CoreMessages;

/** The game is not commercial and takes the imagery licensed for that: the
 *  Uranus map and the Huygens view of Titan. Every view the SDK makes sets
 *  the page's host afresh, so each one is handed this. */
export const HOST = { includeNonCommercial: true, locale: getLocale(), messages } as const;

/** The same for what is read before any view exists. */
export function setHost(): void {
	configureHost({ textures: 'non-commercial', locale: getLocale, messages });
}

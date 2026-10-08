/** The addresses the app answers at. Apart from the game, so the Worker can
 *  read them without it. */

import { aboutPage } from './about';

/** An invite to a lobby, and its code. */
export const INVITE_PATH = /^\/j\/([a-z0-9]{6})\/?$/i;

/** A shared run, still packed. */
export const SHARED_PATH = /^\/r\/([\w-]+)\/?$/;

/** Whether the app has something of its own to show at `path`. */
export function isRoute(path: string): boolean {
	return path === '/' || INVITE_PATH.test(path) || SHARED_PATH.test(path) || !!aboutPage(path);
}

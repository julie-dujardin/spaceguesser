/** What this deployment is set to. The page runs it as a script ahead of the
 *  app (`worker/env.ts`), so a setting changes without a build. */

interface Env {
	/** `wss://…/ws`. */
	PUBLIC_MULTIPLAYER_URL?: string;
	/** The Turnstile widget's. */
	PUBLIC_TURNSTILE_SITEKEY?: string;
}

declare global {
	var __env: Env | undefined;
}

/** Empty where the script did not come: the app offers what needs no setting. */
export const ENV: Env = globalThis.__env ?? {};

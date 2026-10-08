/** The Worker in front of the built site. The files are served without it: it
 *  is there for the settings, so that changing one takes no build. */

import { ENV_PATH, envScript } from './env';

interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
	[name: string]: unknown;
}

export default {
	fetch(request: Request, env: Env): Response | Promise<Response> {
		// A page of the app, asked for by what is not a browser opening one: a
		// crawler, a link preview.
		if (new URL(request.url).pathname !== ENV_PATH) return env.ASSETS.fetch(request);
		return new Response(envScript(env), {
			headers: {
				'Content-Type': 'text/javascript; charset=utf-8',
				// The next page load reads a changed setting.
				'Cache-Control': 'no-cache'
			}
		});
	}
};

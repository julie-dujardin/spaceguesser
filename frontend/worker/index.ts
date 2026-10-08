/** The Worker in front of the built site. The files are served without it: it
 *  is there for the settings, so that changing one takes no build, and to say
 *  which addresses are no page of the app. */

import { isRoute } from '../src/game/routes';
import { ENV_PATH, envScript } from './env';

interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
	[name: string]: unknown;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === ENV_PATH) {
			return new Response(envScript(env), {
				headers: {
					'Content-Type': 'text/javascript; charset=utf-8',
					// The next page load reads a changed setting.
					'Cache-Control': 'no-cache'
				}
			});
		}
		// What has no file, asked for by what is not a browser opening a page: a
		// crawler, a link preview. The files answer it with the app.
		const app = await env.ASSETS.fetch(request);
		if (isRoute(pathname)) return app;
		// Still the app, for a person who lands here, but not as a page that
		// exists: a crawler would keep every address it made up.
		return new Response(app.body, { status: 404, headers: app.headers });
	}
};

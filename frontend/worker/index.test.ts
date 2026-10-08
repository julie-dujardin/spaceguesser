import { describe, expect, it } from 'vitest';
import worker from './index';

const ASSETS = { fetch: async () => new Response('the app') };

/** What a page that ran `script` would find. */
function ran(script: string): unknown {
	const page: { __env?: unknown } = {};
	new Function('globalThis', script)(page);
	return page.__env;
}

describe('the Worker', () => {
	it('tells the page the public settings and no others', async () => {
		const env = { ASSETS, PUBLIC_MULTIPLAYER_URL: 'wss://play.test/ws', TURNSTILE_SECRET: 'kept' };
		const response = await worker.fetch(new Request('https://game.test/env.js'), env);
		expect(response.headers.get('Content-Type')).toMatch(/^text\/javascript/);
		expect(ran(await response.text())).toEqual({ PUBLIC_MULTIPLAYER_URL: 'wss://play.test/ws' });
	});

	it('leaves every other path to the files', async () => {
		const response = await worker.fetch(new Request('https://game.test/about/privacy'), { ASSETS });
		expect(await response.text()).toBe('the app');
	});
});

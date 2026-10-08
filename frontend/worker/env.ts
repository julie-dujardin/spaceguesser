/** The deployment's settings as the page reads them: a script, since the page
 *  is a static file and can be told nothing else before the app starts. */

/** Where the page asks for it. */
export const ENV_PATH = '/env.js';

/** Only what is named for the page goes out: a secret set beside it stays in. */
export function envScript(vars: Record<string, unknown>): string {
	const open = Object.entries(vars).filter(
		([name, value]) => name.startsWith('PUBLIC_') && typeof value === 'string'
	);
	return `globalThis.__env = ${JSON.stringify(Object.fromEntries(open))};\n`;
}

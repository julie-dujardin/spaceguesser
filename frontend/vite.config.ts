import { paraglideVitePlugin } from '@inlang/paraglide-js';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { CONTACT } from './src/game/about';
import { ENV_PATH, envScript } from './worker/env';

/** Stands in for the Worker, which Vite does not run: the settings are read
 *  from `.env` and the shell. */
function settings(): Plugin {
	const serve = ({ middlewares, config }: ViteDevServer | PreviewServer) => {
		middlewares.use(ENV_PATH, (_request, response) => {
			response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
			response.end(envScript(loadEnv(config.mode, config.envDir, 'PUBLIC_')));
		});
	};
	return { name: 'settings', configureServer: serve, configurePreviewServer: serve };
}

/** Where to write about a hole in the site (RFC 9116). Made by the build: the
 *  file has to say when it goes stale, and a date kept by hand would pass
 *  unnoticed. */
function securityTxt(): Plugin {
	return {
		name: 'security-txt',
		generateBundle() {
			const expires = new Date();
			expires.setUTCMonth(expires.getUTCMonth() + 11);
			this.emitFile({
				type: 'asset',
				fileName: '.well-known/security.txt',
				source: `Contact: mailto:${CONTACT}\nExpires: ${expires.toISOString()}\nPreferred-Languages: en, fr\n`
			});
		}
	};
}

export default defineConfig({
	plugins: [
		react(),
		// The same options as the `messages` script, which compiles for `tsc`.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide',
			strategy: ['preferredLanguage', 'baseLocale'],
			emitTsDeclarations: true
		}),
		settings(),
		securityTxt()
	],
	// A fixed port, so the editor's launch config has a URL to aim at, and
	// clear of the map's own dev server next door.
	server: { host: '127.0.0.1', port: 5170, strictPort: true }
});

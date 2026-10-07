import { paraglideVitePlugin } from '@inlang/paraglide-js';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		react(),
		// The same options as the `messages` script, which compiles for `tsc`.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide',
			strategy: ['preferredLanguage', 'baseLocale'],
			emitTsDeclarations: true
		})
	],
	// A fixed port, so the editor's launch config has a URL to aim at, and
	// clear of the map's own dev server next door.
	server: { host: '127.0.0.1', port: 5170, strictPort: true }
});

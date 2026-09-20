import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	// A fixed port, so the editor's launch config has a URL to aim at, and
	// clear of the map's own dev server next door.
	server: { host: '127.0.0.1', port: 5170, strictPort: true }
});

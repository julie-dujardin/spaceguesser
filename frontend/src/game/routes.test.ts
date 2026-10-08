import { describe, expect, it } from 'vitest';
import { aboutPath } from './about';
import { invitePath } from './lobby';
import { isRoute } from './routes';

describe('the addresses of the app', () => {
	it('are the home page and what the app links to itself', () => {
		for (const path of ['/', invitePath('QBJMQ2'), '/r/AAECAwQ-_w', aboutPath('privacy')]) {
			expect(isRoute(path), path).toBe(true);
		}
	});

	it('are nothing else', () => {
		for (const path of [
			'/favicon.ico',
			'/.env',
			'/j/short',
			'/r/',
			'/about/nothing',
			'/j/QBJMQ2/x'
		]) {
			expect(isRoute(path), path).toBe(false);
		}
	});
});

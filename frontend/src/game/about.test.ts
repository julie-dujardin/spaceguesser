import { describe, expect, it } from 'vitest';
import { ABOUT, aboutPage, aboutPath } from './about';

describe('aboutPage', () => {
	it('reads back every path it writes', () => {
		for (const page of ABOUT) expect(aboutPage(aboutPath(page))).toBe(page);
		expect(aboutPage('/about/privacy/')).toBe('privacy');
	});

	it('leaves the game its own paths', () => {
		for (const path of ['/', '/about', '/about/cookies', '/j/ABCDEF', '/r/AQ'])
			expect(aboutPage(path)).toBeNull();
	});
});

import { describe, expect, it } from 'vitest';
import type { PanoramaEntry } from 'spacemap';
import { bodyOf, viewDistance } from './bodies';
import { roundUrl } from './links';

const AU_KM = 149_597_870.7;

describe('roundUrl', () => {
	const TIME = Date.UTC(2026, 8, 14, 2, 20);

	it("opens a flown round in the site's map, over its place at its date", () => {
		const url = new URL(
			roundUrl(
				{ mode: 'orbit', body: 'naif-504', time: TIME, u: 0, v: 0 },
				{ body: 'naif-504', lat: -29.4, lon: -143.25 }
			)
		);
		expect(url.origin + url.pathname).toBe('https://spacemap.co/b/504');
		const [date, lat, lon, zoom] = url.searchParams.get('at')!.split(',');
		expect(Date.parse(date)).toBe(TIME);
		expect([Number(lat), Number(lon)]).toEqual([-29.4, -143.25]);
		// The site's camera distance, ten to the AU, is the game's standoff.
		const callisto = bodyOf('naif-504')!;
		const standoffKm = viewDistance(callisto) * callisto.radiusKm;
		expect((Number(zoom) / 10) * AU_KM).toBeCloseTo(standoffKm, -1);
	});

	it('spells a small body the way the site files it', () => {
		const url = roundUrl(
			{ mode: 'orbit', body: 'spkid-20000433', time: TIME, u: 0, v: 0 },
			{ body: 'spkid-20000433', lat: 0, lon: 0 }
		);
		expect(url).toContain('https://spacemap.co/s/20000433?at=');
	});

	it('stands a ground round in its panorama', () => {
		const entry = { id: 'x' } as PanoramaEntry;
		const url = roundUrl(
			{ mode: 'ground', body: 'naif-499', time: TIME, entry },
			{ body: 'naif-499', lat: 0, lon: 0 }
		);
		expect(url).toContain('https://spacemap.co/view/b/499?at=');
	});
});

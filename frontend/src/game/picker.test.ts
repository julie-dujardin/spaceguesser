import { afterEach, describe, expect, it } from 'vitest';
import { baseLocale, overwriteGetLocale } from '../paraglide/runtime.js';
import { BODIES } from './bodies';
import { PICKERS, ROOT, intoSystem, levelTitle, search, trailTo } from './picker';

afterEach(() => overwriteGetLocale(() => baseLocale));

describe('trailTo', () => {
	it('goes through the system of a body that shares one', () => {
		expect(trailTo('naif-602', 'hard')).toEqual([
			{ kind: 'root' },
			{ kind: 'system', id: 'naif-699' },
			{ kind: 'body', id: 'naif-602' }
		]);
	});

	it('goes straight from the Solar System to a planet alone in its system', () => {
		expect(trailTo('naif-199', 'hard')).toEqual([
			{ kind: 'root' },
			{ kind: 'body', id: 'naif-199' }
		]);
	});

	it('goes through the zone of a small body, and through its system for Pluto', () => {
		expect(trailTo('spkid-20000004', 'hard')[1]).toEqual({ kind: 'zone', zone: 'inner' });
		expect(trailTo('spkid-20486958', 'hard')[1]).toEqual({ kind: 'zone', zone: 'outer' });
		expect(trailTo('naif-999', 'hard')[1]).toEqual({ kind: 'system', id: 'naif-999' });
	});
});

describe('intoSystem', () => {
	it('opens the map of a system with more than one body in play', () => {
		expect(intoSystem(ROOT, 'naif-699', 'hard').at(-1)).toEqual({ kind: 'system', id: 'naif-699' });
	});

	it('lands on the Moon for Earth, where it is all there is', () => {
		expect(intoSystem(ROOT, 'naif-399', 'hard').at(-1)).toEqual({ kind: 'body', id: 'naif-301' });
	});
});

describe('levelTitle', () => {
	it('names a system after its primary, in play or not', () => {
		expect(levelTitle({ kind: 'system', id: 'naif-699' })).toBe('Saturn system');
		expect(levelTitle({ kind: 'system', id: 'naif-399' })).toBe('Earth system');
	});

	it("names it as the reader's language does", () => {
		overwriteGetLocale(() => 'fr');
		expect(levelTitle({ kind: 'system', id: 'naif-699' })).toBe('Système de Saturne');
		expect(levelTitle({ kind: 'system', id: 'naif-799' })).toBe("Système d'Uranus");
		expect(levelTitle({ kind: 'system', id: 'naif-399' })).toBe('Système Terre-Lune');
		expect(levelTitle({ kind: 'body', id: 'naif-301' })).toBe('Lune');
	});
});

describe('search', () => {
	it('finds a body by the start of its name first', () => {
		expect(search('en', 'hard')[0].name).toBe('Enceladus');
		expect(search('TIT', 'hard').map((body) => body.name)).toContain('Titan');
	});

	it('finds a comet by its name as well as its number', () => {
		expect(search('halley', 'hard')[0].id).toBe('spkid-1000036');
		expect(search('67p', 'hard')[0].id).toBe('spkid-1000012');
	});

	it('finds nothing for nothing, and nothing out of play', () => {
		expect(search('  ', 'hard')).toEqual([]);
		expect(search('earth', 'hard')).toEqual([]);
	});

	it('finds only what a balanced run offers in one', () => {
		expect(search('apophis', 'hard')[0].id).toBe('spkid-20099942');
		expect(search('apophis', 'balanced')).toEqual([]);
		expect(search('telesto', 'balanced')).toEqual([]);
		expect(search('bennu', 'balanced')[0].id).toBe('spkid-20101955');
	});

	it("finds a body by its name in the reader's language, or in English", () => {
		overwriteGetLocale(() => 'fr');
		expect(search('encel', 'hard')[0].id).toBe('naif-602');
		expect(search('lune', 'hard')[0].id).toBe('naif-301');
		expect(search('moon', 'hard')[0].id).toBe('naif-301');
	});
});

describe('PICKERS', () => {
	it('draws on the system map what a run offers', () => {
		const hardOnly = BODIES.filter((body) => body.balanced === false).map((body) => body.id);
		expect(hardOnly.length).toBeGreaterThan(0);
		expect(PICKERS.balanced.bodies.filter((id) => hardOnly.includes(id))).toEqual([]);
		expect(PICKERS.balanced.places.filter((place) => hardOnly.includes(place.id))).toEqual([]);
		expect(PICKERS.hard.bodies).toHaveLength(BODIES.length);
	});
});

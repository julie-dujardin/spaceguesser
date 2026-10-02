import { describe, expect, it } from 'vitest';
import { ROOT, intoSystem, levelTitle, search, trailTo } from './picker';

describe('trailTo', () => {
	it('goes through the system of a body that shares one', () => {
		expect(trailTo('naif-602')).toEqual([
			{ kind: 'root' },
			{ kind: 'system', id: 'naif-699' },
			{ kind: 'body', id: 'naif-602' }
		]);
	});

	it('goes straight from the Solar System to a planet alone in its system', () => {
		expect(trailTo('naif-199')).toEqual([{ kind: 'root' }, { kind: 'body', id: 'naif-199' }]);
	});

	it('goes through the zone of a small body, and through its system for Pluto', () => {
		expect(trailTo('spkid-20000004')[1]).toEqual({ kind: 'zone', zone: 'inner' });
		expect(trailTo('spkid-20486958')[1]).toEqual({ kind: 'zone', zone: 'outer' });
		expect(trailTo('naif-999')[1]).toEqual({ kind: 'system', id: 'naif-999' });
	});
});

describe('intoSystem', () => {
	it('opens the map of a system with more than one body in play', () => {
		expect(intoSystem(ROOT, 'naif-699').at(-1)).toEqual({ kind: 'system', id: 'naif-699' });
	});

	it('lands on the Moon for Earth, where it is all there is', () => {
		expect(intoSystem(ROOT, 'naif-399').at(-1)).toEqual({ kind: 'body', id: 'naif-301' });
	});
});

describe('levelTitle', () => {
	it('names a system after its primary, in play or not', () => {
		expect(levelTitle({ kind: 'system', id: 'naif-699' })).toBe('Saturn system');
		expect(levelTitle({ kind: 'system', id: 'naif-399' })).toBe('Earth system');
	});
});

describe('search', () => {
	it('finds a body by the start of its name first', () => {
		expect(search('en')[0].name).toBe('Enceladus');
		expect(search('TIT').map((body) => body.name)).toContain('Titan');
	});

	it('finds a comet by its name as well as its number', () => {
		expect(search('halley')[0].id).toBe('spkid-1000036');
		expect(search('67p')[0].id).toBe('spkid-1000012');
	});

	it('finds nothing for nothing, and nothing out of play', () => {
		expect(search('  ')).toEqual([]);
		expect(search('earth')).toEqual([]);
	});
});

/**
 * The way down to a guess: the Solar System, then a planet's system or one of
 * the two zones of small bodies, then a body. A level is where the reader is
 * looking; the trail of them is what the back arrow walks.
 */

import {
	BODIES,
	bodyName,
	bodyOf,
	membersOf,
	systemName,
	type BodyInfo,
	type Zone
} from './bodies';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';

export type Level =
	| { kind: 'root' }
	| { kind: 'system'; id: string }
	| { kind: 'zone'; zone: Zone }
	| { kind: 'body'; id: string };

export const ROOT: Level[] = [{ kind: 'root' }];

/** As the system map names its two doors, which are the same places. */
const ZONE_NAMES: Record<Zone, () => string> = {
	inner: m.system_map_zone_inner,
	outer: m.system_map_zone_outer
};

export function levelTitle(level: Level): string {
	switch (level.kind) {
		case 'root':
			return m.system_map_solar_system();
		case 'system':
			return m.system_title({ name: systemName(level.id) });
		case 'zone':
			return ZONE_NAMES[level.zone]();
		case 'body':
			return bodyName(level.id);
	}
}

/** The level a body is reached from: its system when that has more than the
 *  one body in play, else its zone, else the Solar System itself. */
function above(body: BodyInfo): Level | null {
	if (membersOf(body.system).length > 1) return { kind: 'system', id: body.system };
	if (body.zone) return { kind: 'zone', zone: body.zone };
	return null;
}

/** The whole trail to a body, for a jump straight to it: back still walks up
 *  the way a reader would have come down. */
export function trailTo(id: string): Level[] {
	const body = bodyOf(id);
	if (!body) return ROOT;
	const parent = above(body);
	return [...ROOT, ...(parent ? [parent] : []), { kind: 'body', id }];
}

/** Where picking a system leads: its map, or straight to its one body in
 *  play when a map would hold nothing else. */
export function intoSystem(trail: Level[], system: string): Level[] {
	const members = membersOf(system);
	return [
		...trail,
		members.length === 1 ? { kind: 'body', id: members[0].id } : { kind: 'system', id: system }
	];
}

/** Without case or accents: what a name is typed as. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Bodies whose name holds `query`, the ones that start with it first. A name
 *  is typed in the reader's language or as the catalogue has it. */
export function search(query: string, limit = 8): BodyInfo[] {
	const wanted = fold(query.trim());
	if (!wanted) return [];
	const rank = (text: string) => {
		const name = fold(text);
		// A comet is asked for by its name as often as by its number.
		const words = name.split(/[\s/]+/);
		if (name.startsWith(wanted)) return 0;
		if (words.some((word) => word.startsWith(wanted))) return 1;
		return name.includes(wanted) ? 2 : Infinity;
	};
	return BODIES.map((body) => {
		const name = bodyName(body.id);
		return { body, name, at: Math.min(rank(name), rank(body.name)) };
	})
		.filter((hit) => hit.at < Infinity)
		.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, getLocale()))
		.slice(0, limit)
		.map((hit) => hit.body);
}

/** What the system map is told of the catalogue: which bodies to draw, what
 *  they are called, and where the small ones orbit, so it reads none of that. */
export const PICKER = {
	bodies: BODIES.map((body) => body.id),
	names: Object.fromEntries([
		...BODIES.map((body) => [body.id, bodyName(body.id)]),
		...[...new Set(BODIES.map((body) => body.system))].map((id) => [id, systemName(id)])
	]) as Record<string, string>,
	places: BODIES.filter((body) => body.zone).map(({ id, aAu, tiltDeg, radiusKm }) => ({
		id,
		name: bodyName(id),
		aAu,
		tiltDeg,
		radiusKm
	}))
};

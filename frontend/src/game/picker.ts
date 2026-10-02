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

export type Level =
	| { kind: 'root' }
	| { kind: 'system'; id: string }
	| { kind: 'zone'; zone: Zone }
	| { kind: 'body'; id: string };

export const ROOT: Level[] = [{ kind: 'root' }];

export const ZONE_NAMES: Record<Zone, string> = {
	inner: 'Inner asteroids & comets',
	outer: 'Outer asteroids & comets'
};

export function levelTitle(level: Level): string {
	switch (level.kind) {
		case 'root':
			return 'Solar System';
		case 'system':
			return `${systemName(level.id)} system`;
		case 'zone':
			return ZONE_NAMES[level.zone];
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

/** Bodies whose name holds `query`, the ones that start with it first. */
export function search(query: string, limit = 8): BodyInfo[] {
	const wanted = fold(query.trim());
	if (!wanted) return [];
	const rank = (body: BodyInfo) => {
		const name = fold(body.name);
		// A comet is asked for by its name as often as by its number.
		const words = name.split(/[\s/]+/);
		if (name.startsWith(wanted)) return 0;
		if (words.some((word) => word.startsWith(wanted))) return 1;
		return name.includes(wanted) ? 2 : -1;
	};
	return BODIES.map((body) => ({ body, at: rank(body) }))
		.filter((hit) => hit.at >= 0)
		.sort((a, b) => a.at - b.at || a.body.name.localeCompare(b.body.name))
		.slice(0, limit)
		.map((hit) => hit.body);
}

/** What the system map is told of the catalogue: which bodies to draw, what
 *  they are called, and where the small ones orbit, so it reads none of that. */
export const PICKER = {
	bodies: BODIES.map((body) => body.id),
	names: Object.fromEntries([
		...BODIES.map((body) => [body.id, body.name]),
		...[...new Set(BODIES.map((body) => body.system))].map((id) => [id, systemName(id)])
	]) as Record<string, string>,
	places: BODIES.filter((body) => body.zone).map(({ id, name, aAu, tiltDeg, radiusKm }) => ({
		id,
		name,
		aAu,
		tiltDeg,
		radiusKm
	}))
};

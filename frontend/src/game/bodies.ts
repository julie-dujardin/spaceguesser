/** The bodies in play: everything the export shows well enough to guess at. */

import catalogue from './bodies.json';

export type BodyKind = 'planet' | 'moon' | 'dwarf' | 'asteroid' | 'comet';

/** Where the small bodies are filed: either side of Jupiter's orbit. */
export type Zone = 'inner' | 'outer';

export interface BodyInfo {
	/** Export id, as the SDK takes it. */
	id: string;
	name: string;
	kind: BodyKind;
	/** Id of the primary of the system it belongs to; its own when it has none. */
	system: string;
	/** Only on what orbits the Sun by itself and is not a planet. */
	zone?: Zone;
	radiusKm?: number;
	/** Pixels round the equator of its best map. */
	widthPx?: number;
	/** Has a map a place can be picked on. Without one the body is the whole
	 *  answer: a gas giant, or a shape with no picture wrapped round it. */
	surface: boolean;
	model?: boolean;
}

export const BODIES = catalogue as BodyInfo[];

const BY_ID = new Map(BODIES.map((body) => [body.id, body]));

export const MARS = 'naif-499';

export function bodyOf(id: string): BodyInfo | undefined {
	return BY_ID.get(id);
}

export function bodyName(id: string): string {
	return BY_ID.get(id)?.name ?? id;
}

/** The system a body is scored in. A body the catalogue does not know stands
 *  alone, as an asteroid does. */
export function systemOf(id: string): string {
	return BY_ID.get(id)?.system ?? id;
}

/** Everything in play in one system, its primary included when it is. */
export function membersOf(system: string): BodyInfo[] {
	return BODIES.filter((body) => body.system === system);
}

/** The systems in play, by their primary's id. */
export const SYSTEMS = [...new Set(BODIES.map((body) => body.system))];

/** What the primary is called, which is not always in play itself: nobody
 *  stands over Earth, but the Moon is in its system. */
const PRIMARY_NAMES: Record<string, string> = { 'naif-399': 'Earth' };

export function systemName(system: string): string {
	return PRIMARY_NAMES[system] ?? bodyName(system);
}

/** A screen this tall shows one texel a pixel from the altitude below, so a
 *  round looks the same on every player's window. */
const REFERENCE_HEIGHT_PX = 900;
/** Vertical field of view of the SDK's camera. */
const FOV_DEG = 60;
/** Altitudes in radii: near enough to lose the limb, far enough to see it whole. */
const MIN_ALTITUDE = 0.25;
const MAX_ALTITUDE = 3;
/** A body with no map has no detail to come close for. */
const WHOLE_BODY = 4;
/** Far enough back that a ring system fits. */
const WHOLE_GIANT = 5;

/**
 * How far from a body's centre the camera stands, in radii. It follows the
 * map's resolution: as close as the picture stays sharp, which on a coarse map
 * is the whole disc and on a fine one a stretch of ground.
 */
export function viewDistance(body: BodyInfo): number {
	if (!body.surface) return body.kind === 'planet' ? WHOLE_GIANT : WHOLE_BODY;
	if (!body.widthPx) return WHOLE_BODY;
	const pixelsPerRadius = REFERENCE_HEIGHT_PX / (2 * Math.tan((FOV_DEG * Math.PI) / 360));
	const altitude = ((2 * Math.PI) / body.widthPx) * pixelsPerRadius;
	return 1 + Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, altitude));
}

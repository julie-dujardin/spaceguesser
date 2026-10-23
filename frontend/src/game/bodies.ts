/** The bodies in play: everything the export shows well enough to guess at. */

import { getLocale } from '../paraglide/runtime.js';
import catalogue from './bodies.json';
import localized from './names.json';

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
	/** Only on what orbits the Sun by itself and is not a planet, with the
	 *  orbit that places it on its zone's map. */
	zone?: Zone;
	aAu?: number;
	tiltDeg?: number;
	radiusKm: number;
	/** Pixels round the equator of its best whole map. */
	widthPx?: number;
	/** The same for its tile pyramid's finest level, where that is finer. */
	tilesPx?: number;
	/** How far its highest ground stands over that radius, where the map draws
	 *  its relief. */
	peakKm?: number;
	/** Has a map a place can be picked on. Without one the body is the whole
	 *  answer: a gas giant, or a shape with no picture wrapped round it. */
	surface: boolean;
	model?: boolean;
	/** False where no spin is measured: the body has no noon to stand under. */
	spin?: false;
	/** False where the view shows too little to tell the body from others by:
	 *  only a hard run plays it. */
	balanced?: false;
}

export const BODIES = catalogue as BodyInfo[];

/** How much of the catalogue a run flies over and offers to guess. */
export type Difficulty = 'balanced' | 'hard';

export const POOLS: Record<Difficulty, readonly BodyInfo[]> = {
	balanced: BODIES.filter((body) => body.balanced !== false),
	hard: BODIES
};

const BY_ID = new Map(BODIES.map((body) => [body.id, body]));

export const MARS = 'naif-499';

export function bodyOf(id: string): BodyInfo | undefined {
	return BY_ID.get(id);
}

/** What the reader's language calls a body, where that is not the
 *  catalogue's English. */
const NAMES: Record<string, Record<string, string> | undefined> = localized;

function localName(id: string): string | undefined {
	return NAMES[getLocale()]?.[id];
}

export function bodyName(id: string): string {
	return localName(id) ?? BY_ID.get(id)?.name ?? id;
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
	return localName(system) ?? PRIMARY_NAMES[system] ?? bodyName(system);
}

/** The bodies the map draws tiles for on this device, as it said on the way
 *  to each. Players on different devices can stand at different heights over
 *  one round: each as close as their own picture stays sharp. */
const TILED = new Set<string>();

export function setTiled(id: string, tiled: boolean): void {
	if (tiled) TILED.add(id);
	else TILED.delete(id);
}

/** A screen this tall shows one texel a pixel from the altitude below, so a
 *  round looks the same on every player's window. */
const REFERENCE_HEIGHT_PX = 900;
/** Vertical field of view of the SDK's camera. */
const FOV_DEG = 60;
/** The furthest altitude, in radii: far enough to see it whole. */
const MAX_ALTITUDE = 3;
/** The camera hangs over the body's radius, not over its ground. This many
 *  times the height of the highest ground leaves a summit well below it. */
const CLEARANCE = 3;
/** A body with no map has no detail to come close for. */
const WHOLE_BODY = 4;
/** Far enough back that a ring system fits. */
const WHOLE_GIANT = 5;

/**
 * How far from a body's centre the camera stands, in radii. It follows the
 * map's resolution: as close as the picture stays sharp, which on a coarse map
 * is the whole disc and where the map draws tiles a valley. Only the relief
 * stops it short of that.
 */
export function viewDistance(body: BodyInfo): number {
	if (!body.surface) return body.kind === 'planet' ? WHOLE_GIANT : WHOLE_BODY;
	// A small body's shape is nothing like the sphere its radius describes, and
	// an altitude over that sphere can be inside the rock.
	if (!body.widthPx || (body.model && body.zone && body.kind !== 'dwarf')) return WHOLE_BODY;
	const pixelsPerRadius = REFERENCE_HEIGHT_PX / (2 * Math.tan((FOV_DEG * Math.PI) / 360));
	const widthPx = TILED.has(body.id) ? Math.max(body.widthPx, body.tilesPx ?? 0) : body.widthPx;
	const sharp = ((2 * Math.PI) / widthPx) * pixelsPerRadius;
	const clear = (CLEARANCE * (body.peakKm ?? 0)) / body.radiusKm;
	return 1 + Math.min(MAX_ALTITUDE, Math.max(sharp, clear));
}

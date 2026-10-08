/**
 * A finished run as a link carries it: where each round was and what was
 * guessed there, packed into the path. The points are not in it: opening the
 * link scores the guesses again.
 */

import { fetchPanoramas, type LonLat, type PanoramaEntry } from 'spacemap';
import { bodyOf } from './bodies';
import { measure } from './measure';
import type { Mode, Place, Round } from './rounds';
import { SHARED_PATH } from './routes';
import { play, type Played } from './run';
import type { Guess } from './scoring';

/** Leads the packed run. Links stay out there for good, so a change of layout
 *  takes a new number and leaves this one readable. */
const VERSION = 1;

/** The kinds of id in play. A link names a kind by its place here, so the
 *  list only grows at its end. */
const KINDS = ['naif', 'spkid'];
/** Room for one kind's numbers, which leaves four bytes room for eight kinds. */
const SPAN = 2 ** 29;

const MODES: Mode[] = ['ground', 'orbit'];
/** How much of a guess there is. */
const NONE = 0;
const BODY = 1;
const PLACE = 2;

/** A centimetre on Mars, and a longitude still fits four bytes. */
const PER_DEGREE = 1e7;

type Field = 'Uint8' | 'Uint32' | 'Int32' | 'Float32' | 'Float64';
const BYTES: Record<Field, number> = { Uint8: 1, Uint32: 4, Int32: 4, Float32: 4, Float64: 8 };

const HEAD_BYTES = 9;
/** The most a round takes: flown, with a place guessed. */
const ROUND_BYTES = 33;

/**
 * A round as a link spells it. A panorama goes by a hash of its id, which is
 * all the export needs to say the rest; a flown round goes whole, with the
 * place the sky gave it, which only the map could say again.
 */
type Packed = { body: string; guess: Guess | null } & (
	{ mode: 'ground'; panorama: number } | { mode: 'orbit'; u: number; v: number; over: LonLat }
);

function bodyCode(id: string): number | null {
	const [, kind, digits] = /^([a-z_]+)-(\d+)$/.exec(id) ?? [];
	const index = KINDS.indexOf(kind);
	const number = Number(digits);
	return index < 0 || number >= SPAN ? null : index * SPAN + number;
}

function bodyId(code: number): string {
	const kind = KINDS[Math.floor(code / SPAN)];
	if (!kind) throw new Error('a body of no known kind');
	return `${kind}-${code % SPAN}`;
}

/** 53 bits of a panorama's id (cyrb53): a product id runs to 140 characters,
 *  and a body has thousands of them to tell apart. */
function hash(text: string): number {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ code, 2654435761);
		h2 = Math.imul(h2 ^ code, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A run packed as a link carries it; null for a run that does not fit in one. */
export function shareCode(played: readonly Played[]): string | null {
	if (!played.length) return null;
	const view = new DataView(new ArrayBuffer(HEAD_BYTES + ROUND_BYTES * played.length));
	let at = 0;
	const put = (field: Field, value: number) => {
		view[`set${field}`](at, value);
		at += BYTES[field];
	};
	const putPlace = (place: LonLat) => {
		put('Int32', Math.round(place.lat * PER_DEGREE));
		// East of 180° is the same place west of it, and the one that fits.
		put('Int32', Math.round(((((place.lon + 180) % 360) + 360) % 360) * PER_DEGREE) - 180e7);
	};

	put('Uint8', VERSION);
	put('Float64', played[0].round.time);
	for (const { round, truth, guess } of played) {
		const body = bodyCode(truth.body);
		const guessed = guess ? bodyCode(guess.body) : 0;
		if (body === null || guessed === null) return null;
		const said = !guess ? NONE : guess.at ? PLACE : BODY;
		put('Uint8', MODES.indexOf(round.mode) | (said << 1));
		put('Uint32', body);
		if (round.mode === 'ground') put('Float64', hash(round.entry.id));
		else {
			put('Float32', round.u);
			put('Float32', round.v);
			putPlace(truth);
		}
		if (guess) put('Uint32', guessed);
		if (guess?.at) putPlace(guess.at);
	}
	const bytes = String.fromCharCode(...new Uint8Array(view.buffer, 0, at));
	return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The path of the link to a run; null for a run that does not fit in one. */
export function sharePath(played: readonly Played[]): string | null {
	const code = shareCode(played);
	return code === null ? null : `/r/${code}`;
}

/** The run a share link carries, still packed, if `path` is one. */
export function sharedCode(path: string): string | null {
	return SHARED_PATH.exec(path)?.[1] ?? null;
}

/** Throws on anything `sharePath` did not write. */
function unpack(code: string): { time: number; rounds: Packed[] } {
	const text = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
	const view = new DataView(Uint8Array.from(text, (char) => char.charCodeAt(0)).buffer);
	let at = 0;
	const take = (field: Field) => {
		const value = view[`get${field}`](at);
		at += BYTES[field];
		return value;
	};
	const takePlace = (): LonLat => ({
		lat: take('Int32') / PER_DEGREE,
		lon: take('Int32') / PER_DEGREE
	});

	if (take('Uint8') !== VERSION) throw new Error('a link of another layout');
	const time = take('Float64');
	if (Number.isNaN(new Date(time).getTime())) throw new Error('a run with no date');
	const rounds: Packed[] = [];
	while (at < view.byteLength) {
		const flags = take('Uint8');
		const said = flags >> 1;
		if (said > PLACE) throw new Error('a guess of no known kind');
		const body = bodyId(take('Uint32'));
		const where =
			MODES[flags & 1] === 'ground'
				? { mode: 'ground' as const, panorama: take('Float64') }
				: { mode: 'orbit' as const, u: take('Float32'), v: take('Float32'), over: takePlace() };
		const guess =
			said === NONE
				? null
				: { body: bodyId(take('Uint32')), at: said === PLACE ? takePlace() : null };
		rounds.push({ body, guess, ...where });
	}
	if (!rounds.length) throw new Error('a run of no rounds');
	return { time, rounds };
}

/**
 * The run a link carries, scored as it was when it was played. Rejects for a
 * link that does not read, and for one whose panorama the export no longer has.
 */
export async function openShared(
	code: string,
	panoramas: (body: string) => Promise<PanoramaEntry[]> = fetchPanoramas
): Promise<Played[]> {
	const { time, rounds } = unpack(code);
	// Every panorama of a body, not only the ones a round is drawn from: the
	// reader may have walked to any of them. Asked for once, however many
	// rounds were on it.
	const lists = new Map<string, Promise<PanoramaEntry[]>>();
	const on = (body: string) => {
		if (!lists.has(body)) lists.set(body, panoramas(body));
		return lists.get(body)!;
	};
	return Promise.all(
		rounds.map(async (packed) => {
			const { body, guess } = packed;
			let round: Round;
			let truth: Place;
			if (packed.mode === 'ground') {
				const entry = (await on(body)).find((stop) => hash(stop.id) === packed.panorama);
				if (!entry) throw new Error(`a panorama on ${body} is gone`);
				round = { mode: 'ground', body, time, entry };
				truth = { body, lat: entry.lat, lon: entry.lon };
			} else {
				round = { mode: 'orbit', body, time, u: packed.u, v: packed.v };
				truth = { body, ...packed.over };
			}
			const sky = await measure(round, truth, guess?.body ?? null);
			// The clock is not in the link: only what was guessed is.
			return play(round, truth, guess, sky, bodyOf(body)?.radiusKm ?? null, null, false);
		})
	);
}

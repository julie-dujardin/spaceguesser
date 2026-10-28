/**
 * The daily challenge: five rounds picked by hand, the same for everyone for
 * one UTC day. The multiplayer server sends the file of the current day only.
 * Starting the challenge uses up the day, so it is played once.
 */

import { subsolarPoint, sunlight } from 'spacemap';
import { POOLS, bodyOf } from './bodies';
import { ENV } from './env';
import { aim, roundAt, type Round, type Stop, type Where } from './rounds';
import { QUICK_PLAY, type RunSettings } from './rules';

export const DAILY: RunSettings = { ...QUICK_PLAY, timer: 120 };

/** A day's file. */
export interface Daily {
	/** The UTC date, as `YYYY-MM-DD`. */
	day: string;
	/** The moment of every round, as an ISO date: the sky they are flown in. */
	time: string;
	rounds: Where[];
}

const DAY_MS = 86_400_000;

/** The UTC date of `at`, as `YYYY-MM-DD`. */
export function utcDay(at = Date.now()): string {
	return new Date(at).toISOString().slice(0, 10);
}

/** The day before `day`. */
export function dayBefore(day: string): string {
	return utcDay(Date.parse(day) - DAY_MS);
}

/** When `day` ends, in epoch milliseconds. */
export function endOf(day: string): number {
	return Date.parse(day) + DAY_MS;
}

/** The same server as multiplayer. */
const URL_OF_DAILY = ENV.PUBLIC_MULTIPLAYER_URL
	? new URL('/daily.json', ENV.PUBLIC_MULTIPLAYER_URL.replace(/^ws/, 'http')).href
	: null;

export const HAS_DAILY = !!URL_OF_DAILY;

const isNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

function isLonLat(value: unknown): boolean {
	const { lon, lat } = (value ?? {}) as Record<string, unknown>;
	return isNumber(lon) && isNumber(lat);
}

function isWhere(value: unknown): value is Where {
	const where = (value ?? {}) as Record<string, unknown>;
	if (typeof where.body !== 'string') return false;
	if (where.mode === 'ground') return typeof where.panorama === 'string';
	return where.mode === 'orbit' && isLonLat(where.over) && isLonLat(where.noon);
}

/** `value` as a day's file. Throws with the reason when it is not one. */
export function parseDaily(value: unknown): Daily {
	const { day, time, rounds } = (value ?? {}) as Record<string, unknown>;
	if (typeof day !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(day) || utcDay(Date.parse(day)) !== day)
		throw new Error('`day` is not a YYYY-MM-DD date');
	if (typeof time !== 'string' || Number.isNaN(Date.parse(time)))
		throw new Error('`time` is not an ISO date');
	if (!Array.isArray(rounds) || rounds.length !== DAILY.rounds)
		throw new Error(`\`rounds\` does not hold ${DAILY.rounds} rounds`);
	const bad = rounds.findIndex((where) => !isWhere(where));
	if (bad >= 0) throw new Error(`round ${bad + 1} is not a ground or orbit round`);
	return { day, time, rounds };
}

/** A value on one line, spaced as JSON is written by hand. */
function inline(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
	if (!value || typeof value !== 'object') return JSON.stringify(value);
	const fields = Object.entries(value).map(
		([key, field]) => `${JSON.stringify(key)}: ${inline(field)}`
	);
	return `{ ${fields.join(', ')} }`;
}

/** A day's file as it is kept, with a round on each line. For the scripts. */
export function formatDaily({ rounds, ...head }: { rounds: unknown[] }): string {
	const fields = Object.entries(head).map(
		([key, field]) => `\t${JSON.stringify(key)}: ${inline(field)},\n`
	);
	const lines = rounds.map((round) => `\t\t${inline(round)}`).join(',\n');
	return `{\n${fields.join('')}\t"rounds": [\n${lines}\n\t]\n}\n`;
}

/** A filled-in `noon` keeps 4 decimals: under 10 m on Mars. */
const NOON_DIGITS = 4;

/**
 * What is wrong with `value`, the file named `name`, against the playable
 * `stops`. A flown round with no `noon` gets it in `value`, from the time of
 * the file. For `scripts/upload-dailies.mjs`.
 */
export async function checkDaily(
	name: string,
	value: unknown,
	stops: readonly Stop[]
): Promise<{ filled: number; problems: string[] }> {
	const raw = (value ?? {}) as { time?: unknown; rounds?: unknown };
	const date = new Date(typeof raw.time === 'string' ? raw.time : NaN);
	let filled = 0;
	const problems: string[] = [];
	if (Array.isArray(raw.rounds) && !Number.isNaN(date.getTime())) {
		for (const [index, round] of (raw.rounds as Record<string, unknown>[]).entries()) {
			if (round?.mode !== 'orbit' || round.noon !== undefined || typeof round.body !== 'string')
				continue;
			const noon = await subsolarPoint(round.body, date);
			if (!noon) {
				problems.push(`round ${index + 1}: no position of the Sun over ${round.body}`);
				continue;
			}
			const cut = (degrees: number) => Number(degrees.toFixed(NOON_DIGITS));
			round.noon = { lat: cut(noon.lat), lon: cut(noon.lon) };
			filled++;
		}
	}
	let daily: Daily;
	try {
		daily = parseDaily(value);
	} catch (error) {
		return { filled, problems: [...problems, (error as Error).message] };
	}
	if (name !== `${daily.day}.json`) problems.push(`the file of ${daily.day} is named ${name}`);
	const offered = new Set(POOLS[DAILY.difficulty].map((body) => body.id));
	for (const [index, where] of daily.rounds.entries()) {
		const at = `round ${index + 1}`;
		if (!offered.has(where.body))
			problems.push(`${at}: the guess panel does not offer ${where.body}`);
		if (where.mode === 'ground') {
			if (!stops.some((stop) => stop.body === where.body && stop.entry.id === where.panorama))
				problems.push(`${at}: ${where.body} has no playable panorama ${where.panorama}`);
			continue;
		}
		if (aim(where.over, where.noon).u > 1)
			problems.push(`${at}: the Sun is too low over that place at ${daily.time}`);
		const body = bodyOf(where.body);
		// A planet is not asked: a shadow on it is a dot.
		if (body && body.system !== body.id && ((await sunlight(body.id, date)) ?? 1) < 1)
			problems.push(`${at}: ${where.body} is in shadow at ${daily.time}`);
	}
	return { filled, problems };
}

const TIMEOUT_MS = 5_000;

/** The challenge of the current day. Null when there is none, or when it does
 *  not come. */
export async function fetchDaily(): Promise<Daily | null> {
	if (!URL_OF_DAILY) return null;
	try {
		const answer = await fetch(URL_OF_DAILY, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		return answer.ok ? parseDaily(await answer.json()) : null;
	} catch {
		return null;
	}
}

/** The day's rounds. Null when one of them cannot be played here. */
export function dailyRun(daily: Daily, stops: readonly Stop[], canOrbit: boolean): Round[] | null {
	const time = Date.parse(daily.time);
	const rounds = daily.rounds.map((where) => roundAt(where, time, stops, canOrbit));
	return rounds.every((round): round is Round => round !== null) ? rounds : null;
}

const STARTED_KEY = 'spaceguesser.daily-started';

/** The last day whose challenge was started in this browser. */
export function recallStarted(): string | null {
	try {
		return localStorage.getItem(STARTED_KEY);
	} catch {
		return null;
	}
}

/** Uses up `day`, and returns it. */
export function keepStarted(day: string): string {
	try {
		localStorage.setItem(STARTED_KEY, day);
	} catch {
		// Not remembered: a reload can start it again.
	}
	return day;
}

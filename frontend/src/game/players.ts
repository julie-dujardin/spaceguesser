/** Who a player is to the others: a name, and the face their guesses wear on the map. */

export interface Profile {
	name: string;
	emoji: string;
	color: string;
}

/** The site's own Mars. No font has it, so it travels as the planet's symbol
 *  and is drawn from the icon. */
export const MARS = '♂';

/** The Moon as it is tonight: one face, worn as whichever phase is up. */
export const MOON = '🌕';

export const EMOJI = [
	'☀️',
	'🌞',
	'⭐',
	'💫',
	'🌠',
	'☄️',
	'🌌',
	'🌏',
	MARS,
	'🪐',
	MOON,
	'🌙',
	'🪨',
	'🚀',
	'🛸',
	'🛰️',
	'📡',
	'🔭',
	'🧑‍🚀',
	'🤖',
	'📎',
	'👽',
	'👾',
	'🦠'
];

const PHASES = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const SYNODIC_DAYS = 29.530588853;
/** A new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(now = Date.now()): string {
	const age = ((now - NEW_MOON_MS) / 86_400_000 / SYNODIC_DAYS) % 1;
	return PHASES[Math.round(((age + 1) % 1) * 8) % 8];
}

/** What an emoji is written as. Mars is the exception: it is a picture. */
export function glyph(emoji: string): string {
	return emoji === MOON ? moonPhase() : emoji;
}

export const MARS_ICON = '/favicon.svg';

export const SWATCHES = ['#e5e5e5', '#f59e0b', '#ef4444', '#22d3ee', '#a78bfa', '#4ade80'];

/** The server keeps 24 characters of a seat's name, and the face rides in
 *  front of it: a swatch digit and an emoji of up to three. */
export const NAME_MAX = 14;

export const DEFAULT_PROFILE: Profile = { name: '', emoji: '🚀', color: SWATCHES[1] };

/** The server seats a player under a name and nothing else, so the face
 *  travels inside it. */
export function seatName(profile: Profile): string {
	return `${Math.max(0, SWATCHES.indexOf(profile.color))}${profile.emoji}${profile.name.trim()}`;
}

/** A name that was not written by `seatName` is a player all the same. */
export function profileOf(seat: string): Profile {
	const color = SWATCHES[Number.parseInt(seat[0], 10)];
	const emoji = color && EMOJI.find((e) => seat.startsWith(e, 1));
	if (!emoji) return { ...DEFAULT_PROFILE, color: SWATCHES[0], name: seat };
	return { name: seat.slice(1 + emoji.length), emoji, color };
}

const KEY = 'spaceguesser.profile';

/** The face picked last time, so a regular is not asked twice. */
export function recallProfile(): Profile {
	try {
		const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
		if (kept && EMOJI.includes(kept.emoji ?? '') && SWATCHES.includes(kept.color ?? ''))
			return { ...DEFAULT_PROFILE, ...kept, name: String(kept.name ?? '').slice(0, NAME_MAX) };
	} catch {
		// Storage that is blocked or holds something else: start from the default.
	}
	return DEFAULT_PROFILE;
}

export function keepProfile(profile: Profile) {
	try {
		localStorage.setItem(KEY, JSON.stringify(profile));
	} catch {
		// Not remembered, then.
	}
}

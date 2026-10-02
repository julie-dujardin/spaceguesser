/** Who a player is to the others: a name, and the face their guesses wear on the map. */

export interface Profile {
	name: string;
	emoji: string;
	color: string;
}

export const EMOJI = [
	'☀️',
	'🌞',
	'⭐',
	'💫',
	'🌠',
	'☄️',
	'🌌',
	'🌏',
	'🪐',
	'🌕',
	'🌗',
	'🌒',
	'🌑',
	'🌙',
	'🪨',
	'🚀',
	'🛸',
	'🛰️',
	'📡',
	'🔭',
	'🧑‍🚀',
	'👽',
	'👾',
	'🦠'
];

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

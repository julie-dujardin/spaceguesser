/** A flat map mounted in a div, torn down with the component. */

import { useEffect, useRef, useState } from 'react';
import { TERMS } from '../game/host';
import { createFlatMap, type FlatMap, type FlatMapCreateOptions } from 'spacemap';
import { MARS, MARS_ICON, glyph, type Profile } from '../game/players';

type Options = Omit<FlatMapCreateOptions, 'container'>;

export function useFlatMap(options: Options) {
	const container = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<FlatMap | null>(null);
	const [error, setError] = useState<string | null>(null);
	// The map is built once; its options are read at that moment only.
	const initial = useRef(options);

	useEffect(() => {
		const element = container.current;
		if (!element) return;
		let made: FlatMap | null = null;
		let dropped = false;
		setError(null);
		createFlatMap({ ...TERMS, container: element, ...initial.current })
			.then((created) => {
				if (dropped) return created.remove();
				made = created;
				setMap(created);
			})
			.catch((cause: unknown) => {
				if (!dropped) setError(String(cause));
			});
		return () => {
			dropped = true;
			made?.remove();
			setMap(null);
		};
	}, []);

	return [container, map, error] as const;
}

/** A dot to pin on the map, carrying its round number when there is more than
 *  one run of them on screen. */
export function pin(className: string, label?: string): HTMLElement {
	const element = document.createElement('div');
	element.className = label ? `${className} numbered` : className;
	if (label) element.textContent = label;
	return element;
}

/** The line from a guess to its place, on either map. */
export const MISS = { color: '#ffffff', dash: '4 4' } as const;
export const OWN_MISS = 0.45;
export const OTHER_MISS = 0.25;

/** Pins that share a place, side by side: on it, or `under` it where the
 *  place has a name of its own to leave clear. */
export function pins(row: HTMLElement[], under = false): HTMLElement {
	const element = document.createElement('div');
	element.className = under ? 'pins under' : 'pins';
	element.append(...row);
	return element;
}

/** A player's guess, wearing their face. */
export function face(profile: Profile, mine = false): HTMLElement {
	const element = document.createElement('div');
	element.className = mine ? 'emo mine' : 'emo';
	element.style.background = profile.color;
	if (profile.emoji === MARS) element.appendChild(new Image()).src = MARS_ICON;
	else element.textContent = glyph(profile.emoji);
	return element;
}

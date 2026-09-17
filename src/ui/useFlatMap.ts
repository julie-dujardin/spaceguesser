/** A flat map mounted in a div, torn down with the component. */

import { useEffect, useRef, useState } from 'react';
import { createFlatMap, type FlatMap, type FlatMapCreateOptions } from 'spacemap';

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
		createFlatMap({ container: element, ...initial.current })
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

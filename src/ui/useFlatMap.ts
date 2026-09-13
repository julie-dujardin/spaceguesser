/** A flat map mounted in a div, torn down with the component. */

import { useEffect, useRef, useState } from 'react';
import { createFlatMap, type FlatMap, type FlatMapCreateOptions } from 'spacemap';

type Options = Omit<FlatMapCreateOptions, 'container'>;

export function useFlatMap(options: Options) {
	const container = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<FlatMap | null>(null);
	// The map is built once; its options are read at that moment only.
	const initial = useRef(options);

	useEffect(() => {
		const element = container.current;
		if (!element) return;
		let made: FlatMap | null = null;
		let dropped = false;
		createFlatMap({ container: element, ...initial.current })
			.then((created) => {
				if (dropped) return created.remove();
				made = created;
				setMap(created);
			})
			.catch(() => undefined);
		return () => {
			dropped = true;
			made?.remove();
			setMap(null);
		};
	}, []);

	return [container, map] as const;
}

/** A dot to pin on the map. */
export function pin(className: string): HTMLElement {
	const element = document.createElement('div');
	element.className = className;
	return element;
}

/** The game's one Solar System map, mounted for as long as the page is. */

import { useEffect, useRef, useState } from 'react';
import { Space } from '../game/space';

/**
 * Opened once per page and never removed: a second map on a page that has
 * dropped its first comes up without its stars, and React's development
 * double-mount would make every session that page.
 */
let opening: Promise<Space> | null = null;

export function useSpace() {
	const container = useRef<HTMLDivElement>(null);
	const [space, setSpace] = useState<Space | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const element = container.current;
		if (!element) return;
		let dropped = false;
		opening ??= Space.open(element);
		opening
			.then((opened) => {
				if (dropped) return;
				setSpace(opened);
				if (import.meta.env.DEV) Object.assign(window, { __space: opened });
			})
			.catch((cause: unknown) => {
				if (!dropped) setError(String(cause));
			});
		return () => {
			dropped = true;
		};
	}, []);

	return [container, space, error] as const;
}

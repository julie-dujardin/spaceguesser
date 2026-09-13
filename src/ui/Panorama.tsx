/** The round's panorama, filling the screen behind the HUD. */

import { useEffect, useRef, useState } from 'react';
import { createPanorama, type PanoramaEntry, type PanoramaView } from 'spacemap';
import type { Movement } from '../game/rules';

interface Props {
	body: string;
	/** Panorama to stand in. Changing it walks the same view over. */
	at: string;
	movement: Movement;
	/** Where the reader ends up, which in free movement is not where they
	 *  started: the guess is scored against this. */
	onPlace: (entry: PanoramaEntry) => void;
	onHeading: (deg: number) => void;
}

export function Panorama({ body, at, movement, onPlace, onHeading }: Props) {
	const container = useRef<HTMLDivElement>(null);
	const [view, setView] = useState<PanoramaView | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Read at mount time only: a new panorama is opened on the view, not a new view.
	const opening = useRef(at);
	const place = useRef(onPlace);
	const heading = useRef(onHeading);
	place.current = onPlace;
	heading.current = onHeading;

	useEffect(() => {
		const element = container.current;
		if (!element) return;
		let made: PanoramaView | null = null;
		let dropped = false;
		setError(null);
		createPanorama({
			container: element,
			body,
			at: opening.current,
			// The credit line would otherwise sit under the guess map.
			attributionPosition: 'bottom-left',
			interactive: movement !== 'frozen',
			arrows: movement === 'free',
			events: {
				load: (entry) => place.current(entry),
				viewchange: (state) => heading.current(state.heading)
			}
		})
			.then((created) => {
				if (dropped) return created.remove();
				made = created;
				setView(created);
			})
			.catch((cause: unknown) => {
				if (!dropped) setError(String(cause));
			});
		return () => {
			dropped = true;
			made?.remove();
			setView(null);
		};
	}, [body, movement]);

	useEffect(() => {
		if (!view || view.getCurrent()?.id === at) return;
		void view.open(at).catch((cause: unknown) => setError(String(cause)));
	}, [view, at]);

	return (
		<div className="stage">
			<div ref={container} style={{ position: 'absolute', inset: 0 }} />
			<div className="stage-shade" />
			{!view && !error && <div className="stage-note">dropping in…</div>}
			{error && <div className="stage-note">{error}</div>}
		</div>
	);
}

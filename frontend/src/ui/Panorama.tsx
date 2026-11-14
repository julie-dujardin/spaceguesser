/** The round's panorama, filling the screen behind the HUD. */

import { LocateFixed } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HOST } from '../game/host';
import { createPanorama, type PanoramaEntry, type PanoramaView } from 'spacemap';
import type { Movement } from '../game/rules';
import * as m from '../paraglide/messages.js';
import { ToolSlot } from './tools';

interface Props {
	body: string;
	/** Panorama to stand in. Changing it walks the same view over. */
	at: string;
	movement: Movement;
	/** Where the reader ends up, which in free movement is not where they
	 *  started: the guess is scored against this. */
	onPlace: (entry: PanoramaEntry) => void;
	/** Null where the panorama does not know where north is. */
	onHeading: (deg: number | null) => void;
	/** The panorama asked for is on screen, or will not be: the round can begin. */
	onReady: () => void;
	/** The reader has turned back to the panorama. */
	onEngage: () => void;
	/** Held back behind a card, rather than being played on. */
	dimmed?: boolean;
	/** Kept out of sight, loaded or not, until the round begins for everyone. */
	veiled?: boolean;
}

export function Panorama({
	body,
	at,
	movement,
	onPlace,
	onHeading,
	onReady,
	onEngage,
	dimmed,
	veiled
}: Props) {
	const container = useRef<HTMLDivElement>(null);
	const [view, setView] = useState<PanoramaView | null>(null);
	const [error, setError] = useState<string | null>(null);
	/** The panorama last opened, and the round's it was opened in. */
	const [here, setHere] = useState<{ round: string; id: string } | null>(null);
	const { slot } = useContext(ToolSlot);
	// The view on screen. `view` is still the old one for a render after a
	// rebuild removed it, and what that one has to say is no longer news.
	const live = useRef<PanoramaView | null>(null);
	// Where a view built now would open. Within one view a new panorama is
	// opened on it instead, but the movement mode does rebuild the view, and it
	// should come up in the place the reader is playing rather than the one they
	// mounted on.
	const opening = useRef(at);
	// The panorama asked for would not open, so the one still drawn is not the
	// round's to give a heading for.
	const broken = useRef(false);
	const place = useRef(onPlace);
	const heading = useRef(onHeading);
	const ready = useRef(onReady);
	opening.current = at;
	place.current = onPlace;
	heading.current = onHeading;
	ready.current = onReady;

	const lose = (cause: unknown) => {
		broken.current = true;
		heading.current(null);
		setError(String(cause));
	};

	useEffect(() => {
		const element = container.current;
		if (!element) return;
		let made: PanoramaView | null = null;
		let dropped = false;
		let loaded: PanoramaEntry | null = null;
		// Which way the view faces, until there is a view to ask.
		let facing: number | null = null;
		// A heading is only worth showing for the panorama on screen, once it has
		// loaded and if it knows where north is.
		const report = () => {
			const on = made ? made.getCurrent() : loaded;
			const known =
				!!loaded && on?.id === loaded.id && loaded.orientation !== 'unknown' && !broken.current;
			heading.current(known ? (made ? made.getView().heading : facing) : null);
		};
		broken.current = false;
		setError(null);
		createPanorama({
			...HOST,
			container: element,
			body,
			at: opening.current,
			interactive: movement !== 'frozen',
			arrows: movement === 'free',
			events: {
				load: (entry) => {
					// A view taken down still talks, about a round no longer on
					// screen.
					if (dropped) return;
					setHere({ round: opening.current, id: entry.id });
					place.current(entry);
					broken.current = false;
					loaded = entry;
					report();
					// Not a panorama walked to.
					if (entry.id === opening.current) ready.current();
				},
				viewchange: (state) => {
					if (dropped) return;
					facing = state.heading;
					report();
				}
			}
		})
			.then((created) => {
				if (dropped) return created.remove();
				made = created;
				live.current = created;
				report();
				setView(created);
			})
			.catch((cause: unknown) => {
				if (dropped) return;
				setError(String(cause));
				ready.current();
			});
		return () => {
			dropped = true;
			heading.current(null);
			made?.remove();
			live.current = null;
			setView(null);
		};
	}, [body, movement]);

	useEffect(() => {
		if (!view || view !== live.current || view.getCurrent()?.id === at) return;
		heading.current(null);
		void view.open(at).catch((cause: unknown) => {
			if (view !== live.current) return;
			lose(cause);
			ready.current();
		});
	}, [view, at]);

	const walked = here?.round === at && here.id !== at;
	const back = () => {
		const shown = live.current;
		void shown?.open(at).catch((cause: unknown) => {
			if (shown === live.current) lose(cause);
		});
	};

	const note = error ?? (!view ? m.dropping_in() : veiled ? m.waiting_for_others() : null);
	return (
		<>
			<div className="stage" onPointerDown={onEngage}>
				<div ref={container} style={{ position: 'absolute', inset: 0 }} />
				{dimmed && <div className="stage-dim" />}
				<div className="stage-shade" />
				{note && <div className={`stage-note${veiled ? ' veil' : ''}`}>{note}</div>}
			</div>
			{walked &&
				!dimmed &&
				slot &&
				createPortal(
					<div className="hands">
						<button
							type="button"
							className="btn glassy ico"
							title={m.back_to_start()}
							aria-label={m.back_to_start()}
							onClick={back}
						>
							<LocateFixed size={14} />
						</button>
					</div>,
					slot
				)}
		</>
	);
}

/** An orbit round: hanging over a body, in the game's Solar System map. */

import { useEffect, useRef, useState } from 'react';
import type { OrbitRound, Place } from '../game/rounds';
import type { Movement } from '../game/rules';
import { DOWN, type Gaze, type Space } from '../game/space';
import * as m from '../paraglide/messages.js';

interface Props {
	/** Null while the map is still coming up. */
	space: Space | null;
	/** Why there will be no map, when there will not. */
	unavailable?: string | null;
	round: OrbitRound;
	movement: Movement;
	/** The place the round turned out to be over, once the sky has said. */
	onPlace: (place: Place) => void;
	onHeading: (deg: number) => void;
	/** The map could not get there: the round cannot be played. */
	onLost: () => void;
	/** The reader has turned back to the view. */
	onEngage: () => void;
	/** Held back behind a card, rather than being played on. */
	dimmed?: boolean;
}

/** Degrees the view turns per pixel dragged. */
const TURN = 0.15;

export function Orbit({
	space,
	unavailable,
	round,
	movement,
	onPlace,
	onLost,
	onHeading,
	onEngage,
	dimmed
}: Props) {
	const [place, setPlace] = useState<Place | null>(null);
	const [error, setError] = useState<string | null>(null);
	const gaze = useRef<Gaze>(DOWN);
	const placed = useRef(onPlace);
	const heading = useRef(onHeading);
	const lost = useRef(onLost);
	placed.current = onPlace;
	heading.current = onHeading;
	lost.current = onLost;
	// A lobby hands the same round over as a new object on every snapshot.
	const asked = useRef(round);
	asked.current = round;
	const key = `${round.body}:${round.time}:${round.u}:${round.v}`;

	useEffect(() => {
		if (!space) return;
		let dropped = false;
		setPlace(null);
		setError(null);
		space
			.place(asked.current)
			.then((found) => {
				if (dropped) return;
				gaze.current = DOWN;
				space.look(found, DOWN);
				heading.current(0);
				setPlace(found);
				placed.current(found);
			})
			.catch((cause: unknown) => {
				if (dropped) return;
				setError(String(cause));
				lost.current();
			});
		return () => {
			dropped = true;
			space.release();
		};
	}, [space, key]);

	// Frozen is the view straight down and nothing else; free has no walking to
	// do up here yet, so it looks around as look-only does.
	const turning = movement !== 'frozen' && !dimmed && !!place;
	const last = useRef<{ x: number; y: number } | null>(null);

	return (
		<div
			className={`stage-over${turning ? ' turning' : ''}${place ? '' : ' veiled'}`}
			onPointerDown={(event) => {
				onEngage();
				if (!turning) return;
				last.current = { x: event.clientX, y: event.clientY };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (!turning || !last.current || !space || !place) return;
				const dx = event.clientX - last.current.x;
				const dy = event.clientY - last.current.y;
				last.current = { x: event.clientX, y: event.clientY };
				// Dragged like a picture: the view goes the other way.
				gaze.current = {
					heading: (((gaze.current.heading - dx * TURN) % 360) + 360) % 360,
					pitch: Math.min(80, Math.max(-90, gaze.current.pitch + dy * TURN))
				};
				space.look(place, gaze.current);
				onHeading(gaze.current.heading);
			}}
			onPointerUp={() => (last.current = null)}
			onPointerCancel={() => (last.current = null)}
		>
			{dimmed && <div className="stage-dim" />}
			<div className="stage-shade" />
			{!place && !error && !unavailable && <div className="stage-note">{m.dropping_in()}</div>}
			{(error ?? unavailable) && <div className="stage-note">{error ?? unavailable}</div>}
		</div>
	);
}

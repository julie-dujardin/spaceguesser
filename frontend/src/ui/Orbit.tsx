/** An orbit round: hanging over a body, in the game's Solar System map. */

import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { bearingDeg, type LonLat } from 'spacemap';
import { RAD, step, type OrbitRound, type Place } from '../game/rounds';
import type { Movement } from '../game/rules';
import { DOWN, type Gaze, type Space } from '../game/space';
import * as m from '../paraglide/messages.js';
import { ToolSlot } from './tools';

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

/** Views straight down that a held key crosses per second. */
const KEY_SPEED = 0.6;

/** Forward and rightward along the gaze. Physical keys, so ZQSD on AZERTY. */
const KEYS: Record<string, readonly [number, number]> = {
	KeyW: [1, 0],
	ArrowUp: [1, 0],
	KeyS: [-1, 0],
	ArrowDown: [-1, 0],
	KeyA: [0, -1],
	ArrowLeft: [0, -1],
	KeyD: [0, 1],
	ArrowRight: [0, 1]
};

/** What a drag does in free movement. */
type Hands = 'look' | 'move';

const wrap = (deg: number) => ((deg % 360) + 360) % 360;

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
	const [hands, setHands] = useState<Hands>('look');
	const [moved, setMoved] = useState(false);
	const { slot } = useContext(ToolSlot);
	const gaze = useRef<Gaze>(DOWN);
	// Where the camera hangs. The round is still scored at `place`, for
	// everyone: moving is for finding out where that is.
	const here = useRef<LonLat | null>(null);
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
		setHands('look');
		setMoved(false);
		space
			.place(asked.current)
			.then((found) => {
				if (dropped) return;
				gaze.current = DOWN;
				here.current = found;
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

	// Frozen is the view straight down and nothing else; free moves the camera
	// as well as turning it.
	const active = !dimmed && !!place;
	const turning = movement !== 'frozen' && active;
	const roaming = movement === 'free' && active;
	const last = useRef<{ x: number; y: number } | null>(null);

	/** Slide the camera over the ground, in kilometres along the gaze and to
	 *  its right. */
	const shift = (forward: number, right: number) => {
		const from = here.current;
		const radius = place && space?.radiusKm(place.body);
		if (!from || !place || !space || !radius || (!forward && !right)) return;
		const bearing = gaze.current.heading * RAD + Math.atan2(right, forward);
		const to = step(from, bearing, Math.hypot(forward, right) / radius);
		// The gaze keeps its angle to the path, so it does not spin round on
		// crossing a pole.
		const turn = bearingDeg(to, from) + 180 - bearing / RAD;
		gaze.current = { ...gaze.current, heading: wrap(gaze.current.heading + turn) };
		here.current = to;
		space.look({ ...place, ...to }, gaze.current);
		heading.current(gaze.current.heading);
		setMoved(true);
	};

	useEffect(() => {
		if (!roaming || !space || !place) return;
		const held = new Set<string>();
		let frame = 0;
		let then = 0;
		const tick = (now: number) => {
			let forward = 0;
			let right = 0;
			for (const code of held) {
				forward += KEYS[code][0];
				right += KEYS[code][1];
			}
			const length = Math.hypot(forward, right);
			const span = space.spanKm(place.body);
			if (then && length && span) {
				// A slow frame is not made up for with one long jump.
				const km = (span * KEY_SPEED * Math.min(now - then, 100)) / 1000 / length;
				shift(forward * km, right * km);
			}
			then = now;
			frame = held.size ? requestAnimationFrame(tick) : 0;
		};
		const down = (event: KeyboardEvent) => {
			if (!(event.code in KEYS) || event.ctrlKey || event.metaKey || event.altKey) return;
			// Typed into, rather than flown with.
			if ((event.target as Element).closest('input, textarea, select, [contenteditable]')) return;
			event.preventDefault();
			held.add(event.code);
			if (frame) return;
			then = 0;
			frame = requestAnimationFrame(tick);
		};
		const up = (event: KeyboardEvent) => held.delete(event.code);
		// A key let go of in another window never says so here.
		const drop = () => held.clear();
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', drop);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', drop);
		};
		// `shift` reads nothing else that changes.
	}, [roaming, space, place]);

	const back = () => {
		if (!space || !place) return;
		here.current = place;
		space.look(place, gaze.current);
		setMoved(false);
	};

	return (
		<>
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
					if (roaming && hands === 'move') {
						// Dragged like a map: looking straight down, the ground under the
						// pointer stays under it.
						const km = (space.spanKm(place.body) ?? 0) / event.currentTarget.clientHeight;
						shift(dy * km, -dx * km);
						return;
					}
					// Dragged like a picture: the view goes the other way.
					gaze.current = {
						heading: wrap(gaze.current.heading - dx * TURN),
						pitch: Math.min(80, Math.max(-90, gaze.current.pitch + dy * TURN))
					};
					space.look({ ...place, ...here.current }, gaze.current);
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
			{roaming &&
				slot &&
				createPortal(
					<div className="hands">
						{moved && (
							<button
								type="button"
								className="btn glassy ico"
								title={m.orbit_back()}
								aria-label={m.orbit_back()}
								onClick={back}
							>
								<Icon d={LOCATE} />
							</button>
						)}
						<div className="pick" role="group" aria-label={m.orbit_drag()}>
							<button
								type="button"
								aria-pressed={hands === 'look'}
								title={m.orbit_look_title()}
								onClick={() => setHands('look')}
							>
								<Icon d={EYE} />
								<span>{m.orbit_look()}</span>
							</button>
							<button
								type="button"
								aria-pressed={hands === 'move'}
								title={m.orbit_move_title()}
								onClick={() => setHands('move')}
							>
								<Icon d={MOVE} />
								<span>{m.orbit_move()}</span>
							</button>
						</div>
					</div>,
					slot
				)}
		</>
	);
}

const EYE =
	'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0';
const MOVE = 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3';
const LOCATE =
	'M2 12h3M19 12h3M12 2v3M12 19v3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0';

function Icon({ d }: { d: string }) {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={d} />
		</svg>
	);
}

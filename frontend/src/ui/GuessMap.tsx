/** The map in the corner: click a place, then commit to it. */

import { useEffect, useRef, type ReactNode } from 'react';
import type { FlatMarker, LonLat } from 'spacemap';
import { pin, useFlatMap } from './useFlatMap';

interface Props {
	body: string;
	guess: LonLat | null;
	/** Taking up the corner, rather than tucked out of the panorama's way. */
	open: boolean;
	headingDeg: number;
	onOpen: () => void;
	onPick: (at: LonLat) => void;
	onReady: (radiusKm: number | null) => void;
	onGuess: () => void;
	/** Said in the foot once the guess is in and others are still out: the map
	 *  stops taking picks. */
	waiting?: string;
	/** Stands where the Guess button was while waiting. */
	action?: ReactNode;
}

export function GuessMap({
	body,
	guess,
	open,
	headingDeg,
	onOpen,
	onPick,
	onReady,
	onGuess,
	waiting,
	action
}: Props) {
	const [container, map, error] = useFlatMap({
		body,
		projection: 'equirectangular',
		// The grid is what makes a bare surface readable; named features stay off
		// while the round is live.
		layers: { graticule: true, nomenclature: false }
	});
	const marker = useRef<FlatMarker | null>(null);
	const pick = useRef(onPick);
	const ready = useRef(onReady);
	/** Whether the map was already open when the gesture began. */
	const taking = useRef(open);
	const locked = useRef(false);
	locked.current = waiting !== undefined;
	pick.current = onPick;
	ready.current = onReady;

	useEffect(() => {
		if (!map) return;
		ready.current(map.bodyRadiusKm);
		return map.on('click', (at) => at && taking.current && !locked.current && pick.current(at));
	}, [map]);

	useEffect(() => {
		if (!map) return;
		if (!guess) {
			marker.current?.remove();
			marker.current = null;
		} else if (marker.current) marker.current.setPosition(guess);
		else marker.current = map.addMarker({ at: guess, element: pin('pin'), align: [0.5, 0.5] });
	}, [map, guess]);

	return (
		<div
			className={`mapw${open ? ' wide' : ''}`}
			onPointerEnter={onOpen}
			onPointerDown={() => {
				// The tap that opens the map also lands as a click, on a box that has
				// grown since: a pin from it would sit nowhere the reader aimed.
				taking.current = open;
				onOpen();
			}}
			onFocusCapture={onOpen}
		>
			<div className="surface" ref={container} />
			<div className="foot">
				<span className="mono mut" style={{ fontSize: '11.5px' }} title={error ?? undefined}>
					{error
						? 'no map — guess unavailable'
						: (waiting ?? `heading ${String(Math.round(headingDeg) % 360).padStart(3, '0')}°`)}
				</span>
				{waiting === undefined ? (
					<button
						type="button"
						className="btn"
						style={{ marginLeft: 'auto', width: 120 }}
						disabled={!guess}
						onClick={onGuess}
					>
						Guess
					</button>
				) : (
					action
				)}
			</div>
		</div>
	);
}

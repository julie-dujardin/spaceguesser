/** Where the guesses landed against where the panoramas were taken. */

import { useEffect, useRef } from 'react';
import type { LonLat } from 'spacemap';
import { pin, useFlatMap } from './useFlatMap';

export interface Placement {
	/** Null when the round ran out with nothing picked. */
	guess: LonLat | null;
	truth: LonLat;
}

interface Props {
	body: string;
	rounds: Placement[];
}

const PADDING = 2.5;
/** Mars's global mosaic runs out of detail well before the map's own zoom
 *  ceiling, so a near-perfect guess is framed at a readable scale rather than
 *  on mush. Across a full window this still sets a thirty-kilometre miss
 *  visibly apart. */
const MAX_ZOOM = 8;
/** A round with nothing to compare the place against: near enough to read the
 *  ground, far enough to say where on the body it is. */
const LONE_ZOOM = 4;

/** A view holding every point, with room around them; zoom 1 is the whole body. */
function framing(rounds: Placement[]): { lon: number; lat: number; zoom: number } {
	const points = rounds.flatMap(({ guess, truth }) => (guess ? [guess, truth] : [truth]));
	if (!points.length) return { lon: 0, lat: 0, zoom: 1 };
	const lons = points.map((at) => at.lon);
	const lats = points.map((at) => at.lat);
	const [west, east] = [Math.min(...lons), Math.max(...lons)];
	const [south, north] = [Math.min(...lats), Math.max(...lats)];
	const middle = { lon: (west + east) / 2, lat: (south + north) / 2 };
	// One place, with nothing to hold it against.
	if (east - west < 0.01 && north - south < 0.01) return { ...middle, zoom: LONE_ZOOM };
	const span = (low: number, high: number, floor: number) =>
		Math.max((high - low) * PADDING, floor);
	const zoom = Math.min(360 / span(west, east, 4), 180 / span(south, north, 2));
	return { ...middle, zoom: Math.max(1, Math.min(zoom, MAX_ZOOM)) };
}

export function ResultMap({ body, rounds }: Props) {
	const [container, map] = useFlatMap({
		body,
		projection: 'equirectangular',
		// The round is over: the names are the point of showing the map at all.
		layers: { nomenclature: true }
	});
	const opening = useRef(rounds);

	// Framing is where the reader is put, not where they are held: it happens
	// once, and the map is theirs to drag and zoom from there.
	useEffect(() => {
		if (!map) return;
		const { lon, lat, zoom } = framing(opening.current);
		map.setView({ centerLon: lon, centerLat: lat, zoom });
	}, [map]);

	useEffect(() => {
		if (!map) return;
		// A run's worth of dots needs to say which round each one was.
		const numbered = rounds.length > 1;
		const drawn = rounds.flatMap(({ guess, truth }, index) => {
			const label = numbered ? String(index + 1) : undefined;
			const actual = map.addMarker({
				at: truth,
				element: pin('pin truth', label),
				align: [0.5, 0.5]
			});
			if (!guess) return [actual];
			return [
				map.addPolyline({
					points: [guess, truth],
					interpolate: 'geodesic',
					color: '#ffffff',
					opacity: 0.45,
					widthPx: 1,
					dash: '4 4'
				}),
				map.addMarker({ at: guess, element: pin('pin', label), align: [0.5, 0.5] }),
				actual
			];
		});
		return () => drawn.forEach((item) => item.remove());
	}, [map, rounds]);

	return <div className="surface" ref={container} />;
}

/** Where the guesses landed on a body's own map, against where the round was. */

import { useEffect, useRef } from 'react';
import type { LonLat } from 'spacemap';
import type { Profile } from '../game/players';
import { face, pin, useFlatMap } from './useFlatMap';

export interface Placement {
	/** Null when the round ran out with nothing picked. */
	guess: LonLat | null;
	truth: LonLat;
	/** Worn by the guess in place of the dot, where a dot does not say whose it is. */
	avatar?: Profile;
	/** Where everyone else put theirs. */
	others?: { at: LonLat; avatar: Profile }[];
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
	const points = rounds.flatMap(({ guess, truth, others = [] }) => [
		truth,
		...(guess ? [guess] : []),
		...others.map((other) => other.at)
	]);
	if (!points.length) return { lon: 0, lat: 0, zoom: 1 };
	// The export writes east longitudes and the map reports clicks either side
	// of zero, so a guess beside a place near the seam can sit 360° from it:
	// every point is read on the turn of the map nearest the first.
	const lons = points.map((at) => at.lon - 360 * Math.round((at.lon - points[0].lon) / 360));
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
		const drawn = rounds.flatMap(({ guess, truth, avatar, others = [] }, index) => {
			const label = numbered ? String(index + 1) : undefined;
			const miss = (from: LonLat, opacity: number) =>
				map.addPolyline({
					points: [from, truth],
					interpolate: 'geodesic',
					color: '#ffffff',
					opacity,
					widthPx: 1,
					dash: '4 4'
				});
			const own = avatar ? face(avatar, true) : pin('pin', label);
			// In drawing order: the reader's own guess over the others', and the
			// place itself over them all.
			return [
				...others.flatMap((other) => [
					miss(other.at, 0.25),
					map.addMarker({ at: other.at, element: face(other.avatar), align: [0.5, 0.5] })
				]),
				...(guess
					? [miss(guess, 0.45), map.addMarker({ at: guess, element: own, align: [0.5, 0.5] })]
					: []),
				map.addMarker({ at: truth, element: pin('pin truth', label), align: [0.5, 0.5] })
			];
		});
		return () => drawn.forEach((item) => item.remove());
	}, [map, rounds]);

	return <div className="surface" ref={container} />;
}

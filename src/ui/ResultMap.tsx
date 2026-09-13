/** Where the guess landed against where the panorama was taken. */

import { useEffect } from 'react';
import type { LonLat } from 'spacemap';
import { pin, useFlatMap } from './useFlatMap';

interface Props {
	body: string;
	/** Null when the round ran out with nothing picked. */
	guess: LonLat | null;
	truth: LonLat;
}

/** Zoom that fits both points with room around them; 1 is the whole body. */
function framing(guess: LonLat | null, truth: LonLat): { lon: number; lat: number; zoom: number } {
	if (!guess) return { lon: truth.lon, lat: truth.lat, zoom: 8 };
	const span = (a: number, b: number, floor: number) => Math.max(Math.abs(a - b) * 2.5, floor);
	const zoom = Math.min(360 / span(guess.lon, truth.lon, 4), 180 / span(guess.lat, truth.lat, 2));
	// Mars's global mosaic runs out of detail well before the map's own zoom
	// ceiling, so a near-perfect guess is framed at a readable scale instead of
	// on top of itself.
	return {
		lon: (guess.lon + truth.lon) / 2,
		lat: (guess.lat + truth.lat) / 2,
		zoom: Math.max(1, Math.min(zoom, 12))
	};
}

export function ResultMap({ body, guess, truth }: Props) {
	const [container, map] = useFlatMap({
		body,
		projection: 'equirectangular',
		interactive: false,
		// The round is over: the names are the point of showing the map at all.
		layers: { nomenclature: true }
	});

	useEffect(() => {
		if (!map) return;
		const { lon, lat, zoom } = framing(guess, truth);
		map.setView({ centerLon: lon, centerLat: lat, zoom });
		const actual = map.addMarker({ at: truth, element: pin('pin truth'), align: [0.5, 0.5] });
		if (!guess) return () => actual.remove();
		const line = map.addPolyline({
			points: [guess, truth],
			interpolate: 'geodesic',
			color: '#ffffff',
			opacity: 0.45,
			widthPx: 1,
			dash: '4 4'
		});
		const mine = map.addMarker({ at: guess, element: pin('pin'), align: [0.5, 0.5] });
		return () => {
			line.remove();
			mine.remove();
			actual.remove();
		};
	}, [map, guess, truth]);

	return <div className="surface" ref={container} />;
}

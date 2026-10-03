/**
 * Where the guesses landed, in the Solar System map: every guess pinned on the
 * body it named, seen from far enough to hold them all, then flown in to the
 * place itself and, where the body has one, onto its own map. The slider is the
 * same flight in the reader's hands.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LonLat } from 'spacemap';
import { bodyOf, type BodyKind } from '../game/bodies';
import type { Profile } from '../game/players';
import type { Place, Round } from '../game/rounds';
import type { Guess } from '../game/scoring';
import type { Space } from '../game/space';
import { ResultMap, type Placement } from './ResultMap';
import { face, pin } from './useFlatMap';

export interface RecapGuess {
	guess: Guess;
	/** Worn by the guess in place of the dot, where a dot does not say whose it is. */
	avatar?: Profile;
	/** The reader's own, drawn over the others'. */
	mine?: boolean;
}

export interface RecapRound {
	round: Round;
	truth: Place;
	guesses: RecapGuess[];
}

interface Props {
	/** Null while the map is still coming up. */
	space: Space | null;
	rounds: RecapRound[];
	/** The round looked at by itself; null for the whole run at once. */
	focus: number | null;
}

const SUN = 'naif-10';
const AU_KM = 149_597_870.7;

/** The whole run is looked at from over the Sun's pole, between these. */
const RUN_FAR_KM = 110 * AU_KM;
const RUN_NEAR_KM = 2.5 * AU_KM;

/** A camera this many times as far as two things are apart holds both. */
const HOLD = 2.4;
/** How far back a round starts when every guess is on the right body. */
const BACK_OFF = 2.6;

/** The last of the slider is the body's own map coming up over the globe. */
const FLAT_FROM = 0.88;

/** The flight takes this long for every tenfold of distance it covers. */
const MS_PER_DECADE = 1100;
const MIN_FLIGHT_MS = 1800;
const MAX_FLIGHT_MS = 7000;
/** Long enough to see where everything is before it starts to move. */
const HOLD_MS = 900;

interface Flight {
	body: string;
	farKm: number;
	nearKm: number;
	/** Where on the slider the flight stops by itself. */
	rest: number;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function anchorOf(body: string, at: LonLat | null) {
	return at ? { body, latitude: at.lat, longitude: at.lon } : { body };
}

/** The kinds of small body that had a part in these rounds. */
function kindsIn(rounds: RecapRound[]): Set<BodyKind> {
	const ids = rounds.flatMap(({ truth, guesses }) => [
		truth.body,
		...guesses.map((entry) => entry.guess.body)
	]);
	return new Set(ids.flatMap((id) => bodyOf(id)?.kind ?? []));
}

export function Recap({ space, rounds, focus }: Props) {
	/** 0 is as far as the view goes, 1 as near. */
	const [zoom, setZoom] = useState(0);
	const [flight, setFlight] = useState<Flight | null>(null);
	const [error, setError] = useState<string | null>(null);
	const flying = useRef<number | null>(null);
	// A lobby hands the same rounds over as new objects on every snapshot.
	const key = JSON.stringify(rounds);
	const shown = useRef(rounds);
	shown.current = rounds;

	const land = () => {
		if (flying.current !== null) cancelAnimationFrame(flying.current);
		flying.current = null;
	};

	// The next round gets the map back as a round has it: the whole sky,
	// unnamed, and not the reader's to move.
	useEffect(
		() => () => {
			space?.dress(null);
			space?.hands(null);
		},
		[space]
	);

	useEffect(() => {
		if (!space) return;
		let dropped = false;
		const drawn: { remove(): void }[] = [];
		const { map } = space;
		setFlight(null);
		setError(null);
		setZoom(0);
		land();

		// A pin on the far side of its body is hidden rather than shown through
		// it: the reader can turn the body round.
		const mark = (body: string, at: LonLat | null, element: HTMLElement) =>
			drawn.push(
				map.addMarker({ anchor: anchorOf(body, at), element, align: [0.5, 0.5], occlude: !!at })
			);

		const run = async () => {
			const all = shown.current;
			const one = focus === null ? null : all[focus];
			// The whole run is on one map, which has one date: the last round's.
			const time = (one ?? all[all.length - 1]).round.time;
			await space.travel(time, one ? one.truth.body : SUN);
			if (dropped) return;
			space.dress(kindsIn(one ? [one] : all));

			let next: Flight;
			if (one) {
				const { truth } = one;
				const mapped = !!bodyOf(truth.body)?.surface;
				const place = anchorOf(truth.body, mapped ? truth : null);
				let widest = 0;
				// The reader's own guess over the others', the place over them all.
				const ordered = [...one.guesses].sort((a, b) => Number(!!a.mine) - Number(!!b.mine));
				for (const { guess, avatar, mine } of ordered) {
					const there = anchorOf(guess.body, guess.at);
					const offset = map.offsetKm(place, there);
					// A body the map never loaded has nowhere to pin a guess.
					if (!offset) continue;
					if (guess.body !== truth.body) {
						widest = Math.max(widest, space.apart(truth.body, guess.body) ?? 0);
						drawn.push(
							map.addPolyline({
								anchor: place,
								points: [[0, 0, 0], offset],
								color: '#ffffff',
								opacity: mine ? 0.5 : 0.28,
								widthPx: 1
							})
						);
					} else if (guess.at && mapped) {
						drawn.push(
							map.addSurfacePolyline({
								body: truth.body,
								points: [guess.at, truth],
								interpolate: 'geodesic',
								color: '#ffffff',
								opacity: mine ? 0.6 : 0.3,
								widthPx: 1
							})
						);
					}
					mark(guess.body, guess.at, avatar ? face(avatar, mine) : pin('pin'));
				}
				mark(truth.body, mapped ? truth : null, pin('pin truth'));
				const nearKm = space.standoffKm(truth.body);
				next = {
					body: truth.body,
					nearKm,
					farKm: Math.max(widest * HOLD, nearKm * BACK_OFF),
					rest: 1
				};
				space.frame(truth.body, next.farKm, truth);
			} else {
				let reach = 0;
				all.forEach(({ truth, guesses }, index) => {
					const label = String(index + 1);
					const own = guesses.find((entry) => entry.mine)?.guess;
					// A guess on the right body sits under the place's own pin from here.
					if (own && own.body !== truth.body) {
						mark(own.body, null, pin('pin', label));
						reach = Math.max(reach, space.apart(SUN, own.body) ?? 0);
					}
					mark(truth.body, null, pin('pin truth', label));
					reach = Math.max(reach, space.apart(SUN, truth.body) ?? 0);
				});
				const fit = Math.min(RUN_FAR_KM, Math.max(RUN_NEAR_KM, reach * HOLD));
				next = {
					body: SUN,
					farKm: RUN_FAR_KM,
					nearKm: RUN_NEAR_KM,
					rest: Math.log(RUN_FAR_KM / fit) / Math.log(RUN_FAR_KM / RUN_NEAR_KM)
				};
				// From over the pole, where the orbits are circles rather than lines.
				space.frame(SUN, RUN_FAR_KM, { lat: 70, lon: 0 });
			}
			setFlight(next);

			const decades = Math.log10(next.farKm / next.nearKm) * next.rest;
			const duration = Math.min(MAX_FLIGHT_MS, Math.max(MIN_FLIGHT_MS, decades * MS_PER_DECADE));
			const start = performance.now() + HOLD_MS;
			const step = (now: number) => {
				const t = Math.min(1, Math.max(0, (now - start) / duration));
				setZoom(ease(t) * next.rest);
				flying.current = t < 1 ? requestAnimationFrame(step) : null;
			};
			if (next.rest > 0) flying.current = requestAnimationFrame(step);
		};
		run().catch((cause: unknown) => {
			if (!dropped) setError(String(cause));
		});

		return () => {
			dropped = true;
			land();
			drawn.forEach((item) => item.remove());
		};
	}, [space, focus, key]);

	const one = focus === null ? null : rounds[focus];
	const mapped = !!one && !!bodyOf(one.truth.body)?.surface;
	// The camera has finished its way in by the time the map starts over it.
	const approach = mapped ? Math.min(1, zoom / FLAT_FROM) : zoom;
	// With no map to fly in, or a flight that failed, the flat map is the recap.
	const flown = !!space && !error;
	const flat = !mapped ? 0 : flown ? Math.max(0, (zoom - FLAT_FROM) / (1 - FLAT_FROM)) : 1;

	useEffect(() => {
		if (!space || !flight) return;
		space.frame(flight.body, flight.farKm * (flight.nearKm / flight.farKm) ** approach);
	}, [space, flight, approach]);

	// The view is the reader's to turn and to zoom with the wheel as well, and
	// the slider follows where the wheel leaves it.
	useEffect(() => {
		if (!space || !flight) return;
		space.hands(flight);
		const span = mapped ? FLAT_FROM : 1;
		return space.map.on('camera', ({ distanceKm }) => {
			if (flying.current !== null) return;
			const way = Math.log(flight.farKm / distanceKm) / Math.log(flight.farKm / flight.nearKm);
			const there = Math.min(1, Math.max(0, way)) * span;
			// Past the end of the way in, the slider is the flat map's.
			setZoom((now) => (Math.abs(Math.min(now, span) - there) < 0.004 ? now : there));
		});
	}, [space, flight, mapped]);

	// Stable, so the flat map is framed once rather than on every frame of the
	// flight.
	const placements = useMemo<Placement[]>(() => {
		const round = focus === null ? null : shown.current[focus];
		if (!round) return [];
		const on = round.guesses.filter(({ guess }) => guess.body === round.truth.body && guess.at);
		const mine = on.find((entry) => entry.mine);
		return [
			{
				truth: round.truth,
				guess: mine?.guess.at ?? null,
				avatar: mine?.avatar,
				others: on.flatMap((entry) =>
					entry.mine || !entry.avatar ? [] : [{ at: entry.guess.at!, avatar: entry.avatar }]
				)
			}
		];
	}, [focus, key]);

	return (
		<>
			{one && mapped && (
				<div
					className="recap-flat"
					style={{ opacity: flat, pointerEvents: flat > 0.6 ? 'auto' : 'none' }}
				>
					<ResultMap key={`${focus}:${one.truth.body}`} body={one.truth.body} rounds={placements} />
				</div>
			)}
			{space && !flight && !error && <div className="stage-note">finding the place…</div>}
			{error && !mapped && <div className="stage-note">{error}</div>}
			{flight && (
				<label className="zoomer glass">
					<span aria-hidden="true">−</span>
					<input
						type="range"
						min={0}
						max={1000}
						value={Math.round(zoom * 1000)}
						aria-label="Zoom"
						onPointerDown={land}
						onKeyDown={land}
						onChange={(event) => {
							land();
							setZoom(Number(event.target.value) / 1000);
						}}
					/>
					<span aria-hidden="true">+</span>
				</label>
			)}
		</>
	);
}

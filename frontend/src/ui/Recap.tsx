/**
 * Where the guesses landed, in the Solar System map: every guess pinned on the
 * body it named, seen from far enough to hold them all. The slider is the way
 * in to the place and, where the body has one, onto its own map. A round is
 * left at that distance, where its miss shows whole.
 */

import { Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Anchor, LonLat } from 'spacemap';
import { bodyOf, systemOf } from '../game/bodies';
import type { Profile } from '../game/players';
import { RAD, type Place, type Round } from '../game/rounds';
import { AU_KM } from '../game/rules';
import type { Guess } from '../game/scoring';
import type { Space } from '../game/space';
import * as m from '../paraglide/messages.js';
import { declutter } from './crowds';
import { Quit } from './Hud';
import { Legal } from './Legal';
import { ResultMap, type Placement } from './ResultMap';
import { MISS, OTHER_MISS, OWN_MISS, face, pin, pins } from './useFlatMap';

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
	/** The way out of the run, in the corner the switch between the maps
	 *  shares with it. */
	onQuit?: () => void;
}

const SUN = 'naif-10';

/** The whole run is looked at from over the Sun's pole, between these. */
const RUN_FAR_KM = 110 * AU_KM;
const RUN_NEAR_KM = 2.5 * AU_KM;

/** A camera this many times as far as two things are apart holds both. */
const HOLD = 2.4;
/** How far back a round starts when every guess is on the right body. */
const BACK_OFF = 2.6;

/** Wider than on the body's own map: a line in the scene is not snapped to
 *  the pixels, and at one of them it reads as dots. */
const MISS_WIDTH_PX = 1.5;

/** The last of the slider is the body's own map, up over the globe. A nudge
 *  wide, so a nudge back from the end is back on the globe. */
const FLAT_FROM = 0.9;

/** The flight takes this long for every tenfold of distance it covers. */
const MS_PER_DECADE = 1100;
const MIN_FLIGHT_MS = 1800;
const MAX_FLIGHT_MS = 7000;
/** Long enough to see where everything is before it starts to move. */
const HOLD_MS = 900;
/** What a click on either end of the slider moves it by, and how quickly. */
const NUDGE = 0.1;
const NUDGE_MS = 280;

interface Flight {
	body: string;
	farKm: number;
	nearKm: number;
	/** Where on the slider the flight stops by itself. */
	rest: number;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Kept this far inside the limb, where a pin is drawn edge on. */
const LIMB_DEG = 5;

/** The place midway between `points` on a body, to look down on them all from
 *  `distanceKm` off its centre; null when no one side of the body holds them. */
function middle(points: LonLat[], radiusKm: number, distanceKm: number): LonLat | null {
	const units = points.map(({ lat, lon }) => [
		Math.cos(lat * RAD) * Math.cos(lon * RAD),
		Math.cos(lat * RAD) * Math.sin(lon * RAD),
		Math.sin(lat * RAD)
	]);
	const sum = [0, 1, 2].map((axis) => units.reduce((total, unit) => total + unit[axis], 0));
	const length = Math.hypot(...sum);
	if (length < 1e-6) return null;
	const [x, y, z] = sum.map((value) => value / length);
	const near = Math.cos(Math.acos(Math.min(1, radiusKm / distanceKm)) - LIMB_DEG * RAD);
	if (units.some(([a, b, c]) => a * x + b * y + c * z < near)) return null;
	return { lat: Math.asin(z) / RAD, lon: Math.atan2(y, x) / RAD };
}

function anchorOf(body: string, at: LonLat | null) {
	return at ? { body, latitude: at.lat, longitude: at.lon } : { body };
}

/** Every body that had a part in these rounds. */
function bodiesIn(rounds: RecapRound[]): string[] {
	return rounds.flatMap(({ truth, guesses }) => [
		truth.body,
		...guesses.map((entry) => entry.guess.body)
	]);
}

export function Recap({ space, rounds, focus, onQuit }: Props) {
	/** 0 is as far as the view goes, 1 as near. */
	const [zoom, setZoom] = useState(0);
	const [flight, setFlight] = useState<Flight | null>(null);
	const [error, setError] = useState<string | null>(null);
	/** The map is drawn where the recap put it, and shown. */
	const [up, setUp] = useState(false);
	const flying = useRef<number | null>(null);
	/** Where a nudge is headed, so that clicks in quick succession add up. */
	const heading = useRef<number | null>(null);
	/** Where the slider last was on the globe, to go back to from the flat map. */
	const globe = useRef(0);
	/** Over the map: the boxes the whole run's crowded pins go into. */
	const crowded = useRef<HTMLDivElement>(null);
	// A lobby hands the same rounds over as new objects on every snapshot.
	const key = JSON.stringify(rounds);
	const shown = useRef(rounds);
	shown.current = rounds;
	// Another round starts over in the render that asks for it: an effect
	// handed the last round's flight would take the camera back from this
	// one's way there.
	const subject = `${focus}:${key}`;
	const [shownFor, setShownFor] = useState(subject);
	if (shownFor !== subject) {
		setShownFor(subject);
		setFlight(null);
		setUp(false);
		setError(null);
		setZoom(0);
	}

	const land = () => {
		if (flying.current !== null) cancelAnimationFrame(flying.current);
		flying.current = null;
		heading.current = null;
	};

	const nudge = (by: number) => {
		const to = Math.min(1, Math.max(0, (heading.current ?? zoom) + by));
		land();
		heading.current = to;
		const from = zoom;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / NUDGE_MS);
			setZoom(from + (to - from) * ease(t));
			flying.current = t < 1 ? requestAnimationFrame(step) : null;
			if (t === 1) heading.current = null;
		};
		flying.current = requestAnimationFrame(step);
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
		land();

		// A pin on the far side of its body is hidden rather than shown through
		// it: the reader can turn the body round.
		const mark = (body: string, at: LonLat | null, element: HTMLElement, under = false) =>
			drawn.push(
				map.addMarker({
					anchor: anchorOf(body, at),
					element,
					align: [0.5, under ? 0 : 0.5],
					occlude: !!at
				})
			);
		/** The dashed line of a miss, where the map knows both ends. */
		const join = (from: Anchor, to: Anchor, mine = true) => {
			const offset = map.offsetKm(from, to);
			if (!offset) return;
			drawn.push(
				map.addPolyline({
					...MISS,
					widthPx: MISS_WIDTH_PX,
					anchor: from,
					points: [[0, 0, 0], offset],
					opacity: mine ? OWN_MISS : OTHER_MISS
				})
			);
		};

		const run = async () => {
			const all = shown.current;
			const one = focus === null ? null : all[focus];
			// One map shows the whole run at the run's date. A panorama's miss was
			// measured at its own date, so its line here is not to that scale.
			const time = (one ?? all[all.length - 1]).round.time;
			await space.travel(time, one ? one.truth.body : SUN);
			if (dropped) return;
			const involved = bodiesIn(one ? [one] : all);
			space.dress(involved);
			// A guessed rock may still be streaming in, and has no line until it is.
			await space.known(involved);
			if (dropped) return;

			let next: Flight;
			if (one) {
				const { truth } = one;
				const mapped = !!bodyOf(truth.body)?.surface;
				const place = anchorOf(truth.body, mapped ? truth : null);
				let widest = 0;
				/** The places on the body itself, to be looked down on together. */
				const seen: LonLat[] = [truth];
				// From as far as another body is seen, a place on it is the body, and
				// the guesses on it share its dot: side by side, not over one another.
				const away = new Map<string, HTMLElement[]>();
				// The reader's own guess over the others', the place over them all.
				const ordered = [...one.guesses].sort((a, b) => Number(!!a.mine) - Number(!!b.mine));
				for (const { guess, avatar, mine } of ordered) {
					const there = anchorOf(guess.body, guess.at);
					// A body the map never loaded has nowhere to pin a guess.
					if (!map.offsetKm(place, there)) continue;
					const element = avatar ? face(avatar, mine) : pin('pin');
					if (guess.body !== truth.body) {
						widest = Math.max(widest, space.apart(truth.body, guess.body) ?? 0);
						join(place, there, mine);
						away.set(guess.body, [...(away.get(guess.body) ?? []), element]);
						continue;
					}
					if (guess.at && mapped) {
						seen.push(guess.at);
						drawn.push(
							map.addSurfacePolyline({
								...MISS,
								widthPx: MISS_WIDTH_PX,
								body: truth.body,
								points: [guess.at, truth],
								interpolate: 'geodesic',
								opacity: mine ? OWN_MISS : OTHER_MISS
							})
						);
					}
					mark(guess.body, guess.at, element);
				}
				for (const [body, row] of away) mark(body, null, row.length > 1 ? pins(row) : row[0]);
				mark(truth.body, mapped ? truth : null, pin('pin truth'));
				const nearKm = space.standoffKm(truth.body);
				next = {
					body: truth.body,
					nearKm,
					farKm: space.across(Math.max(widest * HOLD, nearKm * BACK_OFF)),
					rest: 0
				};
				const radius = space.radiusKm(truth.body);
				// Guesses round the far side are found by turning the body: the place
				// itself is what has to be in view.
				const over = radius ? middle(seen, radius, next.farKm) : null;
				space.frame(truth.body, next.farKm, over ?? truth);
			} else {
				let reach = 0;
				// A system is one dot from here, so its pins go side by side under
				// it rather than over one another.
				const rows = new Map<string, HTMLElement[]>();
				const stack = (body: string, element: HTMLElement) => {
					const system = systemOf(body);
					rows.set(system, [...(rows.get(system) ?? []), element]);
					reach = Math.max(reach, space.apart(SUN, system) ?? 0);
				};
				all.forEach(({ truth, guesses }, index) => {
					const label = String(index + 1);
					stack(truth.body, pin('pin truth', label));
					const own = guesses.find((entry) => entry.mine)?.guess;
					// A guess on the right body is the place's own pin from here.
					if (!own || own.body === truth.body) return;
					stack(own.body, pin('pin', label));
					// Between the dots the pins are under: two bodies of one system
					// have no line to draw at this scale.
					const [from, to] = [systemOf(truth.body), systemOf(own.body)];
					if (from !== to) join({ body: from }, { body: to });
				});
				const heaps = [...rows].map(([system, row]) => {
					const element = pins(row, true);
					mark(system, null, element, true);
					return element;
				});
				if (crowded.current) drawn.push({ remove: declutter(heaps, crowded.current) });
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
			const settled = space.drawn();
			setFlight(next);
			// Shown at rest, not on its way there.
			await settled;
			if (dropped) return;
			setUp(true);

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
	// The camera has finished its way in by the time the map is up.
	const approach = mapped ? Math.min(1, zoom / FLAT_FROM) : zoom;
	// With no map to fly in, or a flight that failed, the flat map is the recap.
	const flown = !!space && !error;
	// Up or not, never half: the two maps at once are only the way between them.
	const flat = mapped && (!flown || zoom > FLAT_FROM);
	if (zoom <= FLAT_FROM) globe.current = zoom;

	useEffect(() => {
		// The globe holds still under the flat map, to be found as it was left.
		if (!space || !flight || flat) return;
		const distanceKm = flight.farKm * (flight.nearKm / flight.farKm) ** approach;
		space.frame(flight.body, distanceKm);
	}, [space, flight, approach, flat]);

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
			setZoom((now) => (now > span || Math.abs(now - there) < 0.004 ? now : there));
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
			<div className="crowds" ref={crowded} />
			{space && !up && !error && (
				<div className="stage-note recap-veil">{m.finding_the_place()}</div>
			)}
			{one && mapped && (
				<div className={`recap-flat${flat ? ' up' : ''}`}>
					<ResultMap key={`${focus}:${one.truth.body}`} body={one.truth.body} rounds={placements} />
					<Legal />
				</div>
			)}
			{onQuit && (
				<Quit onQuit={onQuit}>
					{mapped && flown && up && (
						<div className="dims" role="group" aria-label={m.recap_view()}>
							<button
								type="button"
								aria-pressed={!flat}
								title={m.recap_globe_title()}
								onClick={() => {
									land();
									setZoom(globe.current);
								}}
							>
								{m.recap_globe()}
							</button>
							<button
								type="button"
								aria-pressed={flat}
								title={m.recap_flat_title()}
								onClick={() => {
									land();
									setZoom(1);
								}}
							>
								{m.recap_flat()}
							</button>
						</div>
					)}
				</Quit>
			)}
			{error && !mapped && <div className="stage-note">{error}</div>}
			{up && (
				<div className="zoomer glass">
					<button
						type="button"
						title={m.zoom_out()}
						aria-label={m.zoom_out()}
						disabled={zoom <= 0}
						onClick={() => nudge(-NUDGE)}
					>
						<Minus size={16} />
					</button>
					<input
						type="range"
						min={0}
						max={1000}
						value={Math.round(zoom * 1000)}
						aria-label={m.zoom()}
						onPointerDown={land}
						onKeyDown={land}
						onChange={(event) => {
							land();
							setZoom(Number(event.target.value) / 1000);
						}}
					/>
					<button
						type="button"
						title={m.zoom_in()}
						aria-label={m.zoom_in()}
						disabled={zoom >= 1}
						onClick={() => nudge(NUDGE)}
					>
						<Plus size={16} />
					</button>
				</div>
			)}
		</>
	);
}

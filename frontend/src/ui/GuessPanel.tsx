/**
 * The panel in the corner a guess is made in: down from the Solar System to a
 * body, by the map of each level or by typing the body's name, and then onto
 * the body's own map where it has one.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
	createSystemMap,
	type FlatMarker,
	type LonLat,
	type SystemMap,
	type SystemMapTarget,
	type SystemMapView
} from 'spacemap';
import { bodyOf } from '../game/bodies';
import { PICKER, ROOT, intoSystem, levelTitle, search, trailTo, type Level } from '../game/picker';
import type { Guess } from '../game/scoring';
import { pin, useFlatMap } from './useFlatMap';

interface Props {
	guess: Guess | null;
	/** Taking up the corner, rather than tucked out of the view's way. */
	open: boolean;
	headingDeg: number;
	/** The round's place is known, so a guess can be scored. */
	placed: boolean;
	onOpen: () => void;
	onPick: (guess: Guess | null) => void;
	onGuess: () => void;
	/** Said in the foot once the guess is in: the panel stops taking picks. */
	waiting?: string;
	/** Stands where the Guess button was while waiting. */
	action?: ReactNode;
}

type MapLevel = Exclude<Level, { kind: 'body' }>;

function viewOf(level: MapLevel): SystemMapView {
	if (level.kind === 'system') return { kind: 'system', id: level.id };
	if (level.kind === 'zone') return { kind: 'zone', zone: level.zone };
	return { kind: 'solar-system' };
}

/** The map of a level, and under it the same targets by name: the map draws
 *  no names, and a dot two pixels wide is no target for a thumb. */
function Chart({ level, onSelect }: { level: MapLevel; onSelect: (t: SystemMapTarget) => void }) {
	const container = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<SystemMap | null>(null);
	const [targets, setTargets] = useState<SystemMapTarget[]>([]);
	const [error, setError] = useState<string | null>(null);
	const select = useRef(onSelect);
	select.current = onSelect;
	// The map is built once, on the level it was first asked for.
	const opening = useRef(level);
	const key = JSON.stringify(level);

	useEffect(() => {
		const element = container.current;
		if (!element) return;
		let made: SystemMap | null = null;
		let dropped = false;
		createSystemMap({
			container: element,
			view: viewOf(opening.current),
			...PICKER,
			grouping: 'systems',
			zones: 'inner-outer',
			events: { select: (target) => select.current(target) }
		})
			.then((created) => {
				if (dropped) return created.remove();
				made = created;
				setMap(created);
			})
			.catch((cause: unknown) => {
				if (!dropped) setError(String(cause));
			});
		return () => {
			dropped = true;
			made?.remove();
			setMap(null);
		};
	}, []);

	useEffect(() => {
		if (!map) return;
		let dropped = false;
		map
			.setView(viewOf(JSON.parse(key) as MapLevel))
			.then(() => {
				if (!dropped) setTargets(map.getTargets());
			})
			.catch((cause: unknown) => {
				if (!dropped) setError(String(cause));
			});
		return () => {
			dropped = true;
		};
	}, [map, key]);

	return (
		<div className="chart">
			<div className="diagram" ref={container} />
			{error && <span className="note">{error}</span>}
			<div className="chips">
				{targets.map((target) => (
					<button
						type="button"
						key={target.kind === 'zone' ? target.zone : `${target.kind}:${target.id}`}
						className={`chip${target.kind === 'body' ? '' : ' deeper'}`}
						onClick={() => onSelect(target)}
					>
						{target.name}
					</button>
				))}
			</div>
		</div>
	);
}

/** A body's own map: click a place on it. */
function Surface({
	body,
	at,
	taking,
	onPick
}: {
	body: string;
	at: LonLat | null;
	taking: () => boolean;
	onPick: (at: LonLat) => void;
}) {
	const [container, map, error] = useFlatMap({
		body,
		projection: 'equirectangular',
		// The grid is what makes a bare surface readable; named features stay off
		// while the round is live.
		layers: { graticule: true, nomenclature: false }
	});
	const marker = useRef<FlatMarker | null>(null);
	const pick = useRef(onPick);
	const allowed = useRef(taking);
	pick.current = onPick;
	allowed.current = taking;

	useEffect(() => {
		if (!map) return;
		return map.on('click', (place) => place && allowed.current() && pick.current(place));
	}, [map]);

	useEffect(() => {
		if (!map) return;
		if (!at) {
			marker.current?.remove();
			marker.current = null;
		} else if (marker.current) marker.current.setPosition(at);
		else marker.current = map.addMarker({ at, element: pin('pin'), align: [0.5, 0.5] });
	}, [map, at]);

	return (
		<>
			<div className="flat" ref={container} />
			{error && <div className="whole">no map — pick another body</div>}
		</>
	);
}

export function GuessPanel({
	guess,
	open,
	headingDeg,
	placed,
	onOpen,
	onPick,
	onGuess,
	waiting,
	action
}: Props) {
	const [trail, setTrail] = useState<Level[]>(ROOT);
	const [query, setQuery] = useState('');
	const level = trail[trail.length - 1];
	const locked = waiting !== undefined;
	/** Whether the panel was already open when the gesture began: the tap that
	 *  opens it also lands as a click, on a box that has grown since, and a
	 *  pick from it would be nowhere the reader aimed. */
	const taking = useRef(open);
	const live = () => taking.current && !locked;

	const go = (next: Level[]) => {
		if (locked) return;
		setTrail(next);
		setQuery('');
		const last = next[next.length - 1];
		// Being on a body's level is already a guess at the body; its map, where
		// it has one, adds the place.
		onPick(last.kind === 'body' ? { body: last.id, at: null } : null);
	};

	const select = (target: SystemMapTarget) => {
		if (!live()) return;
		if (target.kind === 'zone') go([...trail, { kind: 'zone', zone: target.zone }]);
		else if (target.kind === 'system') go(intoSystem(trail, target.id));
		else go([...trail, { kind: 'body', id: target.id }]);
	};

	const hits = search(query);
	const info = level.kind === 'body' ? bodyOf(level.id) : undefined;
	const complete = !!guess && (!info?.surface || !!guess.at);
	const hint =
		level.kind !== 'body'
			? 'pick where you are'
			: info?.surface
				? guess?.at
					? `heading ${String(Math.round(headingDeg) % 360).padStart(3, '0')}°`
					: 'now pick the place'
				: 'no map of this one: the body is the guess';

	return (
		<div
			className={`mapw${open ? ' wide' : ''}`}
			onPointerEnter={onOpen}
			onPointerDown={() => {
				taking.current = open;
				onOpen();
			}}
			onFocusCapture={onOpen}
		>
			<div className="head">
				{trail.length > 1 && (
					<button
						type="button"
						className="btn ghost ico"
						title="Back"
						aria-label="Back"
						disabled={locked}
						onClick={() => go(trail.slice(0, -1))}
					>
						←
					</button>
				)}
				<span className="where">{levelTitle(level)}</span>
				<div className="find">
					<input
						type="search"
						value={query}
						placeholder="search a body"
						aria-label="Search a body"
						disabled={locked}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && hits[0]) go(trailTo(hits[0].id));
							if (event.key === 'Escape') setQuery('');
						}}
					/>
					{query.trim() !== '' && (
						<div className="hits glass">
							{hits.map((hit) => (
								<button type="button" key={hit.id} onClick={() => go(trailTo(hit.id))}>
									{hit.name}
									<span className="mono dim">{levelTitle(trailTo(hit.id).at(-2) ?? ROOT[0])}</span>
								</button>
							))}
							{hits.length === 0 && <span className="note">nothing by that name is in play</span>}
						</div>
					)}
				</div>
			</div>
			<div className="surface">
				{level.kind !== 'body' ? (
					<Chart level={level} onSelect={select} />
				) : info?.surface ? (
					<Surface
						key={level.id}
						body={level.id}
						at={guess?.body === level.id ? guess.at : null}
						taking={live}
						onPick={(at) => onPick({ body: level.id, at })}
					/>
				) : (
					<div className="whole">
						<b>{levelTitle(level)}</b>
					</div>
				)}
			</div>
			<div className="foot">
				<span className="mono mut" style={{ fontSize: '11.5px' }}>
					{waiting ?? hint}
				</span>
				{waiting === undefined ? (
					<button
						type="button"
						className="btn"
						style={{ marginLeft: 'auto', width: 120 }}
						disabled={!placed || !complete}
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

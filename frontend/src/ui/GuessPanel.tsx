/**
 * The panel in the corner a guess is made in: down from the Solar System to a
 * body, by the map of each level or by typing the body's name, and then onto
 * the body's own map where it has one.
 */

import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import {
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type SyntheticEvent
} from 'react';
import {
	createSystemMap,
	type FlatMarker,
	type LonLat,
	type SystemMap,
	type SystemMapTarget,
	type SystemMapView
} from 'spacemap';
import { bodyName, bodyOf } from '../game/bodies';
import { HOST } from '../game/host';
import { PICKER, ROOT, intoSystem, levelTitle, search, trailTo, type Level } from '../game/picker';
import type { Guess } from '../game/scoring';
import type { Highlight } from '../game/tutorial';
import * as m from '../paraglide/messages.js';
import { ToolSlot } from './tools';
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
	/** The part a tip is about, ringed. */
	highlight?: Highlight | null;
	/** A tip about the panel, beside it. */
	tip?: ReactNode;
	/** A tip about the view's own controls, over them. */
	toolsTip?: ReactNode;
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
			...HOST,
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
						className="chip"
						onClick={() => onSelect(target)}
					>
						{target.name}
						{target.kind !== 'body' && <ChevronRight className="deeper" size={12} />}
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
			return;
		}
		if (marker.current) marker.current.setPosition(at);
		else marker.current = map.addMarker({ at, element: pin('pin'), align: [0.5, 0.5] });
		// A clicked place is in the frame already; a typed one may not be.
		const spot = map.project(at.lon, at.lat);
		const frame = container.current;
		const seen =
			spot &&
			frame &&
			spot[0] >= 0 &&
			spot[1] >= 0 &&
			spot[0] <= frame.clientWidth &&
			spot[1] <= frame.clientHeight;
		if (!seen) map.setView({ centerLon: at.lon, centerLat: at.lat });
	}, [map, at]);

	return (
		<>
			<div className="flat" ref={container} />
			{error && <div className="whole">{m.guess_no_map()}</div>}
		</>
	);
}

const AXES = [
	{ axis: 'lat', limit: 90, short: m.latitude_short, name: m.latitude },
	// Longitudes are written 0 to 360 east as often as either side of zero.
	{ axis: 'lon', limit: 360, short: m.longitude_short, name: m.longitude }
] as const;

type Typed = Record<(typeof AXES)[number]['axis'], string>;

/** What was typed, in degrees, with either decimal mark: null when it is not
 *  a number, or is past `limit`. */
function degrees(text: string, limit: number): number | null {
	if (!/^[+-]?(\d+[.,]?\d*|[.,]\d+)$/.test(text.trim())) return null;
	const value = Number(text.trim().replace(',', '.'));
	return Math.abs(value) <= limit ? value : null;
}

function written(at: LonLat | null): Typed {
	return at ? { lat: at.lat.toFixed(4), lon: at.lon.toFixed(4) } : { lat: '', lon: '' };
}

/** The place as two numbers: read off the map, or typed onto it. */
function Coordinates({
	at,
	disabled,
	onPick
}: {
	at: LonLat | null;
	disabled: boolean;
	onPick: (at: LonLat) => void;
}) {
	// What is typed stands as typed, so half a number is not rewritten under
	// the reader; a place from anywhere else is written out.
	const [entry, setEntry] = useState({ text: written(at), of: at });
	if (at !== entry.of) setEntry({ text: written(at), of: at });

	const type = (text: Typed) => {
		const [lat, lon] = AXES.map(({ axis, limit }) => degrees(text[axis], limit));
		if (lat === null || lon === null) return setEntry({ text, of: entry.of });
		const place = { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
		setEntry({ text, of: place });
		onPick(place);
	};

	return (
		<div className="at">
			{AXES.map(({ axis, limit, short, name }) => (
				<label key={axis}>
					<span className="mono dim">{short()}</span>
					<input
						type="text"
						value={entry.text[axis]}
						aria-label={name()}
						aria-invalid={
							entry.text[axis].trim() !== '' && degrees(entry.text[axis], limit) === null
						}
						autoComplete="off"
						spellCheck={false}
						disabled={disabled}
						onChange={(event) => type({ ...entry.text, [axis]: event.target.value })}
						onBlur={() => at && setEntry({ text: written(at), of: at })}
					/>
				</label>
			))}
		</div>
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
	action,
	highlight,
	tip,
	toolsTip
}: Props) {
	const [trail, setTrail] = useState<Level[]>(ROOT);
	const [query, setQuery] = useState('');
	/** Extra large, and kept so until it is given back: turning to the view
	 *  does not tuck it away. */
	const [maximized, setMaximized] = useState(false);
	const wide = open || maximized;
	const { setSlot } = useContext(ToolSlot);
	const level = trail[trail.length - 1];
	const locked = waiting !== undefined;
	const ring = (part: Highlight) => (highlight === part ? ' ringed' : '');
	// The tip only hangs off the panel: reaching for it is not turning to it.
	const turned = (event: SyntheticEvent) => !(event.target as Element).closest('.tip');
	/** Whether the panel was already open when the gesture began: the tap that
	 *  opens it also lands as a click, on a box that has grown since, and a
	 *  pick from it would be nowhere the reader aimed. A key is pressed on what
	 *  already has the focus, which opened the panel on arriving. */
	const taking = useRef(wide);
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
	const body = level.kind === 'body' ? level.id : null;
	const at = guess && guess.body === body ? guess.at : null;
	const place = (picked: LonLat) => body && onPick({ body, at: picked });
	const hint = !body
		? ''
		: !info?.surface
			? m.guess_whole_body()
			: at
				? m.guess_heading({ degrees: String(Math.round(headingDeg) % 360).padStart(3, '0') })
				: '';

	return (
		<div
			className={`mapw${wide ? ' wide' : ''}${maximized ? ' max' : ''}${info?.surface ? '' : ' placeless'}${ring('panel')}`}
			onPointerEnter={(event) => turned(event) && onOpen()}
			onPointerDown={(event) => {
				if (!turned(event)) return;
				taking.current = wide;
				onOpen();
			}}
			onKeyDownCapture={() => (taking.current = true)}
			onFocusCapture={(event) => turned(event) && onOpen()}
		>
			<div className={`tools${ring('tools')}`}>
				<div ref={setSlot} />
				{toolsTip}
			</div>
			{tip}
			<div className="head">
				{trail.length > 1 && (
					<button
						type="button"
						className="btn ghost ico"
						title={m.back()}
						aria-label={m.back()}
						disabled={locked}
						onClick={() => go(trail.slice(0, -1))}
					>
						<ChevronLeft size={16} />
					</button>
				)}
				<span className="where">{levelTitle(level)}</span>
				<div className="find">
					<input
						type="search"
						value={query}
						placeholder={m.search()}
						aria-label={m.search_a_body()}
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
									{bodyName(hit.id)}
									<span className="mono dim">{levelTitle(trailTo(hit.id).at(-2) ?? ROOT[0])}</span>
								</button>
							))}
							{hits.length === 0 && <span className="note">{m.search_no_hits()}</span>}
						</div>
					)}
				</div>
			</div>
			<div className={`surface${ring('surface')}`}>
				{level.kind !== 'body' ? (
					<Chart level={level} onSelect={select} />
				) : info?.surface ? (
					<Surface key={level.id} body={level.id} at={at} taking={live} onPick={place} />
				) : (
					<div className="whole">
						<b>{levelTitle(level)}</b>
					</div>
				)}
			</div>
			<div className="foot">
				{info?.surface && <Coordinates key={body} at={at} disabled={locked} onPick={place} />}
				<span className="mono mut" style={{ flex: 1, fontSize: '12.5px' }}>
					{waiting ?? hint}
				</span>
				{waiting === undefined ? (
					<button
						type="button"
						className={`btn${ring('guess')}`}
						style={{ width: 120 }}
						disabled={!placed || !complete}
						onClick={onGuess}
					>
						{m.guess()}
					</button>
				) : (
					action
				)}
				<button
					type="button"
					className="btn ghost ico"
					title={maximized ? m.minimize() : m.maximize()}
					aria-label={maximized ? m.minimize() : m.maximize()}
					onClick={() => setMaximized(!maximized)}
				>
					{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
				</button>
			</div>
		</div>
	);
}

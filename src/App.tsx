import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { fetchPanoramas, type LonLat, type PanoramaEntry } from 'spacemap';
import {
	MARS,
	QUICK_PLAY,
	distanceKm,
	drawRounds,
	extentKm,
	playable,
	scoreFor
} from './game/rules';
import type { RunSettings } from './game/rules';
import { INITIAL, reduce } from './game/run';
import { CustomSetup } from './ui/CustomSetup';
import { FinalScore } from './ui/FinalScore';
import { GuessMap } from './ui/GuessMap';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Panorama } from './ui/Panorama';
import { RoundResult } from './ui/RoundResult';

const BODY = MARS;

export default function App() {
	const [run, dispatch] = useReducer(reduce, INITIAL);
	const [pool, setPool] = useState<PanoramaEntry[] | null>(null);
	const [poolError, setPoolError] = useState<string | null>(null);
	const [guess, setGuess] = useState<LonLat | null>(null);
	const [heading, setHeading] = useState(0);
	const [left, setLeft] = useState<number | null>(null);
	const radiusKm = useRef<number | null>(null);

	// The body's panoramas, once: a round is drawn from them rather than from
	// whichever one a view happens to open on.
	useEffect(() => {
		fetchPanoramas(BODY)
			.then((entries) => setPool(playable(entries)))
			.catch((cause: unknown) => setPoolError(String(cause)));
	}, []);

	const start = useCallback(
		(settings: RunSettings) => {
			if (!pool) return;
			setGuess(null);
			dispatch({ kind: 'start', settings, drawn: drawRounds(pool, settings.rounds) });
		},
		[pool]
	);

	const entry = run.drawn[run.round];
	const truth = run.standing ?? entry ?? null;

	const commit = useCallback(
		(at: LonLat | null, timedOut: boolean) => {
			const radius = radiusKm.current;
			if (!truth || !radius || !pool) return;
			const km = at ? distanceKm(at, truth, radius) : 0;
			const scale = extentKm(pool, radius);
			dispatch({
				kind: 'commit',
				played: {
					truth,
					guess: at,
					distanceKm: km,
					points: at ? scoreFor(km, scale) : 0,
					timedOut
				}
			});
		},
		[truth, pool]
	);

	// The round's clock. It reads the guess through a ref so that picking a
	// point does not restart it.
	const pending = useRef<LonLat | null>(null);
	pending.current = guess;
	const timed = run.phase === 'playing' && run.settings.timer > 0;
	useEffect(() => {
		if (!timed) return setLeft(null);
		const ends = Date.now() + run.settings.timer * 1000;
		setLeft(run.settings.timer);
		const tick = setInterval(() => {
			const remaining = (ends - Date.now()) / 1000;
			setLeft(Math.max(0, remaining));
			if (remaining <= 0) {
				clearInterval(tick);
				commit(pending.current, true);
			}
		}, 200);
		return () => clearInterval(tick);
	}, [timed, run.settings.timer, run.round, commit]);

	const next = useCallback(() => {
		setGuess(null);
		dispatch({ kind: 'next' });
	}, []);

	const last = run.played[run.played.length - 1];
	const showPanorama = run.phase === 'playing' || run.phase === 'result';
	const at = useMemo(() => entry?.id, [entry]);

	return (
		<>
			{showPanorama && at && (
				<Panorama
					body={BODY}
					at={at}
					movement={run.settings.movement}
					onPlace={(placed) => dispatch({ kind: 'stand', entry: placed })}
					onHeading={setHeading}
				/>
			)}

			{run.phase === 'playing' && (
				<div className="hud">
					<Hud
						settings={run.settings}
						round={run.round}
						left={left}
						onQuit={() => dispatch({ kind: 'home' })}
					/>
					<GuessMap
						body={BODY}
						guess={guess}
						headingDeg={heading}
						onPick={setGuess}
						onReady={(km) => (radiusKm.current = km)}
						onGuess={() => commit(guess, false)}
					/>
				</div>
			)}

			{run.phase === 'home' && (
				<Home
					ready={!!pool?.length}
					onQuickPlay={() => start(QUICK_PLAY)}
					onCustom={() => dispatch({ kind: 'setup' })}
				/>
			)}

			{run.phase === 'setup' && (
				<CustomSetup
					ready={!!pool?.length}
					onStart={start}
					onBack={() => dispatch({ kind: 'home' })}
				/>
			)}

			{run.phase === 'result' && last && (
				<RoundResult
					body={BODY}
					truth={last.truth}
					guess={last.guess}
					distanceKm={last.distanceKm}
					points={last.points}
					round={run.round + 1}
					rounds={run.settings.rounds}
					timedOut={last.timedOut}
					onNext={next}
				/>
			)}

			{run.phase === 'final' && (
				<FinalScore
					played={run.played}
					onAgain={() => start(run.settings)}
					onHome={() => dispatch({ kind: 'home' })}
				/>
			)}

			{poolError && run.phase === 'home' && (
				<div className="stage-note" style={{ alignItems: 'end', paddingBottom: 24 }}>
					{poolError}
				</div>
			)}
		</>
	);
}

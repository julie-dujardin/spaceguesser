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
	/** The panorama behind the home screen, which is also the run's first
	 *  round: what the reader is looking at is what they are about to guess. */
	const [opener, setOpener] = useState<PanoramaEntry | null>(null);
	const [guess, setGuess] = useState<LonLat | null>(null);
	/** The guess map takes the corner while the reader is working on it, and
	 *  gives it back when they turn to the panorama again. */
	const [mapOpen, setMapOpen] = useState(false);
	const [heading, setHeading] = useState(0);
	const [left, setLeft] = useState<number | null>(null);
	const radiusKm = useRef<number | null>(null);
	// Read when a guess lands, so committing does not depend on the tick.
	const remaining = useRef<number | null>(null);
	remaining.current = left;

	// The body's panoramas, once: a round is drawn from them rather than from
	// whichever one a view happens to open on.
	useEffect(() => {
		fetchPanoramas(BODY)
			.then((entries) => {
				const usable = playable(entries);
				setPool(usable);
				setOpener(drawRounds(usable, 1)[0] ?? null);
			})
			.catch((cause: unknown) => setPoolError(String(cause)));
	}, []);

	const start = useCallback(
		(settings: RunSettings) => {
			if (!pool || !opener) return;
			setGuess(null);
			setMapOpen(false);
			const drawn = [opener, ...drawRounds(pool, settings.rounds - 1, [opener])];
			dispatch({ kind: 'start', settings, drawn });
			// The opener is spent: draw the next one now, so leaving the run finds a
			// place it has not already used. Moving between menus leaves it alone.
			setOpener(drawRounds(pool, 1, drawn)[0] ?? opener);
		},
		[pool, opener]
	);

	const entry = run.drawn[run.round];
	const truth = run.standing ?? entry ?? null;

	const commit = useCallback(
		(at: LonLat | null, timedOut: boolean) => {
			if (!truth || !pool) return;
			const radius = radiusKm.current;
			// A point can only be scored against a body whose size the map has
			// reported. It always has by the time one can be clicked, but a round
			// can run out before that, and it has to close anyway.
			const km = at && radius ? distanceKm(at, truth, radius) : 0;
			dispatch({
				kind: 'commit',
				played: {
					truth,
					guess: radius ? at : null,
					distanceKm: km,
					points: at && radius ? scoreFor(km, extentKm(pool, radius)) : 0,
					secondsLeft: run.settings.timer > 0 ? (timedOut ? 0 : (remaining.current ?? 0)) : null,
					timedOut
				}
			});
		},
		[truth, pool, run.settings.timer]
	);

	// The round's clock. It reads the guess and the round's ending through refs,
	// so that neither picking a point nor walking to another panorama — both of
	// which are ordinary moves mid-round — hands it a fresh minute.
	const pending = useRef<LonLat | null>(null);
	pending.current = guess;
	const close = useRef(commit);
	close.current = commit;
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
				close.current(pending.current, true);
			}
		}, 200);
		return () => clearInterval(tick);
	}, [timed, run.settings.timer, run.round]);

	const next = useCallback(() => {
		setGuess(null);
		setMapOpen(false);
		dispatch({ kind: 'next' });
	}, []);

	const last = run.played[run.played.length - 1];
	// The home and setup screens sit over the opener; the final tally does not,
	// so the run ends on its own card rather than on a place already guessed.
	const standing = run.phase === 'final' ? null : (entry ?? opener);
	const at = useMemo(() => standing?.id, [standing]);

	return (
		<>
			{at && (
				<Panorama
					body={BODY}
					at={at}
					movement={run.settings.movement}
					onPlace={(placed) => dispatch({ kind: 'stand', entry: placed })}
					onHeading={setHeading}
					onEngage={() => setMapOpen(false)}
					dimmed={run.phase === 'home' || run.phase === 'setup'}
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
						open={mapOpen}
						headingDeg={heading}
						onOpen={() => setMapOpen(true)}
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
					secondsLeft={last.secondsLeft}
					round={run.round + 1}
					rounds={run.settings.rounds}
					timedOut={last.timedOut}
					onNext={next}
				/>
			)}

			{run.phase === 'final' && (
				<FinalScore
					body={BODY}
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

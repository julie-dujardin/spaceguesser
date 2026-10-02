import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { fetchPanoramas, type LonLat, type PanoramaEntry } from 'spacemap';
import { inviteCode, invitePath, settingsOf } from './game/lobby';
import { keepProfile } from './game/players';
import { MARS, QUICK_PLAY, drawRounds, playable } from './game/rules';
import type { RunSettings } from './game/rules';
import { INITIAL, play, reduce } from './game/run';
import { MULTIPLAYER, useLobby } from './game/useLobby';
import { CustomSetup } from './ui/CustomSetup';
import { FinalScore } from './ui/FinalScore';
import { Friends } from './ui/Friends';
import { GuessMap } from './ui/GuessMap';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Panorama } from './ui/Panorama';
import { Party } from './ui/Party';
import { ProfileSetup } from './ui/ProfileSetup';
import { RoundResult } from './ui/RoundResult';

const BODY = MARS;

/** The way into a multiplayer game, a card at a time. Null is the home screen. */
type Door =
	| { at: 'friends' }
	| { at: 'rules' }
	/** Picking a face, to open a run with these rules or to join the one at `code`. */
	| { at: 'profile'; settings: RunSettings; code?: undefined }
	| { at: 'profile'; code: string }
	| null;

/** Read once: the page is opened on an invite or it is not. */
const INVITE = MULTIPLAYER ? inviteCode(location.pathname) : null;

export default function App() {
	const [run, dispatch] = useReducer(reduce, INITIAL);
	const party = useLobby(INVITE);
	const [door, setDoor] = useState<Door>(INVITE ? { at: 'profile', code: INVITE } : null);
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
			const secondsLeft = run.settings.timer > 0 ? (timedOut ? 0 : (remaining.current ?? 0)) : null;
			dispatch({
				kind: 'commit',
				played: play(at, truth, pool, radiusKm.current, secondsLeft, timedOut)
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

	const { lobby } = party;
	// A seat taken ends whatever else was on screen, and the address becomes the
	// invite, so the bar can be copied as one and a reload lands back here.
	const code = lobby?.code;
	useEffect(() => {
		if (!code) return;
		setDoor(null);
		setMapOpen(false);
		dispatch({ kind: 'home' });
		history.replaceState(null, '', invitePath(code));
		return () => history.replaceState(null, '', '/');
	}, [code]);

	const enter = (next: Door) => {
		party.forget();
		if (!next && !code) history.replaceState(null, '', '/');
		setDoor(next);
	};

	const last = run.played[run.played.length - 1];
	// The home and setup screens sit over the opener, and so does a lobby; the
	// final tally does not, so a run ends on its own card rather than on a place
	// already guessed.
	const standing = lobby
		? (lobby.round?.entry ?? (lobby.phase === 'final' ? null : opener))
		: run.phase === 'final'
			? null
			: (entry ?? opener);
	const at = useMemo(() => standing?.id, [standing]);
	const solo = !lobby && !door;
	// A seat kept from before is being taken back: nothing else to do yet.
	const returning = solo && party.status === 'connecting';

	return (
		<>
			{at && (
				<Panorama
					body={BODY}
					at={at}
					movement={lobby ? settingsOf(lobby.settings).movement : run.settings.movement}
					onPlace={(placed) => {
						// A multiplayer round is scored where it opened, for everyone.
						if (!lobby) dispatch({ kind: 'stand', entry: placed });
					}}
					onHeading={setHeading}
					onEngage={() => setMapOpen(false)}
					dimmed={lobby ? lobby.phase === 'lobby' : run.phase === 'home' || run.phase === 'setup'}
				/>
			)}

			{lobby && (
				<Party
					body={BODY}
					session={party}
					lobby={lobby}
					pool={pool}
					opener={opener}
					heading={heading}
					mapOpen={mapOpen}
					onMapOpen={setMapOpen}
				/>
			)}

			{door?.at === 'friends' && (
				<Friends
					onCreate={() => enter({ at: 'rules' })}
					onJoin={(code) => enter({ at: 'profile', code })}
					onBack={() => enter(null)}
				/>
			)}

			{door?.at === 'rules' && (
				<CustomSetup
					title="Create run"
					ready
					onBack={() => enter({ at: 'friends' })}
					actions={[
						{ label: 'Create lobby', go: (settings) => enter({ at: 'profile', settings }) }
					]}
				/>
			)}

			{door?.at === 'profile' && (
				<ProfileSetup
					code={door.code}
					busy={party.status === 'connecting'}
					trouble={party.trouble}
					onBack={() => enter(INVITE && door.code === INVITE ? null : { at: 'friends' })}
					onGo={(profile) => {
						keepProfile(profile);
						if (door.code === undefined) party.create(profile, door.settings);
						else party.join(door.code, profile);
					}}
				/>
			)}

			{returning && (
				<div className="scrim">
					<div className="card glass panel" style={{ width: 320 }}>
						<h2>Rejoining your run…</h2>
						<div className="acts">
							<button type="button" className="btn ghost" onClick={party.leave}>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}

			{solo && run.phase === 'playing' && (
				<div className="hud">
					<Hud
						settings={run.settings}
						round={run.round}
						rounds={run.drawn.length}
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

			{solo && !returning && run.phase === 'home' && (
				<Home
					ready={!!pool?.length}
					onQuickPlay={() => start(QUICK_PLAY)}
					onCustom={() => dispatch({ kind: 'setup' })}
					onFriends={MULTIPLAYER ? () => enter({ at: 'friends' }) : undefined}
					notice={party.trouble === 'gone' && 'that run ended while you were away'}
				/>
			)}

			{solo && run.phase === 'setup' && (
				<CustomSetup
					title="Custom run"
					ready={!!pool?.length}
					onBack={() => dispatch({ kind: 'home' })}
					actions={[
						{ label: 'Start solo', plays: true, go: start },
						...(MULTIPLAYER
							? [
									{
										label: 'Create lobby',
										ghost: true,
										go: (settings: RunSettings) => enter({ at: 'profile', settings })
									}
								]
							: [])
					]}
				/>
			)}

			{solo && run.phase === 'result' && last && (
				<RoundResult
					body={BODY}
					truth={last.truth}
					guess={last.guess}
					distanceKm={last.distanceKm}
					points={last.points}
					secondsLeft={last.secondsLeft}
					round={run.round + 1}
					rounds={run.drawn.length}
					timedOut={last.timedOut}
					onNext={next}
				/>
			)}

			{solo && run.phase === 'final' && (
				<FinalScore
					body={BODY}
					played={run.played}
					onAgain={() => start(run.settings)}
					onHome={() => dispatch({ kind: 'home' })}
				/>
			)}

			{poolError && solo && run.phase === 'home' && (
				<div className="stage-note" style={{ alignItems: 'end', paddingBottom: 24 }}>
					{poolError}
				</div>
			)}
		</>
	);
}

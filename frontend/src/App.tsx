import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { fetchPanoramaIndex, fetchPanoramas } from 'spacemap';
import { bodyOf } from './game/bodies';
import { inviteCode, invitePath, settingsOf } from './game/lobby';
import { keepProfile } from './game/players';
import { drawRun, type Modes, type Place, type Round, type Stop } from './game/rounds';
import { QUICK_PLAY, playable } from './game/rules';
import type { RunSettings } from './game/rules';
import { INITIAL, play, reduce } from './game/run';
import { NO_SKY, type Guess } from './game/scoring';
import { MULTIPLAYER, useLobby } from './game/useLobby';
import { CustomSetup } from './ui/CustomSetup';
import { FinalScore } from './ui/FinalScore';
import { Friends } from './ui/Friends';
import { GuessPanel } from './ui/GuessPanel';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Orbit } from './ui/Orbit';
import { Panorama } from './ui/Panorama';
import { Party } from './ui/Party';
import { ProfileSetup } from './ui/ProfileSetup';
import { RoundResult } from './ui/RoundResult';
import { useSpace } from './ui/useSpace';

/** Earth has panoramas of its own in the export, and is not in play. */
const NO_GROUND = new Set(['naif-399']);

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

/** Every playable stop on every body that has any. */
async function fetchStops(): Promise<Stop[]> {
	const bodies = (await fetchPanoramaIndex()).filter((body) => !NO_GROUND.has(body.id));
	const lists = await Promise.all(
		bodies.map(async ({ id }) =>
			(await fetchPanoramas(id)).filter(playable).map((entry) => ({ body: id, entry }))
		)
	);
	return lists.flat();
}

export default function App() {
	const [run, dispatch] = useReducer(reduce, INITIAL);
	const party = useLobby(INVITE);
	const [mapContainer, space, spaceError] = useSpace();
	const [door, setDoor] = useState<Door>(INVITE ? { at: 'profile', code: INVITE } : null);
	const [stops, setStops] = useState<Stop[] | null>(null);
	const [stopsError, setStopsError] = useState<string | null>(null);
	/** The round behind the home screen, which is also the run's first: what
	 *  the reader is looking at is what they are about to guess. */
	const [opener, setOpener] = useState<Round | null>(null);
	/** Where an orbit round turned out to be, which the sky says once the map
	 *  is there. */
	const [over, setOver] = useState<Place | null>(null);
	const [guess, setGuess] = useState<Guess | null>(null);
	/** A guess is in and the sky is being asked how far off it was. */
	const [measuring, setMeasuring] = useState(false);
	/** The guess panel takes the corner while the reader is working on it, and
	 *  gives it back when they turn to the view again. */
	const [mapOpen, setMapOpen] = useState(false);
	const [heading, setHeading] = useState(0);
	const [left, setLeft] = useState<number | null>(null);
	// Read when a guess lands, so committing does not depend on the tick.
	const remaining = useRef<number | null>(null);
	remaining.current = left;

	// A run with no map to fly in is walked, whatever its settings say.
	const canOrbit = !spaceError;
	const modesFor = useCallback(
		(asked: Modes): Modes => ({
			ground: asked.ground || !canOrbit,
			orbit: asked.orbit && canOrbit
		}),
		[canOrbit]
	);

	// The stops, once: a round is drawn from them rather than from whichever
	// one a view happens to open on. Without them the game is flown.
	useEffect(() => {
		fetchStops()
			.then(setStops)
			.catch((cause: unknown) => {
				setStopsError(String(cause));
				setStops([]);
			});
	}, []);

	const ready = !!stops && (stops.length > 0 || canOrbit);
	useEffect(() => {
		if (!stops || !ready || opener) return;
		setOpener(drawRun(stops, 1, modesFor(QUICK_PLAY.modes))[0] ?? null);
	}, [stops, ready, opener, modesFor]);
	// An orbit opener with no map to show it in gives way to a stop.
	useEffect(() => {
		if (!canOrbit && opener?.mode === 'orbit') setOpener(null);
	}, [canOrbit, opener]);

	const start = useCallback(
		(settings: RunSettings) => {
			if (!stops || !opener) return;
			setGuess(null);
			setMapOpen(false);
			const modes = modesFor(settings.modes);
			// The opener is the first round only when the run plays its kind.
			const first = modes[opener.mode] ? [opener] : [];
			const drawn = [...first, ...drawRun(stops, settings.rounds - first.length, modes, first)];
			dispatch({ kind: 'start', settings, drawn });
			// The opener is spent: draw the next one now, so leaving the run finds a
			// place it has not already used. Moving between menus leaves it alone.
			setOpener(drawRun(stops, 1, modesFor(QUICK_PLAY.modes), drawn)[0] ?? opener);
		},
		[stops, opener, modesFor]
	);

	const { lobby } = party;
	const last = run.played[run.played.length - 1];
	const round = run.drawn[run.round];
	// The home and setup screens sit over the opener, and so does a lobby; the
	// final tally does not, so a run ends on its own card rather than on a place
	// already guessed.
	// A recap takes the stage for itself: the map under it is what it shows.
	const recap = lobby
		? lobby.phase === 'result' || lobby.phase === 'final'
		: run.phase === 'result' || run.phase === 'final';
	const shown: Round | null = recap
		? null
		: lobby
			? (lobby.round?.entry ?? opener)
			: (round ?? opener);
	const shownKey = shown && `${shown.mode}:${shown.body}:${shown.time}`;
	useEffect(() => setOver(null), [shownKey]);

	// Where the round is. On the ground that is the panorama, or the one the
	// reader walked to; from orbit it is wherever the sky put the camera.
	const truth = useMemo<Place | null>(() => {
		if (!shown) return null;
		if (shown.mode === 'orbit') return over;
		const stood = !lobby && run.standing ? run.standing : shown.entry;
		return { body: shown.body, lat: stood.lat, lon: stood.lon };
	}, [shown, over, lobby, run.standing]);

	// The map draws nothing while a panorama is over it.
	const flown = recap || shown?.mode === 'orbit';
	useEffect(() => space?.cover(!flown), [space, flown]);

	const committing = useRef(false);
	const current = useRef(round);
	current.current = round;
	const commit = useCallback(
		async (guessed: Guess | null, timedOut: boolean) => {
			if (!truth || !round || committing.current) return;
			committing.current = true;
			const secondsLeft = run.settings.timer > 0 ? (timedOut ? 0 : (remaining.current ?? 0)) : null;
			setMeasuring(true);
			// Only a guess on another body needs the sky; the map is asked nothing
			// for one on the right body.
			const sky = space ? await space.measure(round, truth, guessed?.body ?? null) : NO_SKY;
			setMeasuring(false);
			committing.current = false;
			// The run was left, or started over, while the sky was read.
			if (current.current !== round) return;
			const radius = bodyOf(truth.body)?.radiusKm ?? null;
			// The card describes the stop the guess is scored against.
			const stood =
				round.mode === 'ground' && run.standing ? { ...round, entry: run.standing } : round;
			dispatch({
				kind: 'commit',
				played: play(stood, truth, guessed, sky, radius, secondsLeft, timedOut)
			});
		},
		[truth, round, run.standing, run.settings.timer, space]
	);

	// The round's clock. It reads the guess and the round's ending through refs,
	// so that neither picking a point nor walking to another panorama — both of
	// which are ordinary moves mid-round — hands it a fresh minute. It waits for
	// the place: an orbit round has not begun until the camera is over it.
	const pending = useRef<Guess | null>(null);
	pending.current = guess;
	const close = useRef(commit);
	close.current = commit;
	const timed = run.phase === 'playing' && run.settings.timer > 0 && !!truth;
	useEffect(() => {
		if (!timed) return setLeft(null);
		const ends = Date.now() + run.settings.timer * 1000;
		setLeft(run.settings.timer);
		const tick = setInterval(() => {
			const remaining = (ends - Date.now()) / 1000;
			setLeft(Math.max(0, remaining));
			if (remaining <= 0) {
				clearInterval(tick);
				void close.current(pending.current, true);
			}
		}, 200);
		return () => clearInterval(tick);
	}, [timed, run.settings.timer, run.round]);

	// An orbit round the map cannot reach is swapped for another, wherever a
	// swap is this browser's to make: a lobby's rounds are the host's.
	const redraw = () => {
		if (!stops || lobby || shown?.mode !== 'orbit') return;
		const modes = modesFor(run.phase === 'playing' ? run.settings.modes : QUICK_PLAY.modes);
		const [fresh] = drawRun(stops, 1, modes, [...run.drawn, shown]);
		if (!fresh) return;
		if (run.phase === 'playing') dispatch({ kind: 'redraw', round: fresh });
		else setOpener(fresh);
	};

	const next = useCallback(() => {
		setGuess(null);
		setMapOpen(false);
		dispatch({ kind: 'next' });
	}, []);

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

	const solo = !lobby && !door;
	// A seat kept from before is being taken back: nothing else to do yet.
	const returning = solo && party.status === 'connecting';
	const movement = lobby ? settingsOf(lobby.settings).movement : run.settings.movement;
	const dimmed = lobby ? lobby.phase === 'lobby' : run.phase === 'home' || run.phase === 'setup';

	return (
		<>
			<div className="stage" ref={mapContainer} />

			{shown?.mode === 'ground' && (
				<Panorama
					body={shown.body}
					at={shown.entry.id}
					movement={movement}
					onPlace={(placed) => {
						// A multiplayer round is scored where it opened, for everyone.
						if (!lobby) dispatch({ kind: 'stand', entry: placed });
					}}
					onHeading={setHeading}
					onEngage={() => setMapOpen(false)}
					dimmed={dimmed}
				/>
			)}

			{shown?.mode === 'orbit' && (
				<Orbit
					space={space}
					unavailable={spaceError}
					round={shown}
					movement={movement}
					onPlace={setOver}
					onLost={redraw}
					onHeading={setHeading}
					onEngage={() => setMapOpen(false)}
					dimmed={dimmed}
				/>
			)}

			{lobby && (
				<Party
					session={party}
					lobby={lobby}
					stops={ready ? stops : null}
					modesFor={modesFor}
					opener={opener}
					truth={truth}
					space={space}
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

			{solo && run.phase === 'playing' && round && (
				<div className="hud">
					<Hud
						settings={run.settings}
						round={run.round}
						rounds={run.drawn.length}
						when={round.time}
						left={left}
						onQuit={() => dispatch({ kind: 'home' })}
					/>
					<GuessPanel
						key={run.round}
						guess={guess}
						open={mapOpen}
						headingDeg={heading}
						onOpen={() => setMapOpen(true)}
						onPick={setGuess}
						onGuess={() => void commit(guess, false)}
						placed={!!truth}
						waiting={measuring ? 'measuring how far off…' : undefined}
					/>
				</div>
			)}

			{solo && !returning && run.phase === 'home' && (
				<Home
					ready={ready && !!opener}
					onQuickPlay={() => start(QUICK_PLAY)}
					onCustom={() => dispatch({ kind: 'setup' })}
					onFriends={MULTIPLAYER ? () => enter({ at: 'friends' }) : undefined}
					notice={party.trouble === 'gone' && 'that run ended while you were away'}
				/>
			)}

			{solo && run.phase === 'setup' && (
				<CustomSetup
					title="Custom run"
					ready={ready && !!opener}
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
					space={space}
					played={last}
					round={run.round + 1}
					rounds={run.drawn.length}
					onNext={next}
				/>
			)}

			{solo && run.phase === 'final' && (
				<FinalScore
					space={space}
					played={run.played}
					onAgain={() => start(run.settings)}
					onHome={() => dispatch({ kind: 'home' })}
				/>
			)}

			{(stopsError || spaceError) && solo && run.phase === 'home' && (
				<div className="stage-note" style={{ alignItems: 'end', paddingBottom: 24 }}>
					{stopsError ?? spaceError}
				</div>
			)}
		</>
	);
}

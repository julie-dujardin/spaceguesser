import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { fetchPanoramaIndex, fetchPanoramas } from 'spacemap';
import { bodyOf } from './game/bodies';
import { clearHistory, keepRun, pastRun, recallHistory, type PastRun } from './game/history';
import { inviteCode, invitePath, playedBy, settingsOf, standings } from './game/lobby';
import { keepProfile } from './game/players';
import {
	altitudeKm,
	drawRun,
	shownDate,
	type Modes,
	type Place,
	type Round,
	type Stop
} from './game/rounds';
import { QUICK_PLAY, playable } from './game/rules';
import type { RunSettings } from './game/rules';
import { INITIAL, play, reduce } from './game/run';
import { measure } from './game/measure';
import type { Guess } from './game/scoring';
import { openShared, sharePath, sharedCode } from './game/share';
import { MULTIPLAYER, useLobby } from './game/useLobby';
import * as m from './paraglide/messages.js';
import { CustomSetup } from './ui/CustomSetup';
import { FinalScore } from './ui/FinalScore';
import { Friends } from './ui/Friends';
import { GuessPanel } from './ui/GuessPanel';
import { History } from './ui/History';
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

/** A card over the home screen, one at a time: the way into a multiplayer game,
 *  or the reader's own history. Null is the home screen. */
type Door =
	| { at: 'friends' }
	| { at: 'rules' }
	/** Picking a face, to open a run with these rules or to join the one at `code`. */
	| { at: 'profile'; settings: RunSettings; code?: undefined }
	| { at: 'profile'; code: string }
	| { at: 'history' }
	/** Changing the face, from the history. */
	| { at: 'face' }
	| null;

/** Read once: the page is opened on an invite or it is not. */
const INVITE = MULTIPLAYER ? inviteCode(location.pathname) : null;
/** Or on a run someone shared. */
const SHARED = sharedCode(location.pathname);

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
	// A shared run is come for by itself: a game left open in another tab keeps
	// its seat there.
	const party = useLobby(INVITE, !SHARED);
	const [mapContainer, space, spaceError] = useSpace();
	const [door, setDoor] = useState<Door>(INVITE ? { at: 'profile', code: INVITE } : null);
	const [stops, setStops] = useState<Stop[] | null>(null);
	const [stopsError, setStopsError] = useState<string | null>(null);
	/** The shared run the page was opened on: still being read, or not there
	 *  to read. */
	const [link, setLink] = useState<'opening' | 'lost' | null>(SHARED ? 'opening' : null);
	/** The runs finished in this browser. */
	const [kept, setKept] = useState(recallHistory);
	/** One of them asked for again: still being read, or not there to read. */
	const [again, setAgain] = useState<'opening' | 'lost' | null>(null);
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

	useEffect(() => {
		if (!SHARED) return;
		let dropped = false;
		openShared(SHARED).then(
			(played) => {
				if (dropped) return;
				setLink(null);
				dispatch({ kind: 'visit', played });
			},
			() => {
				if (dropped) return;
				setLink('lost');
				history.replaceState(null, '', '/');
			}
		);
		return () => {
			dropped = true;
		};
	}, []);
	// A shared run keeps its address while it is looked at, so a reload lands
	// back on it.
	useEffect(() => {
		if (!run.shared) return;
		return () => history.replaceState(null, '', '/');
	}, [run.shared]);

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
			const rest = drawRun(stops, settings.rounds - first.length, modes, first, first[0]?.time);
			const drawn = [...first, ...rest];
			dispatch({ kind: 'start', settings, drawn });
			// The opener is spent: draw the next one now, so leaving the run finds a
			// place it has not already used. Moving between menus leaves it alone.
			setOpener(drawRun(stops, 1, modesFor(QUICK_PLAY.modes), drawn)[0] ?? opener);
		},
		[stops, opener, modesFor]
	);

	const { lobby } = party;

	// A run played here to its end goes in the history: not one come for from a
	// link, nor one the history is showing again.
	useEffect(() => {
		if (run.phase !== 'final' || run.shared || run.past) return;
		setKept(keepRun(pastRun(run.played, run.settings)));
	}, [run.phase, run.shared, run.past, run.played, run.settings]);
	// And so does a game with friends, once: each snapshot of its final screen
	// is a new lobby.
	const finished = lobby?.phase === 'final';
	useEffect(() => {
		const { you } = party;
		if (!lobby || !finished || !you) return;
		const played = playedBy(lobby, you);
		if (!played.length) return;
		const table = standings(lobby);
		const place = table.findIndex(({ seat }) => seat.id === you) + 1;
		setKept(keepRun(pastRun(played, settingsOf(lobby.settings), { place, of: table.length })));
	}, [finished, party.you]);

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
			const sky = await measure(round, truth, guessed?.body ?? null);
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
		[truth, round, run.standing, run.settings.timer]
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
		const [fresh] = drawRun(stops, 1, modes, [...run.drawn, shown], shown.time);
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
		setAgain(null);
		if (!next && !code) history.replaceState(null, '', '/');
		setDoor(next);
	};

	// A run from the history is read from its link, as a shared one is, and
	// comes back to the history when it will not read.
	const reopen = (past: PastRun) => {
		if (past.code === null) return;
		setDoor(null);
		setAgain('opening');
		openShared(past.code).then(
			(played) => {
				setAgain(null);
				dispatch({ kind: 'visit', played, past });
			},
			() => {
				setAgain('lost');
				setDoor({ at: 'history' });
			}
		);
	};

	const solo = !lobby && !door;
	// A seat kept from before is being taken back: nothing else to do yet.
	const returning = solo && party.status === 'connecting';
	const opening = solo && (link === 'opening' || again === 'opening');
	// A run looked at from its link is already where the link is.
	const share = useMemo(
		() => (run.phase === 'final' && !run.shared ? sharePath(run.played) : null),
		[run.phase, run.shared, run.played]
	);
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
					title={m.create_run()}
					ready
					onBack={() => enter({ at: 'friends' })}
					actions={[
						{ label: m.create_lobby(), go: (settings) => enter({ at: 'profile', settings }) }
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

			{door?.at === 'history' && (
				<History
					runs={kept}
					notice={again === 'lost' && m.notice_past_run_lost()}
					onOpen={reopen}
					onEdit={() => enter({ at: 'face' })}
					onClear={() => {
						clearHistory();
						setKept([]);
						setAgain(null);
					}}
					onBack={() => enter(null)}
				/>
			)}

			{door?.at === 'face' && (
				<ProfileSetup
					edit
					busy={false}
					trouble={null}
					onBack={() => enter({ at: 'history' })}
					onGo={(profile) => {
						keepProfile(profile);
						enter({ at: 'history' });
					}}
				/>
			)}

			{returning && (
				<div className="scrim">
					<div className="card glass panel" style={{ width: 320 }}>
						<h2>{m.rejoining_run()}</h2>
						<div className="acts">
							<button type="button" className="btn ghost" onClick={party.leave}>
								{m.cancel()}
							</button>
						</div>
					</div>
				</div>
			)}

			{opening && (
				<div className="scrim">
					<div className="card glass panel" style={{ width: 320 }}>
						<h2>{again ? m.opening_past_run() : m.opening_shared_run()}</h2>
					</div>
				</div>
			)}

			{solo && run.phase === 'playing' && round && (
				<div className="hud">
					<Hud
						settings={run.settings}
						round={run.round}
						rounds={run.drawn.length}
						when={shownDate(round)}
						altitude={altitudeKm(round)}
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
						waiting={measuring ? m.measuring() : undefined}
					/>
				</div>
			)}

			{solo && !returning && !opening && run.phase === 'home' && (
				<Home
					ready={ready && !!opener}
					onQuickPlay={() => start(QUICK_PLAY)}
					onCustom={() => dispatch({ kind: 'setup' })}
					onFriends={MULTIPLAYER ? () => enter({ at: 'friends' }) : undefined}
					runs={kept.length}
					onHistory={() => enter({ at: 'history' })}
					notice={
						(link === 'lost' && m.notice_shared_run_lost()) ||
						(party.trouble === 'gone' && m.notice_run_ended())
					}
				/>
			)}

			{solo && run.phase === 'setup' && (
				<CustomSetup
					title={m.custom_run()}
					ready={ready && !!opener}
					onBack={() => dispatch({ kind: 'home' })}
					actions={[
						{ label: m.start_solo(), plays: true, go: start },
						...(MULTIPLAYER
							? [
									{
										label: m.create_lobby(),
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
					share={share ?? undefined}
					shared={run.shared}
					past={run.past ?? undefined}
					onAgain={run.shared ? undefined : () => start(run.settings)}
					onHome={() => {
						// A run come for from the history goes back to it.
						if (run.past) enter({ at: 'history' });
						dispatch({ kind: 'home' });
					}}
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

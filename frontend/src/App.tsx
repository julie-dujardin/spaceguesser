import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { bodyOf } from './game/bodies';
import {
	DAILY,
	HAS_DAILY,
	dailyRun,
	endOf,
	fetchDaily,
	keepStarted,
	recallStarted,
	utcDay,
	type Daily
} from './game/daily';
import { shadedOn } from './game/eclipse';
import {
	clearHistory,
	dayNews,
	finishDay,
	keepRun,
	pastRun,
	recallDays,
	recallHistory,
	recallStreak,
	roundNews,
	streakNews,
	type PastRun
} from './game/history';
import {
	held,
	inviteCode,
	invitePath,
	playedBy,
	settingsOf,
	standings,
	streakRounds
} from './game/lobby';
import { keepProfile } from './game/players';
import {
	altitudeKm,
	drawLitRun,
	drawRun,
	fetchStops,
	shownDate,
	type Draw,
	type Modes,
	type Place,
	type Round,
	type Stop
} from './game/rounds';
import { QUICK_PLAY } from './game/rules';
import type { RunSettings } from './game/rules';
import { INITIAL, play, reduce } from './game/run';
import { measure } from './game/measure';
import type { Guess } from './game/scoring';
import { openShared, sharePath, sharedCode } from './game/share';
import {
	TUTORIAL,
	UNSEEN,
	backward,
	countdown,
	nextEnd,
	onward,
	shownTip,
	tutorialRun,
	type Lesson
} from './game/tutorial';
import { MULTIPLAYER, useLobby } from './game/useLobby';
import * as m from './paraglide/messages.js';
import { CustomSetup } from './ui/CustomSetup';
import { Explanation, Onward } from './ui/Explanation';
import { FinalScore } from './ui/FinalScore';
import { Friends } from './ui/Friends';
import { GuessPanel } from './ui/GuessPanel';
import { History } from './ui/History';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Legal } from './ui/Legal';
import { Orbit } from './ui/Orbit';
import { Panorama } from './ui/Panorama';
import { Party } from './ui/Party';
import { ProfileSetup } from './ui/ProfileSetup';
import { RoundResult } from './ui/RoundResult';
import { TipCard } from './ui/Tip';
import { useSpace } from './ui/useSpace';

/** What the opener is drawn from: it is the first round of a Quick Play. */
const OPENER: Draw = { modes: QUICK_PLAY.modes, difficulty: QUICK_PLAY.difficulty };

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

/** A round of the tutorial before the reader has done anything in it. */
const FRESH = { dragged: null as number | null, opened: null as number | null, ...UNSEEN };

/** Read once: the page is opened on an invite or it is not. */
const INVITE = MULTIPLAYER ? inviteCode(location.pathname) : null;
/** Or on a run someone shared. */
const SHARED = sharedCode(location.pathname);

/** The server is asked again this long after the day ends, and no sooner
 *  than a minute after the last time: its clock can be behind. */
const DAILY_LATE_MS = 5_000;
const DAILY_AGAIN_MS = 60_000;

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
	/** The round whose view is up, or will not come up, by its key. */
	const [up, setUp] = useState<string | null>(null);
	const [guess, setGuess] = useState<Guess | null>(null);
	/** A guess is in and the sky is being asked how far off it was. */
	const [measuring, setMeasuring] = useState(false);
	/** The guess panel takes the corner while the reader is working on it, and
	 *  gives it back when they turn to the view again. */
	const [mapOpen, setMapOpen] = useState(false);
	const [heading, setHeading] = useState(0);
	/** The tutorial as it was drawn: its rounds, and a lesson for each. */
	const [taught, setTaught] = useState<{ rounds: Round[]; lessons: Lesson[] } | null>(null);
	/** What the reader has done in the round, which moves the tips on. */
	const [progress, setProgress] = useState(FRESH);
	/** What the tips' waits are read against, moved on as each runs out. */
	const [now, setNow] = useState(Date.now);
	/** No more tips this run. */
	const [tipsOff, setTipsOff] = useState(false);
	const [left, setLeft] = useState<number | null>(null);
	/** The day's challenge: undefined while it is asked for, null when there is none. */
	const [daily, setDaily] = useState<Daily | null | undefined>(HAS_DAILY ? undefined : null);
	/** The last day whose challenge was started here. */
	const [started, setStarted] = useState(recallStarted);
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

	// The next day's challenge comes once the day is over.
	useEffect(() => {
		if (!HAS_DAILY) return;
		let dropped = false;
		let timer: ReturnType<typeof setTimeout>;
		const ask = async () => {
			const found = await fetchDaily();
			if (dropped) return;
			setDaily(found);
			const wait = endOf(found?.day ?? utcDay()) - Date.now() + DAILY_LATE_MS;
			timer = setTimeout(() => void ask(), Math.max(wait, DAILY_AGAIN_MS));
		};
		void ask();
		return () => {
			dropped = true;
			clearTimeout(timer);
		};
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
		let dropped = false;
		const draw = { ...OPENER, modes: modesFor(OPENER.modes) };
		void drawLitRun(stops, 1, draw, run.drawn).then(([round]) => {
			if (!dropped) setOpener(round ?? null);
		});
		return () => {
			dropped = true;
		};
	}, [stops, ready, opener, modesFor, run.drawn]);
	// An orbit opener with no map to show it in gives way to a stop.
	useEffect(() => {
		if (!canOrbit && opener?.mode === 'orbit') setOpener(null);
	}, [canOrbit, opener]);

	const start = useCallback(
		(settings: RunSettings, quick = false) => {
			if (!stops || !opener) return;
			setGuess(null);
			setMapOpen(false);
			setProgress(FRESH);
			const modes = modesFor(settings.modes);
			// Quick Play opens on the place behind the home screen; any other run
			// is drawn by its own rules, away from that place. Every run takes the
			// opener's date: that sky is the one already read.
			const first = quick && modes[opener.mode] ? [opener] : [];
			const rest = drawRun(
				stops,
				settings.rounds - first.length,
				{ modes, difficulty: settings.difficulty },
				[opener],
				opener.time,
				shadedOn(opener.time)
			);
			dispatch({ kind: 'start', settings, drawn: [...first, ...rest], streak: recallStreak() });
			// The opener is spent: leaving the run must not find a place it has
			// already used. Moving between menus leaves it alone.
			setOpener(null);
		},
		[stops, opener, modesFor]
	);

	// The opener stays for the run after it: the tutorial's places are its own.
	const startTutorial = useCallback(() => {
		if (!stops) return;
		const drawn = tutorialRun(stops, canOrbit);
		setGuess(null);
		setMapOpen(false);
		setProgress(FRESH);
		setTipsOff(false);
		setTaught(drawn);
		dispatch({
			kind: 'start',
			settings: TUTORIAL,
			drawn: drawn.rounds,
			tutorial: true,
			streak: null
		});
	}, [stops, canOrbit]);

	// Null when a round of it cannot be played here.
	const dailyRounds = useMemo(
		() => (daily && stops ? dailyRun(daily, stops, canOrbit) : null),
		[daily, stops, canOrbit]
	);
	const startDaily = useCallback(() => {
		if (!daily || !dailyRounds) return;
		// Another tab can have started it.
		if (recallStarted() === daily.day) return setStarted(daily.day);
		setStarted(keepStarted(daily.day));
		setGuess(null);
		setMapOpen(false);
		setProgress(FRESH);
		dispatch({
			kind: 'start',
			settings: DAILY,
			drawn: dailyRounds,
			streak: recallStreak(),
			daily: { day: daily.day, streak: recallDays() }
		});
	}, [daily, dailyRounds]);

	const { lobby } = party;

	// A run played here to its end goes in the history: not one come for from a
	// link, nor one the history is showing again. The tutorial is the same nine
	// rounds every time, so it does nothing to the streak.
	useEffect(() => {
		if (run.phase !== 'final' || run.shared || run.past) return;
		const kind = run.tutorial
			? { tutorial: true as const }
			: run.daily
				? { daily: run.daily.day }
				: {};
		const past = pastRun(run.played, run.settings, kind);
		setKept(keepRun(past, run.tutorial ? [] : run.played));
		if (run.daily) finishDay(run.daily.day);
	}, [run.phase, run.shared, run.past, run.played, run.settings, run.tutorial, run.daily]);
	// A daily challenge left part of the way is kept as far as it went: starting
	// it used up the day.
	const keepPart = useCallback(() => {
		if (!run.daily || !run.played.length) return;
		const past = pastRun(run.played, run.settings, { daily: run.daily.day });
		setKept(keepRun(past, run.played));
		if (run.played.length === run.drawn.length) finishDay(run.daily.day);
	}, [run.daily, run.played, run.drawn, run.settings]);
	const quit = () => {
		keepPart();
		dispatch({ kind: 'home' });
	};
	useEffect(() => {
		if (run.phase !== 'playing' && run.phase !== 'result') return;
		// A page kept for the back button can still come back to the run.
		const hide = (event: PageTransitionEvent) => {
			if (!event.persisted) keepPart();
		};
		addEventListener('pagehide', hide);
		return () => removeEventListener('pagehide', hide);
	}, [run.phase, keepPart]);
	// And so does a game with friends, once: each snapshot of its final screen
	// is a new lobby.
	const finished = lobby?.phase === 'final';
	useEffect(() => {
		const { you } = party;
		if (!lobby || !finished || !you) return;
		// A seat taken once the game was over, or that answered nothing, has no
		// run of its own to keep.
		if (!lobby.history.some((round) => you in round)) return;
		const played = playedBy(lobby, you);
		const table = standings(lobby);
		const place = table.findIndex(({ seat }) => seat.id === you) + 1;
		const past = pastRun(played, settingsOf(lobby.settings), { place, of: table.length });
		setKept(keepRun(past, streakRounds(lobby, you)));
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
	// Every round of a run has its date: the place tells them apart.
	const shownKey =
		shown &&
		(shown.mode === 'ground'
			? `ground:${shown.entry.id}`
			: `orbit:${shown.body}:${shown.time}:${shown.u}:${shown.v}`);
	useEffect(() => setOver(null), [shownKey]);
	const viewUp = !!shownKey && up === shownKey;

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

	// The round's clock, which stands at its full time until the view is up:
	// the time a slow device spends loading it is not the reader's to lose. It
	// reads the guess and the round's ending through refs, so that neither
	// picking a point nor walking to another panorama hands it a fresh minute.
	const pending = useRef<Guess | null>(null);
	pending.current = guess;
	const close = useRef(commit);
	close.current = commit;
	const timed = run.phase === 'playing' && run.settings.timer > 0;
	const running = timed && !!truth && viewUp;
	useEffect(() => {
		if (!timed) return setLeft(null);
		setLeft(run.settings.timer);
		if (!running) return;
		const ends = Date.now() + run.settings.timer * 1000;
		const tick = setInterval(() => {
			const remaining = (ends - Date.now()) / 1000;
			setLeft(Math.max(0, remaining));
			if (remaining <= 0) {
				clearInterval(tick);
				void close.current(pending.current, true);
			}
		}, 200);
		return () => clearInterval(tick);
	}, [timed, running, run.settings.timer, run.round]);

	// An orbit round the map cannot reach is swapped for another, wherever a
	// swap is this browser's to make: a lobby's rounds are the host's, and the
	// daily challenge's are the same for everyone.
	const redraw = () => {
		if (!stops || lobby || run.daily || shown?.mode !== 'orbit') return;
		const asked = run.phase === 'playing' ? run.settings : OPENER;
		const [fresh] = drawRun(
			stops,
			1,
			{ modes: modesFor(asked.modes), difficulty: asked.difficulty },
			[...run.drawn, shown],
			shown.time,
			shadedOn(shown.time)
		);
		if (!fresh) return;
		if (run.phase === 'playing') dispatch({ kind: 'redraw', round: fresh });
		else setOpener(fresh);
	};

	const next = useCallback(() => {
		setGuess(null);
		setMapOpen(false);
		setProgress(FRESH);
		dispatch({ kind: 'next' });
	}, []);

	const engage = useCallback(() => {
		setMapOpen(false);
		setProgress((done) => (done.dragged !== null ? done : { ...done, dragged: Date.now() }));
	}, []);
	useEffect(() => {
		if (!mapOpen) return;
		setProgress((done) => (done.opened !== null ? done : { ...done, opened: Date.now() }));
	}, [mapOpen]);

	/** A tutorial round's lesson. A round the map could not reach was swapped
	 *  for another, which has none. */
	const lessonOf = (index: number): Lesson | null =>
		run.tutorial && taught?.rounds[index] === run.drawn[index]
			? (taught.lessons[index] ?? null)
			: null;
	const lesson = !lobby && run.phase === 'playing' ? lessonOf(run.round) : null;
	const recapped = !lobby && run.phase === 'result' ? lessonOf(run.round) : null;
	const tips = lesson && !tipsOff ? lesson.tips : [];
	const known = { ...progress, picked: guess?.body ?? null, placed: !!guess?.at, now };
	const wake = nextEnd(tips, known);
	useEffect(() => {
		if (wake === null) return;
		const timer = setTimeout(() => setNow(Date.now()), wake - Date.now());
		return () => clearTimeout(timer);
	}, [wake]);
	const tipAt = shownTip(tips, known, progress);
	const tip = tips[tipAt] ?? null;
	const tipCard = tip && (
		<TipCard
			tip={tip}
			index={tipAt}
			count={tips.length}
			countdown={countdown(tips, tipAt, known)}
			onDone={() => setProgress((done) => ({ ...done, ...onward(tips, known, done) }))}
			onBack={() => setProgress((done) => ({ ...done, ...backward(tips, known, done) }))}
			onHide={() => setTipsOff(true)}
		/>
	);

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

	const reload = () => {
		// A run being joined goes in the address, so the reload lands back on its card.
		if (door?.at === 'profile' && door.code) history.replaceState(null, '', invitePath(door.code));
		location.reload();
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
	const veiled = !!lobby && held(lobby);

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
					onReady={() => setUp(shownKey)}
					onEngage={engage}
					dimmed={dimmed}
					veiled={veiled}
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
					onReady={() => setUp(shownKey)}
					onEngage={engage}
					dimmed={dimmed}
					veiled={veiled}
				/>
			)}

			{lobby && (
				<Party
					session={party}
					lobby={lobby}
					stops={ready ? stops : null}
					modesFor={modesFor}
					opener={opener}
					onSpent={() => setOpener(null)}
					truth={truth}
					up={viewUp}
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
					// A seat just taken shows this card once more before it closes it.
					busy={party.status !== 'idle'}
					trouble={party.trouble}
					onBack={() => enter(INVITE && door.code === INVITE ? null : { at: 'friends' })}
					onGo={(profile, proof) => {
						keepProfile(profile);
						if (door.code === undefined) party.create(profile, door.settings, proof);
						else party.join(door.code, profile, proof);
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
						onQuit={quit}
						tutorial={run.tutorial}
						tip={tip?.at === 'view' ? tipCard : undefined}
						onTip={() => setMapOpen(false)}
					/>
					<GuessPanel
						key={run.round}
						difficulty={run.settings.difficulty}
						guess={guess}
						open={mapOpen}
						headingDeg={heading}
						onOpen={() => setMapOpen(true)}
						onPick={setGuess}
						onGuess={() => void commit(guess, false)}
						placed={!!truth}
						waiting={measuring ? m.measuring() : undefined}
						highlight={tip?.ring?.(known)}
						tip={tip?.at === 'panel' ? tipCard : undefined}
						toolsTip={tip?.at === 'tools' ? tipCard : undefined}
					/>
				</div>
			)}

			{solo && !returning && !opening && run.phase === 'home' && (
				<Home
					ready={ready && !!opener && daily !== undefined}
					onQuickPlay={() => start(QUICK_PLAY, true)}
					daily={
						daily && dailyRounds
							? { open: started !== daily.day, ends: endOf(daily.day), go: startDaily }
							: undefined
					}
					onTutorial={startTutorial}
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
					streak={run.streak && roundNews(run.streak, run.played)}
					onNext={next}
					onQuit={quit}
				>
					{recapped && <Explanation score={last.score} lines={recapped.recap} />}
				</RoundResult>
			)}

			{solo && run.phase === 'final' && (
				<FinalScore
					space={space}
					played={run.played}
					streak={run.streak && streakNews(run.streak, run.played)}
					days={run.daily && dayNews(run.daily.streak, run.daily.day)}
					share={share ?? undefined}
					shared={run.shared}
					past={run.past ?? undefined}
					onAgain={
						run.shared
							? undefined
							: () => start(run.tutorial || run.daily ? QUICK_PLAY : run.settings)
					}
					tutorial={run.tutorial}
					daily={!!run.daily}
					ahead={run.tutorial && !run.past && <Onward panoramas={stops?.length ?? 0} />}
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

			{party.stale && (
				<div className="scrim over">
					<div className="card glass panel" style={{ width: 380 }}>
						<h2>{m.stale_title()}</h2>
						<p className="lede">{m.stale_lede()}</p>
						<div className="acts">
							{/* The only way on, and one a page on a home screen has no button for. */}
							<button type="button" className="btn lg" style={{ flex: 1 }} onClick={reload}>
								{m.reload_page()}
							</button>
						</div>
					</div>
				</div>
			)}

			<Legal />
		</>
	);
}

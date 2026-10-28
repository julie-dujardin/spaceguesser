/** A multiplayer game: the same screens as a solo run, moved on by the server. */

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { bodyOf } from '../game/bodies';
import { shadedOn } from '../game/eclipse';
import { recallStreak, roundNews, streakNews, type Streak, type StreakNews } from '../game/history';
import {
	held,
	playedBy,
	playedIn,
	settingsOf,
	slim,
	standings,
	streakRounds,
	type Lobby,
	type LobbyRound,
	type Seat
} from '../game/lobby';
import { profileOf } from '../game/players';
import {
	altitudeKm,
	drawRun,
	shownDate,
	type Modes,
	type Place,
	type Round as Asked,
	type Stop
} from '../game/rounds';
import type { RunSettings } from '../game/rules';
import { play, type Played } from '../game/run';
import { measure } from '../game/measure';
import type { Guess } from '../game/scoring';
import type { Space } from '../game/space';
import type { LobbySession } from '../game/useLobby';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { Avatar } from './Avatar';
import { CustomSetup } from './CustomSetup';
import { FinalScore } from './FinalScore';
import { GuessPanel } from './GuessPanel';
import { Hud, Quit } from './Hud';
import { LobbyCard } from './LobbyCard';
import { RoundResult } from './RoundResult';
import { Standings } from './Standings';
import { ToolSlot } from './tools';

interface Props {
	session: LobbySession;
	lobby: Lobby;
	/** Null until there is something to draw a run from. */
	stops: Stop[] | null;
	/** The modes a run can really be played in, given the ones asked for. */
	modesFor: (asked: Modes) => Modes;
	/** What the host has been looking at behind the lobby, and so has seen. A
	 *  run is flown on its date, whose sky is the one already read. */
	opener: Asked | null;
	/** A run took the opener's date: the next one is to have its own. */
	onSpent: () => void;
	/** Where the round on screen is, once that is known. */
	truth: Place | null;
	/** The round's view is up here, or will not come up. */
	up: boolean;
	space: Space | null;
	heading: number;
	mapOpen: boolean;
	onMapOpen: (open: boolean) => void;
}

export function Party({
	session,
	lobby,
	stops,
	modesFor,
	opener,
	onSpent,
	truth,
	up,
	space,
	heading,
	mapOpen,
	onMapOpen
}: Props) {
	const [editing, setEditing] = useState(false);
	const { you } = session;
	const hosting = lobby.host === you;
	const settings = settingsOf(lobby.settings);
	const table = useMemo(() => standings(lobby), [lobby]);
	const played = useMemo(() => playedBy(lobby, you ?? ''), [lobby, you]);
	const me = lobby.players.find((seat) => seat.id === you);
	const observing = !!me?.observing;
	// The streak as this game found it, read again when the next one starts. A
	// page opened on a game already over cannot tell: the history may hold the
	// game already.
	const going = lobby.phase !== 'final';
	const [found, setFound] = useState(() => (going ? recallStreak() : null));
	const [wasGoing, setWasGoing] = useState(going);
	if (going !== wasGoing) {
		setWasGoing(going);
		if (going) setFound(recallStreak());
	}
	const counts = found && you && !observing;

	const start =
		stops && opener
			? () => {
					const rounds = drawRun(
						stops,
						settings.rounds,
						{ modes: modesFor(settings.modes), difficulty: settings.difficulty },
						[opener],
						opener.time,
						shadedOn(opener.time)
					);
					session.send({ type: 'start', settings, rounds });
					onSpent();
				}
			: undefined;
	// Held steady across snapshots, which are new objects each time: the recap
	// sets itself up again for whatever changes identity.
	const told = JSON.stringify([lobby.history, lobby.players.map((seat) => seat.name)]);
	const everyoneElse = useMemo(
		() => (index: number) => {
			// The tally counts the rounds somebody answered, as `playedBy` does.
			const answered = lobby.history.filter((round) => Object.keys(round).length > 0);
			return lobby.players.flatMap((seat) => {
				const guess = seat.id !== you && answered[index]?.[seat.id]?.guess;
				return guess ? [{ guess, avatar: profileOf(seat.name) }] : [];
			});
		},
		[told, you]
	);
	const mine = useMemo(() => (me ? profileOf(me.name) : undefined), [me?.name]);
	const { round } = lobby;
	const act = (type: 'close_round' | 'next') =>
		hosting && round ? () => session.send({ type, round: round.index }) : undefined;
	return (
		<>
			{lobby.phase === 'lobby' &&
				(editing && hosting ? (
					<CustomSetup
						title={m.run_settings_title()}
						initial={settings}
						ready
						onBack={() => setEditing(false)}
						actions={[
							{
								label: m.save(),
								go: (changed) => {
									session.send({ type: 'settings', settings: changed });
									setEditing(false);
								}
							}
						]}
					/>
				) : (
					<LobbyCard
						lobby={lobby}
						you={you}
						ready={!!start}
						onStart={() => start?.()}
						onEdit={() => setEditing(true)}
						onObserve={(observing) => session.send({ type: 'observe', observing })}
						onLeave={session.leave}
					/>
				))}

			{lobby.phase === 'playing' && round && (
				<Round
					key={round.index}
					session={session}
					lobby={lobby}
					round={round}
					settings={settings}
					observing={observing}
					truth={truth}
					up={up}
					heading={heading}
					mapOpen={mapOpen}
					onMapOpen={onMapOpen}
					onEnd={act('close_round')}
				/>
			)}

			{lobby.phase === 'result' && round && (
				<Result
					space={space}
					lobby={lobby}
					round={round}
					you={you}
					observing={observing}
					streak={counts ? newsOf(lobby, you, found, round.index) : null}
					onNext={act('next')}
					onQuit={session.leave}
				>
					<Standings standings={table} you={you} gains />
				</Result>
			)}

			{lobby.phase === 'final' && (
				<FinalScore
					space={space}
					played={played}
					others={everyoneElse}
					avatar={mine}
					observing={observing}
					streak={counts ? newsOf(lobby, you, found) : null}
					onAgain={hosting ? start : undefined}
					onHome={session.leave}
				>
					<Standings standings={table} you={you} />
					{!hosting && <span className="note">{m.host_can_restart()}</span>}
				</FinalScore>
			)}

			{session.status === 'reconnecting' && <div className="conn pill">{m.reconnecting()}</div>}

			{session.status === 'displaced' && (
				<div className="scrim over">
					<div className="card glass panel" style={{ width: 380 }}>
						<h2>{m.displaced_title()}</h2>
						<p className="lede">{m.displaced_lede()}</p>
						<div className="acts">
							<button
								type="button"
								className="btn lg"
								style={{ flex: 1 }}
								onClick={session.reclaim}
							>
								{m.play_here()}
							</button>
							<button
								type="button"
								className="btn lg ghost"
								style={{ flex: 1 }}
								onClick={session.leave}
							>
								{m.leave()}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

/** What a seat's rounds did to the streak the game found: up to the round at
 *  `index`, or in the whole game. */
function newsOf(lobby: Lobby, you: string, found: Streak, index?: number): StreakNews | null {
	if (index === undefined) return streakNews(found, streakRounds(lobby, you));
	const rounds = streakRounds(lobby, you, index + 1);
	// A round from before the seat's first answer is none of its streak's.
	if (rounds.length === streakRounds(lobby, you, index).length) return null;
	return roundNews(found, rounds);
}

/** Seconds until `endsAt` on the server's clock; null for a round with no deadline. */
function useCountdown(endsAt: number | null, skew: number): number | null {
	const [left, setLeft] = useState<number | null>(null);
	useEffect(() => {
		if (endsAt === null) return setLeft(null);
		const read = () => setLeft(Math.max(0, (endsAt - skew - Date.now()) / 1000));
		read();
		const tick = setInterval(read, 200);
		return () => clearInterval(tick);
	}, [endsAt, skew]);
	return left;
}

interface RoundProps {
	session: LobbySession;
	lobby: Lobby;
	round: LobbyRound;
	settings: RunSettings;
	/** The host watching: nothing to guess here, and no guess waited on. */
	observing: boolean;
	truth: Place | null;
	up: boolean;
	heading: number;
	mapOpen: boolean;
	onMapOpen: (open: boolean) => void;
	/** The host's way of closing a round someone is sitting on. */
	onEnd?: () => void;
}

function Round({
	session,
	lobby,
	round,
	settings,
	observing,
	truth,
	up,
	heading,
	mapOpen,
	onMapOpen,
	onEnd
}: RoundProps) {
	const [guess, setGuess] = useState<Guess | null>(null);
	const [sent, setSent] = useState<Played | null>(null);
	/** A guess is in and the sky is being asked how far off it was. */
	const [measuring, setMeasuring] = useState(false);
	const left = useCountdown(round.ends_at, session.skew);
	const { you, connection, send } = session;
	const answered = sent !== null || round.guessed.includes(you ?? '');

	// Everyone is ranked on the same question, so the guess is scored against
	// where the round opened rather than wherever this player walked to.
	const commit = async (guessed: Guess | null, timedOut: boolean) => {
		if (!truth || measuring) return;
		const seconds = left === null ? null : timedOut ? 0 : left;
		setMeasuring(true);
		const sky = await measure(round.entry, truth, guessed?.body ?? null);
		setMeasuring(false);
		const radius = bodyOf(truth.body)?.radiusKm ?? null;
		setSent(play(slim(round.entry), truth, guessed, sky, radius, seconds, timedOut));
	};

	// The clock closes the round on whatever point is picked, as it does solo.
	// A place the sky has not given yet is waited for: there is nothing to
	// score against until it has.
	const expire = useRef(() => {});
	expire.current = () => void commit(guess, true);
	const placed = !!truth;
	useEffect(() => {
		if (left === 0 && !answered && placed && !observing) expire.current();
	}, [left, answered, placed, observing]);

	// Again on each new socket: a guess made while the line was down still has
	// to arrive, and one the server already has, or whose round has gone by, is
	// refused harmlessly.
	const post = useRef(send);
	post.current = send;
	useEffect(() => {
		if (sent) post.current({ type: 'guess', round: round.index, result: sent });
	}, [sent, connection, round.index]);

	// The clock waits for everyone's view, and the server does not keep who
	// has said so: a new socket says it again.
	const waiting = held(lobby);
	useEffect(() => {
		if (up && waiting) post.current({ type: 'ready', round: round.index });
	}, [up, waiting, connection, round.index]);

	const players = lobby.players.filter((seat) => !seat.observing);
	const out = players.filter(
		(seat) => seat.connected && seat.id !== you && !round.guessed.includes(seat.id)
	);
	const end = onEnd && (
		<button type="button" className="btn ghost" onClick={onEnd}>
			{m.end_round()}
		</button>
	);

	return (
		<div className="hud">
			<Hud
				settings={settings}
				round={round.index}
				rounds={round.total}
				// Nothing of the round is shown before everyone's clock starts.
				when={waiting ? null : shownDate(round.entry)}
				altitude={waiting ? null : altitudeKm(round.entry)}
				left={left}
				onQuit={session.leave}
			>
				<span className="pill party">
					{players.map((seat) => (
						<span
							key={seat.id}
							className={round.guessed.includes(seat.id) ? 'in' : undefined}
							title={profileOf(seat.name).name}
						>
							<Avatar profile={profileOf(seat.name)} />
						</span>
					))}
				</span>
			</Hud>
			{!waiting && observing && (
				<Watching
					note={awaited(out, m.observing, m.observing_waiting_for, m.observing_waiting)}
					action={end}
				/>
			)}
			{!waiting && !observing && (
				<GuessPanel
					difficulty={settings.difficulty}
					placed={placed}
					guess={guess}
					open={mapOpen}
					headingDeg={heading}
					onOpen={() => onMapOpen(true)}
					onPick={setGuess}
					onGuess={() => void commit(guess, false)}
					waiting={
						measuring
							? m.measuring()
							: answered
								? awaited(out, m.guess_in, m.guess_in_waiting_for, m.guess_in_waiting)
								: undefined
					}
					action={end}
				/>
			)}
		</div>
	);
}

/** Who the round still waits on. A name or two says more than a count. */
function awaited(
	out: Seat[],
	none: () => string,
	named: (inputs: { names: string }) => string,
	counted: (inputs: { count: number }) => string
): string {
	if (!out.length) return none();
	if (out.length >= 3) return counted({ count: out.length });
	const names = out.map((seat) => profileOf(seat.name).name);
	return named({ names: new Intl.ListFormat(getLocale()).format(names) });
}

/** The guess panel's corner, for the host observing: how the round is going,
 *  the view's own controls, and the way to close it. */
function Watching({ note, action }: { note: string; action?: ReactNode }) {
	const { setSlot } = useContext(ToolSlot);
	return (
		<div className="watching">
			<div className="tools">
				<div ref={setSlot} />
			</div>
			<div className="glass">
				<span className="mono mut">{note}</span>
				{action}
			</div>
		</div>
	);
}

interface ResultProps {
	space: Space | null;
	lobby: Lobby;
	round: LobbyRound;
	you: string | null;
	observing: boolean;
	streak: StreakNews | null;
	onNext?: () => void;
	onQuit: () => void;
	children: ReactNode;
}

function Result({
	space,
	lobby,
	round,
	you,
	observing,
	streak,
	onNext,
	onQuit,
	children
}: ResultProps) {
	const guesses = lobby.history[round.index];
	const mine = guesses?.[you ?? ''];
	const me = lobby.players.find((seat) => seat.id === you);
	// Held steady across snapshots, which are new objects each time: the map
	// redraws what changes identity.
	const key = JSON.stringify([guesses, lobby.players.map((seat) => seat.name)]);
	const drawn = useMemo(
		() => ({
			// A player who sat the round out still sees where it was, which
			// anyone's guess says.
			played: mine ?? playedIn(lobby, you ?? '', round.index),
			avatar: me && profileOf(me.name),
			others: lobby.players.flatMap((seat) => {
				const guess = seat.id !== you && guesses?.[seat.id]?.guess;
				return guess ? [{ guess, avatar: profileOf(seat.name) }] : [];
			})
		}),
		[key]
	);
	// Nobody got to the round, so nobody can say where it was.
	if (!drawn.played)
		return (
			<div className="board">
				<Quit onQuit={onQuit} />
				<div className="rpanel glass">
					<span className="hd">{m.round_number({ round: round.index + 1 })}</span>
					<span className="note">{m.nobody_reached()}</span>
					{children}
					{onNext && (
						<button type="button" className="btn lg" style={{ marginTop: 'auto' }} onClick={onNext}>
							{round.index + 1 < round.total ? m.next_round() : m.see_total()}
						</button>
					)}
				</div>
			</div>
		);

	return (
		<RoundResult
			space={space}
			played={drawn.played}
			avatar={drawn.avatar}
			others={drawn.others}
			round={round.index + 1}
			rounds={round.total}
			observing={observing}
			streak={streak}
			onNext={onNext}
			onQuit={onQuit}
		>
			{children}
		</RoundResult>
	);
}

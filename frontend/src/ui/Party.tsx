/** A multiplayer game: the same screens as a solo run, moved on by the server. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LonLat } from 'spacemap';
import { bodyOf } from '../game/bodies';
import {
	playedBy,
	playedIn,
	settingsOf,
	slim,
	standings,
	type Lobby,
	type LobbyRound
} from '../game/lobby';
import { profileOf } from '../game/players';
import { drawRun, type Modes, type Place, type Round as Asked, type Stop } from '../game/rounds';
import type { RunSettings } from '../game/rules';
import { play, type Played } from '../game/run';
import { NO_SKY } from '../game/scoring';
import type { Space } from '../game/space';
import type { LobbySession } from '../game/useLobby';
import { Avatar } from './Avatar';
import { CustomSetup } from './CustomSetup';
import { FinalScore } from './FinalScore';
import { GuessMap } from './GuessMap';
import { Hud } from './Hud';
import { LobbyCard } from './LobbyCard';
import { RoundResult } from './RoundResult';
import { Standings } from './Standings';

interface Props {
	session: LobbySession;
	lobby: Lobby;
	/** Null until there is something to draw a run from. */
	stops: Stop[] | null;
	/** The modes a run can really be played in, given the ones asked for. */
	modesFor: (asked: Modes) => Modes;
	/** What the host has been looking at behind the lobby, and so has seen. */
	opener: Asked | null;
	/** Where the round on screen is, once that is known. */
	truth: Place | null;
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
	truth,
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

	const start = () => {
		if (!stops) return;
		const taken = opener ? [opener] : [];
		const rounds = drawRun(stops, settings.rounds, modesFor(settings.modes), taken);
		session.send({ type: 'start', settings, rounds });
	};
	const { round } = lobby;
	const act = (type: 'close_round' | 'next') =>
		hosting && round ? () => session.send({ type, round: round.index }) : undefined;
	return (
		<>
			{lobby.phase === 'lobby' &&
				(editing && hosting ? (
					<CustomSetup
						title="Run settings"
						initial={settings}
						ready
						onBack={() => setEditing(false)}
						actions={[
							{
								label: 'Save',
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
						ready={!!stops}
						onStart={start}
						onEdit={() => setEditing(true)}
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
					truth={truth}
					space={space}
					heading={heading}
					mapOpen={mapOpen}
					onMapOpen={onMapOpen}
					onEnd={act('close_round')}
				/>
			)}

			{lobby.phase === 'result' && round && (
				<Result lobby={lobby} round={round} you={you} onNext={act('next')}>
					<Standings standings={table} you={you} gains />
				</Result>
			)}

			{lobby.phase === 'final' && (
				<FinalScore
					played={played}
					onAgain={hosting && stops ? start : undefined}
					onHome={session.leave}
				>
					<Standings standings={table} you={you} />
					{!hosting && <span className="note">the host can start another run</span>}
				</FinalScore>
			)}

			{session.status === 'reconnecting' && <div className="conn pill">reconnecting…</div>}

			{session.status === 'displaced' && (
				<div className="scrim over">
					<div className="card glass panel" style={{ width: 380 }}>
						<h2>Playing somewhere else</h2>
						<p className="lede">
							This seat was opened in another tab or on another device, and a seat is played from
							one place at a time.
						</p>
						<div className="acts">
							<button
								type="button"
								className="btn lg"
								style={{ flex: 1 }}
								onClick={session.reclaim}
							>
								Play here
							</button>
							<button
								type="button"
								className="btn lg ghost"
								style={{ flex: 1 }}
								onClick={session.leave}
							>
								Leave
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
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
	truth: Place | null;
	space: Space | null;
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
	truth,
	space,
	heading,
	mapOpen,
	onMapOpen,
	onEnd
}: RoundProps) {
	const [guess, setGuess] = useState<LonLat | null>(null);
	const [sent, setSent] = useState<Played | null>(null);
	const radiusKm = useRef<number | null>(null);
	const left = useCountdown(round.ends_at, session.skew);
	const { you, connection, send } = session;
	const answered = sent !== null || round.guessed.includes(you ?? '');

	// Everyone is ranked on the same question, so the guess is scored against
	// where the round opened rather than wherever this player walked to.
	const commit = (at: LonLat | null, timedOut: boolean) => {
		if (!truth) return;
		const seconds = left === null ? null : timedOut ? 0 : left;
		const info = bodyOf(truth.body);
		// A body with no map is guessed whole.
		const guessed = at || (info && !info.surface && !timedOut) ? { body: truth.body, at } : null;
		const radius = info?.radiusKm ?? radiusKm.current ?? space?.radiusKm(truth.body) ?? null;
		setSent(play(slim(round.entry), truth, guessed, NO_SKY, radius, seconds, timedOut));
	};

	// The clock closes the round on whatever point is picked, as it does solo.
	// A place the sky has not given yet is waited for: there is nothing to
	// score against until it has.
	const expire = useRef(() => {});
	expire.current = () => commit(guess, true);
	const placed = !!truth;
	useEffect(() => {
		if (left === 0 && !answered && placed) expire.current();
	}, [left, answered, placed]);

	// Again on each new socket: a guess made while the line was down still has
	// to arrive, and one the server already has is refused harmlessly.
	const post = useRef(send);
	post.current = send;
	useEffect(() => {
		if (sent) post.current({ type: 'guess', result: sent });
	}, [sent, connection]);

	const out = lobby.players.filter(
		(seat) => seat.connected && seat.id !== you && !round.guessed.includes(seat.id)
	).length;

	return (
		<div className="hud">
			<Hud
				settings={settings}
				round={round.index}
				rounds={round.total}
				when={round.entry.time}
				left={left}
				onQuit={session.leave}
			>
				<span className="pill party">
					{lobby.players.map((seat) => (
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
			<GuessMap
				body={round.entry.body}
				placed={placed}
				guess={guess}
				open={mapOpen}
				headingDeg={heading}
				onOpen={() => onMapOpen(true)}
				onPick={setGuess}
				onReady={(km) => (radiusKm.current = km)}
				onGuess={() => commit(guess, false)}
				waiting={
					answered
						? out
							? `guess in · waiting for ${out} other${out > 1 ? 's' : ''}`
							: 'guess in'
						: undefined
				}
				action={
					onEnd && (
						<button
							type="button"
							className="btn ghost"
							style={{ marginLeft: 'auto' }}
							onClick={onEnd}
						>
							End round
						</button>
					)
				}
			/>
		</div>
	);
}

interface ResultProps {
	lobby: Lobby;
	round: LobbyRound;
	you: string | null;
	onNext?: () => void;
	children: ReactNode;
}

function Result({ lobby, round, you, onNext, children }: ResultProps) {
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
				<div className="rpanel glass">
					<span className="hd">round {round.index + 1}</span>
					<span className="note">nobody reached this one</span>
					{children}
					{onNext && (
						<button type="button" className="btn lg" style={{ marginTop: 'auto' }} onClick={onNext}>
							{round.index + 1 < round.total ? 'Next round' : 'See total'}
						</button>
					)}
				</div>
			</div>
		);

	return (
		<RoundResult
			played={drawn.played}
			avatar={drawn.avatar}
			others={drawn.others}
			round={round.index + 1}
			rounds={round.total}
			onNext={onNext}
		>
			{children}
		</RoundResult>
	);
}

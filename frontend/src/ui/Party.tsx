/** A multiplayer game: the same screens as a solo run, moved on by the server. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LonLat, PanoramaEntry } from 'spacemap';
import { playedBy, settingsOf, slim, standings, type Lobby, type LobbyRound } from '../game/lobby';
import { profileOf } from '../game/players';
import { drawRounds, type RunSettings } from '../game/rules';
import { play, type Played } from '../game/run';
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
	body: string;
	session: LobbySession;
	lobby: Lobby;
	pool: PanoramaEntry[] | null;
	/** What the host has been looking at behind the lobby, and so has seen. */
	opener: PanoramaEntry | null;
	heading: number;
	mapOpen: boolean;
	onMapOpen: (open: boolean) => void;
}

export function Party({ body, session, lobby, pool, opener, heading, mapOpen, onMapOpen }: Props) {
	const [editing, setEditing] = useState(false);
	const { you } = session;
	const hosting = lobby.host === you;
	const settings = settingsOf(lobby.settings);
	const table = useMemo(() => standings(lobby), [lobby]);
	const played = useMemo(() => playedBy(lobby, you ?? ''), [lobby, you]);

	const start = () => {
		if (!pool) return;
		const rounds = drawRounds(pool, settings.rounds, opener ? [opener] : []);
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
						ready={!!pool?.length}
						onStart={start}
						onEdit={() => setEditing(true)}
						onLeave={session.leave}
					/>
				))}

			{lobby.phase === 'playing' && round && (
				<Round
					key={round.index}
					body={body}
					session={session}
					lobby={lobby}
					round={round}
					settings={settings}
					pool={pool}
					heading={heading}
					mapOpen={mapOpen}
					onMapOpen={onMapOpen}
					onEnd={act('close_round')}
				/>
			)}

			{lobby.phase === 'result' && round && (
				<Result body={body} lobby={lobby} round={round} you={you} onNext={act('next')}>
					<Standings standings={table} you={you} gains />
				</Result>
			)}

			{lobby.phase === 'final' && (
				<FinalScore
					body={body}
					played={played}
					onAgain={hosting && pool?.length ? start : undefined}
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
	body: string;
	session: LobbySession;
	lobby: Lobby;
	round: LobbyRound;
	settings: RunSettings;
	pool: PanoramaEntry[] | null;
	heading: number;
	mapOpen: boolean;
	onMapOpen: (open: boolean) => void;
	/** The host's way of closing a round someone is sitting on. */
	onEnd?: () => void;
}

function Round({
	body,
	session,
	lobby,
	round,
	settings,
	pool,
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
		const seconds = left === null ? null : timedOut ? 0 : left;
		// No pool, no scale to score against: the guess goes in unscored.
		const radius = pool ? radiusKm.current : null;
		setSent(play(at, slim(round.entry), pool ?? [], radius, seconds, timedOut));
	};

	// The clock closes the round on whatever point is picked, as it does solo.
	const expire = useRef(() => {});
	expire.current = () => commit(guess, true);
	useEffect(() => {
		if (left === 0 && !answered) expire.current();
	}, [left, answered]);

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
				body={body}
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
	body: string;
	lobby: Lobby;
	round: LobbyRound;
	you: string | null;
	onNext?: () => void;
	children: ReactNode;
}

function Result({ body, lobby, round, you, onNext, children }: ResultProps) {
	const guesses = lobby.history[round.index];
	const mine = guesses?.[you ?? ''];
	const me = lobby.players.find((seat) => seat.id === you);
	// Held steady across snapshots, which are new objects each time: the map
	// redraws what changes identity.
	const key = JSON.stringify([guesses, lobby.players.map((seat) => seat.name)]);
	const drawn = useMemo(
		() => ({
			truth: round.entry,
			guess: mine?.guess ?? null,
			avatar: me && profileOf(me.name),
			others: lobby.players.flatMap((seat) => {
				const at = seat.id !== you && guesses?.[seat.id]?.guess;
				return at ? [{ at, avatar: profileOf(seat.name) }] : [];
			})
		}),
		[key]
	);

	return (
		<RoundResult
			body={body}
			truth={drawn.truth}
			guess={drawn.guess}
			avatar={drawn.avatar}
			others={drawn.others}
			distanceKm={mine?.distanceKm ?? 0}
			points={mine?.points ?? 0}
			secondsLeft={mine?.secondsLeft ?? null}
			timedOut={mine?.timedOut ?? false}
			round={round.index + 1}
			rounds={round.total}
			onNext={onNext}
		>
			{children}
		</RoundResult>
	);
}

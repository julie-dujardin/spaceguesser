import { useMemo, type ReactNode } from 'react';
import type { LonLat } from 'spacemap';
import { bodyName, bodyOf } from '../game/bodies';
import { roundUrl } from '../game/links';
import type { Round } from '../game/rounds';
import { formatClock, formatDistance, formatWhen } from '../game/rules';
import type { Played } from '../game/run';
import type { Guess } from '../game/scoring';
import type { Profile } from '../game/players';
import { ResultMap } from './ResultMap';

interface Props {
	played: Played;
	round: number;
	rounds: number;
	/** Absent for a player who is not the one moving the game on. */
	onNext?: () => void;
	/** Multiplayer: the face on the reader's guess, and the other guesses. */
	avatar?: Profile;
	others?: { guess: Guess; avatar: Profile }[];
	/** Goes under the score: the standings, in a game that has them. */
	children?: ReactNode;
}

export function coordinates(at: LonLat): string {
	const ns = at.lat >= 0 ? 'N' : 'S';
	const ew = at.lon >= 0 ? 'E' : 'W';
	return `${Math.abs(at.lat).toFixed(3)}° ${ns}  ${Math.abs(at.lon).toFixed(3)}° ${ew}`;
}

/** What is known about where a round was, in the order a reader wants it. */
export function describe(round: Round): string {
	if (round.mode === 'orbit') return `from orbit · ${formatWhen(round.time)}`;
	const { entry } = round;
	const parts: string[] = [];
	if (entry.mission) parts.push(entry.mission[0].toUpperCase() + entry.mission.slice(1));
	if (entry.sol !== undefined) parts.push(`sol ${entry.sol}`);
	// The export's own field, so unreadable only if the export is wrong; a
	// missing date is worth less than the card it would otherwise throw away.
	const day = new Date(entry.time);
	if (!Number.isNaN(day.getTime())) parts.push(day.toISOString().slice(0, 10));
	return parts.join(' · ');
}

/** How far off a guess was, in the words its kind of miss takes. */
export function miss({ guess, score }: Played): string {
	if (!guess) return 'no guess';
	if (score.groundKm !== null) return `${formatDistance(score.groundKm)} off`;
	if (score.spaceKm !== null)
		return `${bodyName(guess.body)} · ${formatDistance(score.spaceKm)} away`;
	return bodyName(guess.body);
}

export function RoundResult({ played, round, rounds, onNext, avatar, others, children }: Props) {
	const { truth, guess, score, secondsLeft, timedOut } = played;
	// Stable, so the map is framed once rather than on every render.
	const placements = useMemo(
		() => [
			{
				truth,
				guess: guess?.body === truth.body ? guess.at : null,
				avatar,
				others: (others ?? []).flatMap((other) =>
					other.guess.body === truth.body && other.guess.at
						? [{ at: other.guess.at, avatar: other.avatar }]
						: []
				)
			}
		],
		[truth, guess, avatar, others]
	);

	return (
		<div className="board">
			{bodyOf(truth.body)?.surface && <ResultMap body={truth.body} rounds={placements} />}
			<div className="rpanel glass">
				<div className="col" style={{ gap: 3 }}>
					<span className="hd">actual location</span>
					<span style={{ fontSize: '13.5px' }}>{bodyName(truth.body)}</span>
					<span className="mono mut" style={{ fontSize: '11.5px' }}>
						{describe(played.round)}
					</span>
					{bodyOf(truth.body)?.surface && (
						<span className="mono dim" style={{ fontSize: '11.5px' }}>
							{coordinates(truth)}
						</span>
					)}
					<a
						className="out mono"
						href={roundUrl(played.round)}
						target="_blank"
						rel="noopener noreferrer"
					>
						show in spacemap
					</a>
				</div>
				<div className="score">
					<b>+{score.points.toLocaleString('en')}</b>
					<span className="mono mut" style={{ fontSize: 12 }}>
						{miss(played)}
						{!timedOut && secondsLeft !== null && ` · ${formatClock(secondsLeft)} left`}
					</span>
				</div>
				{timedOut && (
					<span className="note">
						{guess ? 'time ran out — the last point you picked stood' : 'time ran out'}
					</span>
				)}
				{children}
				<span className="note">
					round {round} of {rounds}
					{!onNext && ' · the host moves on'}
				</span>
				{onNext && (
					<button type="button" className="btn lg" style={{ marginTop: 'auto' }} onClick={onNext}>
						{round < rounds ? 'Next round' : 'See total'}
					</button>
				)}
			</div>
		</div>
	);
}

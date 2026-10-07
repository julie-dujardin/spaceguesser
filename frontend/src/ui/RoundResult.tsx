import { useMemo, type ReactNode } from 'react';
import type { LonLat } from 'spacemap';
import { bodyName, bodyOf } from '../game/bodies';
import type { Space } from '../game/space';
import { roundUrl } from '../game/links';
import type { Round } from '../game/rounds';
import { formatClock, formatDistance, formatNumber, formatWhen } from '../game/rules';
import type { Played } from '../game/run';
import type { Guess } from '../game/scoring';
import type { Profile } from '../game/players';
import * as m from '../paraglide/messages.js';
import { Recap, type RecapGuess } from './Recap';

interface Props {
	space: Space | null;
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
	const ns = at.lat >= 0 ? m.compass_north() : m.compass_south();
	const ew = at.lon >= 0 ? m.compass_east() : m.compass_west();
	return `${formatNumber(Math.abs(at.lat), 3)}° ${ns}  ${formatNumber(Math.abs(at.lon), 3)}° ${ew}`;
}

/** What is known about where a round was, in the order a reader wants it. */
export function describe(round: Round): string {
	if (round.mode === 'orbit') return `${m.from_orbit()} · ${formatWhen(round.time)}`;
	const { entry } = round;
	const parts: string[] = [];
	if (entry.mission) parts.push(entry.mission[0].toUpperCase() + entry.mission.slice(1));
	if (entry.sol !== undefined) parts.push(m.sol({ sol: entry.sol }));
	// Read as text: the export's dates are UTC, and not all of them say so.
	const day = /^\d{4}-\d\d-\d\d/.exec(entry.time)?.[0];
	if (day) parts.push(day);
	return parts.join(' · ');
}

/** How far off a guess was, in the words its kind of miss takes. */
export function miss({ guess, score }: Played): string {
	if (!guess) return m.no_guess();
	if (score.groundKm !== null) return m.miss_off({ distance: formatDistance(score.groundKm) });
	if (score.spaceKm !== null)
		return m.miss_away({ body: bodyName(guess.body), distance: formatDistance(score.spaceKm) });
	return bodyName(guess.body);
}

export function RoundResult({
	space,
	played,
	round,
	rounds,
	onNext,
	avatar,
	others,
	children
}: Props) {
	const { truth, guess, score, secondsLeft, timedOut } = played;
	// Stable, so the recap is set up once rather than on every render.
	const recap = useMemo(() => {
		const guesses: RecapGuess[] = [
			...(others ?? []),
			...(guess ? [{ guess, avatar, mine: true }] : [])
		];
		return [{ round: played.round, truth, guesses }];
	}, [played.round, truth, guess, avatar, others]);

	return (
		<div className="board">
			<Recap space={space} rounds={recap} focus={0} />
			<div className="rpanel glass">
				<div className="col" style={{ gap: 3 }}>
					<span className="hd">{m.actual_location()}</span>
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
						href={roundUrl(played.round, truth)}
						target="_blank"
						rel="noopener noreferrer"
					>
						{m.show_in_spacemap()}
					</a>
				</div>
				<div className="score">
					<b>+{formatNumber(score.points)}</b>
					<span className="mono mut" style={{ fontSize: 12 }}>
						{miss(played)}
						{!timedOut &&
							secondsLeft !== null &&
							` · ${m.time_left({ time: formatClock(secondsLeft) })}`}
					</span>
				</div>
				{timedOut && <span className="note">{guess ? m.timed_out_stood() : m.timed_out()}</span>}
				{children}
				<span className="note">
					{m.round_of({ round, rounds })}
					{!onNext && ` · ${m.host_moves_on()}`}
				</span>
				{onNext && (
					<button type="button" className="btn lg" style={{ marginTop: 'auto' }} onClick={onNext}>
						{round < rounds ? m.next_round() : m.see_total()}
					</button>
				)}
			</div>
		</div>
	);
}

import { useMemo, type ReactNode } from 'react';
import { bodyName, bodyOf } from '../game/bodies';
import { roundUrl } from '../game/links';
import { formatClock } from '../game/rules';
import type { Played } from '../game/run';
import { MAX_POINTS } from '../game/scoring';
import { ResultMap } from './ResultMap';
import { miss } from './RoundResult';

interface Props {
	played: Played[];
	/** Absent for a player who is not the one starting the next game. */
	onAgain?: () => void;
	onHome: () => void;
	/** Goes under the total: the standings, in a game that has them. */
	children?: ReactNode;
}

export function FinalScore({ played, onAgain, onHome, children }: Props) {
	const total = played.reduce((sum, round) => sum + round.score.points, 0);
	const best = played.length * MAX_POINTS;
	// One flat map holds one body: the one most of the run was on.
	const body = useMemo(() => {
		const counts = new Map<string, number>();
		for (const { truth } of played)
			if (bodyOf(truth.body)?.surface) counts.set(truth.body, (counts.get(truth.body) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
	}, [played]);
	const placements = useMemo(
		() =>
			played.map(({ truth, guess }) => ({
				truth,
				guess: guess?.body === truth.body ? guess.at : null,
				hidden: truth.body !== body
			})),
		[played, body]
	);

	return (
		<div className="board">
			{body && <ResultMap body={body} rounds={placements} />}
			<div className="rpanel glass">
				<div className="col" style={{ gap: 3 }}>
					<span className="hd">run complete</span>
					<div className="score">
						<b>{total.toLocaleString('en')}</b>
						<span className="mono mut" style={{ fontSize: 12 }}>
							of {best.toLocaleString('en')} points
						</span>
					</div>
				</div>
				{children}
				<div className="rounds">
					{played.map((round, index) => (
						<a
							className="rk"
							key={index}
							href={roundUrl(round.round)}
							target="_blank"
							rel="noopener noreferrer"
							title="show in spacemap"
						>
							<span className="n">{index + 1}</span>
							<span className="nm">{bodyName(round.truth.body)}</span>
							<span className="mono mut" style={{ fontSize: '11.5px' }}>
								{miss(round)}
							</span>
							{round.secondsLeft !== null && !round.timedOut && (
								<span className="mono dim" style={{ fontSize: '11.5px' }}>
									{formatClock(round.secondsLeft)} left
								</span>
							)}
							<span className="gain">{round.score.points.toLocaleString('en')}</span>
							<span className="go" aria-hidden="true">
								↗
							</span>
						</a>
					))}
				</div>
				<div className="acts">
					{onAgain && (
						<button type="button" className="btn lg" style={{ flex: 1 }} onClick={onAgain}>
							Play again
						</button>
					)}
					<button type="button" className="btn lg ghost" style={{ flex: 1 }} onClick={onHome}>
						Home
					</button>
				</div>
			</div>
		</div>
	);
}

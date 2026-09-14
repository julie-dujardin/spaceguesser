import { panoramaUrl } from '../game/links';
import { MAX_POINTS, formatClock, formatDistance } from '../game/rules';
import type { Played } from '../game/run';
import { ResultMap } from './ResultMap';

interface Props {
	body: string;
	played: Played[];
	onAgain: () => void;
	onHome: () => void;
}

export function FinalScore({ body, played, onAgain, onHome }: Props) {
	const total = played.reduce((sum, round) => sum + round.points, 0);
	const best = played.length * MAX_POINTS;

	return (
		<div className="board">
			<ResultMap body={body} rounds={played} />
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
				<div className="rounds">
					{played.map((round, index) => (
						<a
							className="rk"
							key={round.truth.id}
							href={panoramaUrl(body, round.truth)}
							target="_blank"
							rel="noopener noreferrer"
							title="show in spacemap"
						>
							<span className="n">{index + 1}</span>
							<span className="mono mut" style={{ fontSize: '11.5px' }}>
								{round.guess ? formatDistance(round.distanceKm) : 'no guess'}
							</span>
							{round.secondsLeft !== null && !round.timedOut && (
								<span className="mono dim" style={{ fontSize: '11.5px' }}>
									{formatClock(round.secondsLeft)} left
								</span>
							)}
							<span className="gain">{round.points.toLocaleString('en')}</span>
							<span className="go" aria-hidden="true">
								↗
							</span>
						</a>
					))}
				</div>
				<div className="acts">
					<button type="button" className="btn lg" style={{ flex: 1 }} onClick={onAgain}>
						Play again
					</button>
					<button type="button" className="btn lg ghost" style={{ flex: 1 }} onClick={onHome}>
						Home
					</button>
				</div>
			</div>
		</div>
	);
}

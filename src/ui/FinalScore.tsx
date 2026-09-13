import { MAX_POINTS, formatDistance } from '../game/rules';
import type { Played } from '../game/run';

interface Props {
	played: Played[];
	onAgain: () => void;
	onHome: () => void;
}

export function FinalScore({ played, onAgain, onHome }: Props) {
	const total = played.reduce((sum, round) => sum + round.points, 0);
	const best = played.length * MAX_POINTS;

	return (
		<div className="scrim">
			<div className="card glass panel final">
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
						<div className="rk" key={round.truth.id}>
							<span className="n">{index + 1}</span>
							<span className="mono mut" style={{ fontSize: '11.5px' }}>
								{formatDistance(round.distanceKm)}
							</span>
							<span className="gain">{round.points.toLocaleString('en')}</span>
						</div>
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

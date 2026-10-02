import type { Standing } from '../game/lobby';
import { Avatar } from './Avatar';

interface Props {
	standings: Standing[];
	you: string | null;
	/** Shows what the round just finished added to each total. */
	gains?: boolean;
}

export function Standings({ standings, you, gains }: Props) {
	return (
		<div className="rounds">
			{standings.map(({ seat, profile, total, last }, index) => (
				<div className={`rk${seat.id === you ? ' me' : ''}`} key={seat.id}>
					<span className="n">{index + 1}</span>
					<Avatar profile={profile} />
					<span className={`nm${seat.connected ? '' : ' dim'}`}>{profile.name}</span>
					{gains && (
						<span className="up">{last ? `+${last.score.points.toLocaleString('en')}` : '—'}</span>
					)}
					<span className="tot">{total.toLocaleString('en')}</span>
				</div>
			))}
		</div>
	);
}

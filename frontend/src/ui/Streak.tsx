import { Flame } from 'lucide-react';
import type { Streak, StreakNews } from '../game/history';
import { formatNumber } from '../game/rules';
import * as m from '../paraglide/messages.js';

/** The streak as a recap tells it: how long it now is, or how long the one
 *  just lost was, and how that stands to the best. */
export function StreakLine({ news }: { news: StreakNews }) {
	const { count, ended, best, newBest } = news;
	return (
		<div className={ended ? 'streak over' : 'streak'}>
			<Flame size={14} />
			<span>{m.world_streak()}</span>
			<b>{formatNumber(count)}</b>
			{ended && <span>{m.streak_ended()}</span>}
			{best !== null && (
				<span className={newBest ? 'new' : 'best'}>
					{'· '}
					{!newBest
						? m.streak_best({ best: formatNumber(best) })
						: best === count
							? m.streak_new_best()
							: m.streak_new_best_of({ best: formatNumber(best) })}
				</span>
			)}
		</div>
	);
}

/** The streak as the history keeps it. */
export function StreakField({ streak }: { streak: Streak }) {
	return (
		<div className="field">
			<span className="hd">{m.world_streak()}</span>
			<div className={streak.current ? 'streak' : 'streak over'}>
				<Flame size={14} />
				<b>{formatNumber(streak.current)}</b>
				<span>{m.in_a_row()}</span>
				<span className="best">· {m.streak_best({ best: formatNumber(streak.best) })}</span>
			</div>
		</div>
	);
}

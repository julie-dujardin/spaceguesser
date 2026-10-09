import { useEffect, useRef } from 'react';
import type { Standing } from '../game/lobby';
import { formatNumber } from '../game/rules';
import { Avatar } from './Avatar';

interface Props {
	standings: Standing[];
	you: string | null;
	/** Shows what the round just finished added to each total. */
	gains?: boolean;
}

export function Standings({ standings, you, gains }: Props) {
	const list = useRef<HTMLDivElement>(null);
	const place = standings.findIndex(({ seat }) => seat.id === you);
	// A full lobby is more rows than the panel shows, and the reader's own is
	// the one they look for.
	useEffect(() => {
		const rows = list.current;
		const row = rows?.children[place];
		if (!rows || !(row instanceof HTMLElement)) return;
		rows.scrollTop = row.offsetTop - rows.offsetTop - (rows.clientHeight - row.offsetHeight) / 2;
	}, [place]);

	return (
		<div className="rounds" ref={list}>
			{standings.map(({ seat, profile, total, last }, index) => (
				<div className={`rk${seat.id === you ? ' me' : ''}`} key={seat.id}>
					<span className="n">{index + 1}</span>
					<Avatar profile={profile} />
					<span className={`nm${seat.connected ? '' : ' dim'}`}>{profile.name}</span>
					{gains && (
						<span className="up">{last ? `+${formatNumber(last.score.points)}` : '—'}</span>
					)}
					<span className="tot">{formatNumber(total)}</span>
				</div>
			))}
		</div>
	);
}

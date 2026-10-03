import type { ReactNode } from 'react';
import { formatClock, movementName, type RunSettings } from '../game/rules';

interface Props {
	settings: RunSettings;
	round: number;
	/** How many rounds were drawn, which thin coverage can cut short of what
	 *  the settings asked for. */
	rounds: number;
	/** The round's date, as it is shown. */
	when: string;
	/** Seconds left, or null when the run has no timer. */
	left: number | null;
	onQuit: () => void;
	/** More pills for the top row. */
	children?: ReactNode;
}

export function Hud({ settings, round, rounds, when, left, onQuit, children }: Props) {
	const fraction = left === null ? 1 : left / settings.timer;
	return (
		<>
			<div className="hud-top">
				<span className="pill status">
					<span className="mark">spaceguesser</span>
					<span className="sep" />
					<span className="mono mut">
						round {round + 1} / {rounds}
					</span>
					<span className="sep" />
					<span className="mono mut move">{movementName(settings.movement)}</span>
					<span className="sep" />
					<span className="mono mut when" title="the date of this round">
						{when}
					</span>
				</span>
				{left !== null && (
					<span className="pill glass clock">
						<span className="v">{formatClock(left)}</span>
						<span className="bar">
							<i className={fraction < 0.2 ? 'warn' : ''} style={{ width: `${fraction * 100}%` }} />
						</span>
					</span>
				)}
				{children}
			</div>
			<div className="hud-topr">
				<button type="button" className="btn glassy ico" title="Leave run" onClick={onQuit}>
					×
				</button>
			</div>
		</>
	);
}

import { MOVEMENT_LABELS, formatClock, type RunSettings } from '../game/rules';

interface Props {
	settings: RunSettings;
	round: number;
	/** How many rounds were drawn, which thin coverage can cut short of what
	 *  the settings asked for. */
	rounds: number;
	/** Seconds left, or null when the run has no timer. */
	left: number | null;
	onQuit: () => void;
}

export function Hud({ settings, round, rounds, left, onQuit }: Props) {
	const fraction = left === null ? 1 : left / settings.timer;
	return (
		<>
			<div className="hud-top">
				<span className="pill">
					<span className="mark">spaceguesser</span>
					<span className="sep" />
					<span className="mono mut">
						round {round + 1} / {rounds}
					</span>
					<span className="sep" />
					<span className="mono mut">{MOVEMENT_LABELS[settings.movement]}</span>
				</span>
				{left !== null && (
					<span className="pill glass clock">
						<span className="v">{formatClock(left)}</span>
						<span className="bar">
							<i className={fraction < 0.2 ? 'warn' : ''} style={{ width: `${fraction * 100}%` }} />
						</span>
					</span>
				)}
			</div>
			<div className="hud-topr">
				<button type="button" className="btn glassy ico" title="Leave run" onClick={onQuit}>
					×
				</button>
			</div>
		</>
	);
}

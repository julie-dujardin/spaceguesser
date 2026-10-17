import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatAltitude, formatClock, movementName, type RunSettings } from '../game/rules';
import * as m from '../paraglide/messages.js';

interface Props {
	settings: RunSettings;
	round: number;
	/** How many rounds were drawn, which thin coverage can cut short of what
	 *  the settings asked for. */
	rounds: number;
	/** The round's date, as it is shown; null when the round shows none. */
	when: string | null;
	/** Kilometres over the ground; null when standing on it. */
	altitude: number | null;
	/** Seconds left, or null when the run has no timer. */
	left: number | null;
	onQuit: () => void;
	/** The tutorial's run, named where the movement would be: the reader did
	 *  not pick that one. */
	tutorial?: boolean;
	/** A tip about the round, under the pills. */
	tip?: ReactNode;
	/** More pills for the top row. */
	children?: ReactNode;
}

export function Hud({
	settings,
	round,
	rounds,
	when,
	altitude,
	left,
	onQuit,
	tutorial,
	tip,
	children
}: Props) {
	const fraction = left === null ? 1 : left / settings.timer;
	return (
		<>
			<div className="hud-top">
				<span className="pill status">
					<span className="mark">spaceguesser</span>
					<span className="sep" />
					<span className="mono mut">{m.hud_round({ round: round + 1, rounds })}</span>
					<span className="sep" />
					{tutorial ? (
						<span className="mono lesson">{m.hud_tutorial()}</span>
					) : (
						<span className="mono mut move">{movementName(settings.movement)}</span>
					)}
				</span>
				{(altitude !== null || when !== null) && (
					<span className="pill status view">
						{altitude !== null && (
							<span className="mono mut">
								{m.hud_altitude({ altitude: formatAltitude(altitude) })}
							</span>
						)}
						{altitude !== null && when !== null && <span className="sep" />}
						{when !== null && (
							<span className="mono mut" title={m.hud_date_title()}>
								{when}
							</span>
						)}
					</span>
				)}
				{left !== null && (
					<span className="pill glass clock">
						<span className="v">{formatClock(left)}</span>
						<span className="bar">
							<i className={fraction < 0.2 ? 'warn' : ''} style={{ width: `${fraction * 100}%` }} />
						</span>
					</span>
				)}
				{children}
				{tip && <div className="tip-row">{tip}</div>}
			</div>
			<Quit onQuit={onQuit} />
		</>
	);
}

/** The way out of a run, on a round and on its result alike. */
export function Quit({ onQuit }: { onQuit: () => void }) {
	return (
		<div className="hud-topr">
			<button
				type="button"
				className="btn glassy ico"
				title={m.leave_run()}
				aria-label={m.leave_run()}
				onClick={onQuit}
			>
				<X size={16} />
			</button>
		</div>
	);
}

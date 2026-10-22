import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
	/** The reader reached for the tip, which is about the view. */
	onTip?: () => void;
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
	onTip,
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
				{tip && (
					<div className="tip-row" onPointerDown={onTip}>
						{tip}
					</div>
				)}
			</div>
			<Quit onQuit={onQuit} />
		</>
	);
}

/** The way out of a run, on a round and on its result alike. It asks first: the
 *  corner is where a stray click lands, and a run left is gone. */
export function Quit({ onQuit, children }: { onQuit: () => void; children?: ReactNode }) {
	const [asking, setAsking] = useState(false);

	useEffect(() => {
		if (!asking) return;
		const key = (event: KeyboardEvent) => event.key === 'Escape' && setAsking(false);
		window.addEventListener('keydown', key);
		return () => window.removeEventListener('keydown', key);
	}, [asking]);

	return (
		<>
			<div className="hud-topr">
				{children}
				<button
					type="button"
					className="btn glassy ico"
					title={m.leave_run()}
					aria-label={m.leave_run()}
					onClick={() => setAsking(true)}
				>
					<X size={16} />
				</button>
			</div>
			{/* Over everything on the page, so nothing else takes a click meanwhile. */}
			{asking &&
				createPortal(
					<div
						className="scrim over"
						onPointerDown={(event) => event.target === event.currentTarget && setAsking(false)}
					>
						<div
							className="card glass panel"
							role="alertdialog"
							aria-modal="true"
							aria-labelledby="leave-confirm"
							style={{ width: 320 }}
						>
							<h2 id="leave-confirm">{m.leave_confirm()}</h2>
							<div className="acts">
								<button
									type="button"
									className="btn lg ghost"
									style={{ flex: 1 }}
									autoFocus
									onClick={() => setAsking(false)}
								>
									{m.cancel()}
								</button>
								<button type="button" className="btn lg" style={{ flex: 1 }} onClick={onQuit}>
									{m.leave()}
								</button>
							</div>
						</div>
					</div>,
					document.body
				)}
		</>
	);
}

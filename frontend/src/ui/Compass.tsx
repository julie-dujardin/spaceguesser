/** Which way the view faces, as a strip of the horizon under a fixed mark. */

import * as m from '../paraglide/messages.js';

/** Degrees either side of the heading to draw, more than the strip's width
 *  shows. */
const SPAN = 90;
/** Pixels per degree. */
const SCALE = 2.4;
const TICK = 5;

function label(deg: number): { text: string; kind: 'cardinal' | 'inter' | 'deg' } | null {
	const n = m.compass_north();
	const s = m.compass_south();
	const e = m.compass_east();
	const w = m.compass_west();
	const cardinal = [n, e, s, w];
	const inter = [n + e, s + e, s + w, n + w];
	if (deg % 90 === 0) return { text: cardinal[deg / 90], kind: 'cardinal' };
	if (deg % 45 === 0) return { text: inter[(deg - 45) / 90], kind: 'inter' };
	if (deg % 15 === 0) return { text: String(deg), kind: 'deg' };
	return null;
}

export function Compass({ heading }: { heading: number }) {
	const ticks = [];
	for (let deg = Math.ceil((heading - SPAN) / TICK) * TICK; deg <= heading + SPAN; deg += TICK) {
		const wrapped = ((deg % 360) + 360) % 360;
		const named = label(wrapped);
		ticks.push(
			<span
				key={deg}
				className={`t${wrapped % 15 === 0 ? ' major' : ''}${named ? ` ${named.kind}` : ''}`}
				style={{ left: `calc(50% + ${(deg - heading) * SCALE}px)` }}
			>
				{named && <b>{named.text}</b>}
			</span>
		);
	}
	return (
		<div className="compass-row">
			<div
				className="compass"
				role="img"
				aria-label={m.guess_heading({
					degrees: String(Math.round(heading) % 360).padStart(3, '0')
				})}
			>
				<div className="strip">{ticks}</div>
				<i className="mark" />
			</div>
		</div>
	);
}

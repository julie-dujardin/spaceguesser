/** Which way the view faces, as a strip of the horizon under a fixed needle. */

import { useMemo } from 'react';
import { formatHeading, wrapDeg } from '../game/rules';
import * as m from '../paraglide/messages.js';

/** Pixels per degree. */
const SCALE = 2.4;
/** Degrees drawn past each end of the circle, so every heading has ticks to
 *  the edges of the strip: at least half its CSS width over SCALE. */
const SPAN = 90;
const TICK = 5;

/** Every tick round the circle and past it, laid out once: turning only slides
 *  the strip. */
function Ticks() {
	const n = m.compass_north();
	const s = m.compass_south();
	const e = m.compass_east();
	const w = m.compass_west();
	const cardinal = [n, e, s, w];
	const inter = [n + e, s + e, s + w, n + w];
	const ticks = [];
	for (let deg = -SPAN; deg <= 360 + SPAN; deg += TICK) {
		const at = wrapDeg(deg);
		const [text, kind] =
			at % 90 === 0
				? [cardinal[at / 90], 'cardinal']
				: at % 45 === 0
					? [inter[(at - 45) / 90], 'inter']
					: at % 15 === 0
						? [String(at), 'deg']
						: [null, ''];
		ticks.push(
			<span
				key={deg}
				className={`t${at % 15 === 0 ? ' major' : ''}${kind ? ` ${kind}` : ''}`}
				style={{ left: deg * SCALE }}
			>
				{text && <b>{text}</b>}
			</span>
		);
	}
	return ticks;
}

/** Laid out with or without a heading, so the pills beside it stay put. */
export function Compass({ heading }: { heading: number | null }) {
	const ticks = useMemo(() => <Ticks />, []);
	return (
		<div className="compass-row">
			<div
				className={`compass${heading === null ? ' off' : ''}`}
				role="img"
				aria-label={heading === null ? undefined : formatHeading(heading)}
				aria-hidden={heading === null}
			>
				<div className="window">
					<div
						className="strip"
						style={{ transform: `translateX(${-wrapDeg(heading ?? 0) * SCALE}px)` }}
					>
						{ticks}
					</div>
				</div>
				<i className="needle" />
			</div>
		</div>
	);
}

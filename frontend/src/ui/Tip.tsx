/** A tutorial tip: what to do next, or what to look for. */

import { useMemo } from 'react';
import type { Tip } from '../game/tutorial';
import * as m from '../paraglide/messages.js';

interface Props {
	tip: Tip;
	/** Its place among the round's tips. */
	index: number;
	count: number;
	/** The wait that moves on to the next tip, while it runs. */
	countdown: { end: number; ms: number } | null;
	onDone: () => void;
	/** Back to the tip before this one. */
	onBack: () => void;
	/** No more tips for the rest of the run. */
	onHide: () => void;
}

/** A step's mark and the gap after it, in pixels. */
const STEP = 18;
const GAP = 4;

export function TipCard({ tip, index, count, countdown, onDone, onBack, onHide }: Props) {
	// Read once: a delay moved on a later render would jump the fill ahead.
	const start = countdown && countdown.end - countdown.ms;
	const elapsed = useMemo(() => (start === null ? 0 : Date.now() - start), [start]);
	return (
		<div className={`tip at-${tip.at}`} role="status">
			<div className="top">
				<span className="hd">{count > 1 ? m.tip_count({ n: index + 1, count }) : m.tip_one()}</span>
				{count > 1 && (
					// One drawing, so no mark can land on a pixel row of its own.
					<svg className="steps" width={count * STEP - GAP} height="3" aria-hidden="true">
						{Array.from({ length: count }, (_, i) => (
							<rect
								key={i}
								x={i * STEP}
								width={STEP - GAP}
								height="3"
								rx="1.5"
								className={i <= index ? 'on' : ''}
							/>
						))}
						{countdown && index + 1 < count && (
							<rect
								className="fill"
								x={(index + 1) * STEP}
								width={STEP - GAP}
								height="3"
								rx="1.5"
								style={{ animationDuration: `${countdown.ms}ms`, animationDelay: `${-elapsed}ms` }}
							/>
						)}
					</svg>
				)}
			</div>
			{tip.lines.map((line, i) => (
				<p key={i}>{line()}</p>
			))}
			<div className="acts">
				<button type="button" className="quiet" onClick={onHide}>
					{m.tips_hide()}
				</button>
				<span className="row" style={{ gap: 6 }}>
					{index > 0 && (
						<button type="button" className="btn ghost" onClick={onBack}>
							{m.tip_previous()}
						</button>
					)}
					<button type="button" className="btn" onClick={onDone}>
						{m.tip_got_it()}
					</button>
				</span>
			</div>
		</div>
	);
}

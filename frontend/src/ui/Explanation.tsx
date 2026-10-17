/** What a tutorial round's recap adds: the score in its three parts, and what
 *  gave the place away. */

import { ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { BODIES } from '../game/bodies';
import { SITE } from '../game/links';
import { formatNumber } from '../game/rules';
import { TIERS, type Score } from '../game/scoring';
import * as m from '../paraglide/messages.js';

const PARTS = [
	{ tier: 'system', label: m.score_system },
	{ tier: 'body', label: m.score_body },
	{ tier: 'surface', label: m.score_place }
] as const;

interface Props {
	score: Score;
	/** A paragraph each. */
	lines: (() => string)[];
}

export function Explanation({ score, lines }: Props) {
	return (
		<div className="lesson">
			<div className="split">
				{PARTS.map(({ tier, label }) => (
					<Fragment key={tier}>
						<span className="k">{label()}</span>
						<span className="meter">
							<i style={{ width: `${(100 * score[tier]) / TIERS[tier]}%` }} />
						</span>
						<span className="v">
							<b>{formatNumber(score[tier])}</b> / {formatNumber(TIERS[tier])}
						</span>
					</Fragment>
				))}
			</div>
			{lines.length > 0 && (
				<div className="why">
					<span className="hd">{m.recap_gave_away()}</span>
					{lines.map((line, i) => (
						<p key={i}>{line()}</p>
					))}
				</div>
			)}
		</div>
	);
}

/** What the tutorial's end card says comes next. */
export function Onward({ panoramas }: { panoramas: number }) {
	// The link and the icon go where the sentence puts them, in whatever language.
	const parts = m.tutorial_more({ site: '\u0000', icon: '\u0001' }).split(/([\u0000\u0001])/);
	return (
		<div className="why">
			<span className="hd">{m.tutorial_next_title()}</span>
			<p>{m.tutorial_next({ panoramas: formatNumber(panoramas), bodies: BODIES.length })}</p>
			<p>
				{parts.map((part, i) =>
					part === '\u0000' ? (
						<a key={i} href={SITE} target="_blank" rel="noopener noreferrer">
							spacemap.co
						</a>
					) : part === '\u0001' ? (
						<ExternalLink key={i} size="1em" role="img" aria-label={m.show_in_spacemap()} />
					) : (
						part
					)
				)}
			</p>
		</div>
	);
}

/** What a tutorial round's recap adds: the score in its three parts, and what
 *  gave the place away. */

import { ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { POOLS } from '../game/bodies';
import { SITE } from '../game/links';
import { QUICK_PLAY, formatNumber } from '../game/rules';
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
	/** The guess was not on the right world. */
	offWorld: boolean;
}

function SiteLink() {
	return (
		<a href={SITE} target="_blank" rel="noopener noreferrer">
			spacemap.co
		</a>
	);
}

/** Points a reader short of ideas at the map of the solar system. */
export function NoIdea() {
	// The link goes where the sentence puts it, in whatever language.
	const [before, after] = m.tutorial_no_idea({ site: '\u0000' }).split('\u0000');
	return (
		<>
			{before}
			<SiteLink />
			{after}
		</>
	);
}

export function Explanation({ score, lines, offWorld }: Props) {
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
					{offWorld && (
						<p>
							<NoIdea />
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/** What the tutorial's end card says comes next. */
export function Onward({ panoramas }: { panoramas: number }) {
	// As in NoIdea, with an icon too.
	const parts = m.tutorial_more({ site: '\u0000', icon: '\u0001' }).split(/([\u0000\u0001])/);
	return (
		<div className="why">
			<span className="hd">{m.tutorial_next_title()}</span>
			<p>
				{m.tutorial_next({
					panoramas: formatNumber(panoramas),
					bodies: POOLS[QUICK_PLAY.difficulty].length
				})}
			</p>
			<p>
				{parts.map((part, i) =>
					part === '\u0000' ? (
						<SiteLink key={i} />
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

import type { ReactNode } from 'react';
import { REPO } from '../game/links';
import { QUICK_PLAY } from '../game/rules';
import * as m from '../paraglide/messages.js';

interface Props {
	onQuickPlay: () => void;
	onCustom: () => void;
	/** Absent in a build with no multiplayer server to talk to. */
	onFriends?: () => void;
	ready: boolean;
	/** Something the reader should know on landing here. */
	notice?: ReactNode;
}

export function Home({ onQuickPlay, onCustom, onFriends, ready, notice }: Props) {
	return (
		<div className="scrim">
			<div className="card glass home">
				<div className="aside">
					{onFriends && (
						<button type="button" className="mode" onClick={onFriends}>
							<span className="t">{m.play_with_friends()}</span>
						</button>
					)}
					<button type="button" className="mode" onClick={onCustom}>
						<span className="t">{m.custom_run()}</span>
					</button>
				</div>
				<div className="main">
					<h1>spaceguesser</h1>
					<p className="lede">
						<span>{m.home_lede_where()}</span>
						<span>{m.home_lede_how()}</span>
					</p>
					<button type="button" className="start" onClick={onQuickPlay} disabled={!ready}>
						<span className="t">{m.quick_play()}</span>
						<span className="d">
							{m.rules_rounds({ count: QUICK_PLAY.rounds })} · {m.rules_no_timer()}
						</span>
					</button>
					{!ready && <span className="note">{m.finding_somewhere_to_stand()}</span>}
					{notice && <span className="note">{notice}</span>}
					<a className="out mono" href={REPO} target="_blank" rel="noopener noreferrer">
						{m.source_on_github()}
					</a>
				</div>
			</div>
		</div>
	);
}

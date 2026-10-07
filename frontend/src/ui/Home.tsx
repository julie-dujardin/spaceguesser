import { useState, type ReactNode } from 'react';
import { REPO } from '../game/links';
import { recallProfile } from '../game/players';
import { QUICK_PLAY } from '../game/rules';
import * as m from '../paraglide/messages.js';
import { Avatar } from './Avatar';

interface Props {
	onQuickPlay: () => void;
	onCustom: () => void;
	/** Absent in a build with no multiplayer server to talk to. */
	onFriends?: () => void;
	/** How many runs the history holds, and the way to it. */
	runs: number;
	onHistory: () => void;
	ready: boolean;
	/** Something the reader should know on landing here. */
	notice?: ReactNode;
}

export function Home({ onQuickPlay, onCustom, onFriends, runs, onHistory, ready, notice }: Props) {
	const [profile] = useState(recallProfile);
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
					{runs > 0 && (
						<div className="who">
							<div className="rule" />
							<button type="button" className="mode" title={m.past_runs()} onClick={onHistory}>
								<Avatar profile={profile} />
								<span className="t nm">{profile.name || m.history()}</span>
								<span className="mono dim tag">{m.runs_count({ count: runs })}</span>
							</button>
						</div>
					)}
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

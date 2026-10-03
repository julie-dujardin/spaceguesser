import type { ReactNode } from 'react';
import { REPO } from '../game/links';
import { QUICK_PLAY } from '../game/rules';

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
							<span className="t">Play with friends</span>
						</button>
					)}
					<button type="button" className="mode" onClick={onCustom}>
						<span className="t">Custom run</span>
					</button>
				</div>
				<div className="main">
					<h1>spaceguesser</h1>
					<p className="lede">
						<span>Figure out where you are in the solar system.</span>
						<span>Look around, then place your guess on the map.</span>
					</p>
					<button type="button" className="start" onClick={onQuickPlay} disabled={!ready}>
						<span className="t">Quick play</span>
						<span className="d">{QUICK_PLAY.rounds} rounds · no timer</span>
					</button>
					{!ready && <span className="note">finding somewhere to stand…</span>}
					{notice && <span className="note">{notice}</span>}
					<a className="out mono" href={REPO} target="_blank" rel="noopener noreferrer">
						source on github
					</a>
				</div>
			</div>
		</div>
	);
}

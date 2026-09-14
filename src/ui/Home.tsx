import { REPO } from '../game/links';
import { QUICK_PLAY } from '../game/rules';

interface Props {
	onQuickPlay: () => void;
	onCustom: () => void;
	ready: boolean;
}

export function Home({ onQuickPlay, onCustom, ready }: Props) {
	return (
		<div className="scrim">
			<div className="card glass home">
				<h1>spaceguesser</h1>
				<p className="lede">
					Figure out where you are in the solar system. Look around, then place your guess on the
					map.
				</p>
				<button type="button" className="start" onClick={onQuickPlay} disabled={!ready}>
					<span className="t">Quick play</span>
					<span className="d">{QUICK_PLAY.rounds} rounds · no timer</span>
				</button>
				<button type="button" className="btn ghost" onClick={onCustom} disabled={!ready}>
					Custom run
				</button>
				{!ready && <span className="note">finding somewhere to stand…</span>}
				<a className="out mono" href={REPO} target="_blank" rel="noopener noreferrer">
					source on github
				</a>
			</div>
		</div>
	);
}

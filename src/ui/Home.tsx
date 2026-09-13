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
				<div className="aside">
					<span className="hd">other modes</span>
					<button type="button" className="mode" disabled>
						<span className="t">Daily challenge</span>
						<span className="d">not yet</span>
					</button>
					<button type="button" className="mode" disabled>
						<span className="t">Play with friends</span>
						<span className="d">not yet</span>
					</button>
					<button type="button" className="mode" onClick={onCustom}>
						<span className="t">Custom run</span>
						<span className="d">set the rules</span>
					</button>
				</div>
				<div className="main">
					<h1>spaceguesser</h1>
					<p className="lede">
						Figure out where you are in the solar system. Look around, then place your guess on the
						map.
					</p>
					<button type="button" className="start" onClick={onQuickPlay} disabled={!ready}>
						<span className="t">Quick play</span>
						<span className="d">{QUICK_PLAY.rounds} rounds · no timer</span>
					</button>
					{!ready && <span className="note">finding somewhere to stand…</span>}
				</div>
			</div>
		</div>
	);
}

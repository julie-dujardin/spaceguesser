import { LoaderCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { REPO } from '../game/links';
import { recallProfile } from '../game/players';
import { QUICK_PLAY } from '../game/rules';
import { TUTORIAL } from '../game/tutorial';
import * as m from '../paraglide/messages.js';
import { Avatar } from './Avatar';

interface Props {
	onQuickPlay: () => void;
	onTutorial: () => void;
	onCustom: () => void;
	/** Absent with no multiplayer server to talk to. */
	onFriends?: () => void;
	/** How many runs the history holds, and the way to it. */
	runs: number;
	onHistory: () => void;
	ready: boolean;
	/** Something the reader should know on landing here. */
	notice?: ReactNode;
}

interface Way {
	go: () => void;
	name: string;
	rules: string;
}

export function Home({
	onQuickPlay,
	onTutorial,
	onCustom,
	onFriends,
	runs,
	onHistory,
	ready,
	notice
}: Props) {
	const [profile] = useState(recallProfile);
	const quick: Way = {
		go: onQuickPlay,
		name: m.quick_play(),
		rules: `${m.rules_rounds({ count: QUICK_PLAY.rounds })} · ${m.rules_no_timer()}`
	};
	const tutorial: Way = {
		go: onTutorial,
		name: m.tutorial(),
		rules: m.rules_set_rounds({ count: TUTORIAL.rounds })
	};
	// Until a run is finished here, the tutorial is the way in. After, it is
	// one more way to play, at the end of the list.
	const [lead, aside] = runs ? [quick, tutorial] : [tutorial, quick];
	const other = (
		<button type="button" className="mode" onClick={aside.go} disabled={!ready}>
			<span className="t">
				{aside.name}
				{!ready && <LoaderCircle className="spin" size="1em" />}
			</span>
			<span className="d">{aside.rules}</span>
		</button>
	);
	return (
		<div className="scrim">
			<div className="card glass home">
				<div className="aside">
					{!runs && other}
					{onFriends && (
						<button type="button" className="mode" onClick={onFriends}>
							<span className="t">{m.play_with_friends()}</span>
						</button>
					)}
					<button type="button" className="mode" onClick={onCustom}>
						<span className="t">{m.custom_run()}</span>
					</button>
					{runs > 0 && other}
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
					<button type="button" className="start" onClick={lead.go} disabled={!ready}>
						<span className="t">
							{!ready && <LoaderCircle className="spin" size="1em" />}
							{lead.name}
						</span>
						<span className="d">{lead.rules}</span>
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

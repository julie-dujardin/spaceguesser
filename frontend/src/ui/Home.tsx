import { Check, Clock, LoaderCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { DAILY } from '../game/daily';
import { REPO } from '../game/links';
import { recallProfile } from '../game/players';
import { QUICK_PLAY, formatCountdown } from '../game/rules';
import { TUTORIAL } from '../game/tutorial';
import * as m from '../paraglide/messages.js';
import { Avatar } from './Avatar';

/** The daily challenge of the current day. */
export interface DailyDoor {
	/** Not yet started in this browser. */
	open: boolean;
	/** When the day ends, in epoch milliseconds. */
	ends: number;
	go: () => void;
}

interface Props {
	onQuickPlay: () => void;
	/** Absent when there is no challenge today. */
	daily?: DailyDoor;
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
	clock?: string;
}

function Ticking({ text }: { text: string }) {
	return (
		<span className="d left">
			<Clock size="1em" />
			{text}
		</span>
	);
}

export function Home({
	onQuickPlay,
	daily,
	onTutorial,
	onCustom,
	onFriends,
	runs,
	onHistory,
	ready,
	notice
}: Props) {
	const [profile] = useState(recallProfile);
	const [now, setNow] = useState(Date.now);
	const counting = !!daily;
	useEffect(() => {
		if (!counting) return;
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, [counting]);
	const left = daily ? formatCountdown((daily.ends - now) / 1000) : '';
	const challenge: Way | null = daily?.open
		? {
				go: daily.go,
				name: m.daily_challenge(),
				rules: `${m.rules_rounds({ count: DAILY.rounds })} · ${m.rules_timer({ seconds: DAILY.timer })}`,
				clock: m.daily_ends_in({ time: left })
			}
		: null;
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
	// one more way to play, at the end of the list, and the challenge of the
	// day leads until it is started.
	const lead = !runs ? tutorial : (challenge ?? quick);
	const entry = (way: Way) => (
		<button type="button" className="mode" onClick={way.go} disabled={!ready}>
			<span className="t">
				{way.name}
				{!ready && <LoaderCircle className="spin" size="1em" />}
			</span>
			<span className="d">{way.rules}</span>
			{way.clock && <Ticking text={way.clock} />}
		</button>
	);
	const spent = daily && !daily.open && (
		<div className="mode spent" title={m.daily_played()}>
			<span className="t">
				{m.daily_challenge()}
				<Check className="ok" size="1em" aria-label={m.daily_played()} />
			</span>
			<Ticking text={m.daily_next_in({ time: left })} />
		</div>
	);
	return (
		<div className="scrim">
			<div className="card glass home">
				<div className="aside">
					{!runs && (challenge ? entry(challenge) : spent)}
					{!runs && entry(quick)}
					{runs > 0 && (challenge ? entry(quick) : spent)}
					{onFriends && (
						<button type="button" className="mode" onClick={onFriends}>
							<span className="t">{m.play_with_friends()}</span>
						</button>
					)}
					<button type="button" className="mode" onClick={onCustom}>
						<span className="t">{m.custom_run()}</span>
					</button>
					{runs > 0 && entry(tutorial)}
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
						{lead.clock && <Ticking text={lead.clock} />}
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

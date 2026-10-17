import { Check, ExternalLink, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { bodyName } from '../game/bodies';
import { KIND_LABELS, describePast, formatDay, kindOf, type PastRun } from '../game/history';
import { roundUrl } from '../game/links';
import { formatClock, formatNumber } from '../game/rules';
import type { Played } from '../game/run';
import { MAX_POINTS } from '../game/scoring';
import type { Space } from '../game/space';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { Recap, type RecapGuess } from './Recap';
import { miss } from './RoundResult';

interface Props {
	space: Space | null;
	played: Played[];
	/** Multiplayer: everyone else's guesses in a round, shown when it is the
	 *  one looked at. */
	others?: (round: number) => RecapGuess[];
	/** The face on the reader's own guesses. */
	avatar?: RecapGuess['avatar'];
	/** The path of the link to this run, where it has one to hand out. */
	share?: string;
	/** Someone's run, looked at from its link. */
	shared?: boolean;
	/** The reader's own run, looked at from the history. */
	past?: PastRun;
	/** Absent for a player who is not the one starting the next game. */
	onAgain?: () => void;
	/** The tutorial, which leads on to a quick play rather than to itself. */
	tutorial?: boolean;
	/** Over the buttons: what the first of them leads to. */
	ahead?: ReactNode;
	onHome: () => void;
	/** Goes under the total: the standings, in a game that has them. */
	children?: ReactNode;
}

export function FinalScore({
	space,
	played,
	others,
	avatar,
	share,
	shared,
	past,
	onAgain,
	tutorial,
	ahead,
	onHome,
	children
}: Props) {
	const total = played.reduce((sum, round) => sum + round.score.points, 0);
	const best = played.length * MAX_POINTS;
	// A run among friends also says where it left the reader.
	const then =
		past &&
		[
			formatDay(past.at, true),
			KIND_LABELS[kindOf(past)]().toLocaleLowerCase(getLocale()),
			...(past.of === undefined ? [] : [describePast(past)])
		].join(' · ');
	const [copied, setCopied] = useState(false);
	/** The round looked at by itself; null for the whole run on one map. */
	const [focus, setFocus] = useState<number | null>(null);
	const recap = useMemo(
		() =>
			played.map(({ round, truth, guess }, index) => ({
				round,
				truth,
				guesses: [
					// Everyone's guesses are a crowd on the whole run's map, and the
					// point of looking at one round.
					...(focus === index ? (others?.(index) ?? []) : []),
					...(guess ? [{ guess, avatar: focus === index ? avatar : undefined, mine: true }] : [])
				]
			})),
		[played, others, avatar, focus]
	);

	const send = () => {
		const url = location.origin + share;
		// A phone has a sheet of its own for this, and nowhere to paste from.
		if (navigator.share && matchMedia('(pointer: coarse)').matches) {
			const text = m.share_text({ points: formatNumber(total), best: formatNumber(best) });
			// Closing the sheet is a rejection, and nothing went wrong.
			void navigator.share({ text, url }).catch(() => {});
			return;
		}
		void navigator.clipboard?.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		});
	};

	return (
		<div className="board">
			{/* A game nobody answered a round of has nowhere to fly to. */}
			{recap.length > 0 && <Recap space={space} rounds={recap} focus={focus} />}
			<div className="rpanel glass">
				<div className="col" style={{ gap: 3 }}>
					<span className="hd">
						{shared
							? m.shared_run()
							: (then ?? (tutorial ? m.tutorial_complete() : m.run_complete()))}
					</span>
					<div className="score">
						<b>{formatNumber(total)}</b>
						<span className="mono mut" style={{ fontSize: 12 }}>
							{m.of_points({ best: formatNumber(best) })}
						</span>
					</div>
				</div>
				{children}
				<div className="rounds">
					{played.map((round, index) => (
						<div
							className={`rk pick round${focus === index ? ' on' : ''}`}
							key={index}
							role="button"
							tabIndex={0}
							aria-pressed={focus === index}
							title={focus === index ? m.focus_run() : m.focus_round()}
							onClick={() => setFocus(focus === index ? null : index)}
							onKeyDown={(event) => {
								// A key on the link inside the row is the link's.
								if (event.target !== event.currentTarget) return;
								if (event.key !== 'Enter' && event.key !== ' ') return;
								event.preventDefault();
								setFocus(focus === index ? null : index);
							}}
						>
							<span className="n">{index + 1}</span>
							<span className="nm">{bodyName(round.truth.body)}</span>
							{round.guess?.body === round.truth.body && (
								<Check className="ok" size={14} role="img" aria-label={m.right_world()} />
							)}
							{round.secondsLeft !== null && !round.timedOut && (
								<span className="mono dim spare">
									{m.time_left({ time: formatClock(round.secondsLeft) })}
								</span>
							)}
							<span className="gain">{formatNumber(round.score.points)}</span>
							<a
								className="go"
								href={roundUrl(round.round, round.truth)}
								target="_blank"
								rel="noopener noreferrer"
								title={m.show_in_spacemap()}
								aria-label={m.show_in_spacemap()}
								onClick={(event) => event.stopPropagation()}
							>
								<ExternalLink size={12} />
							</a>
							<Guessed round={round} />
						</div>
					))}
				</div>
				{ahead}
				<div className="acts">
					{onAgain && (
						<button
							type="button"
							className="btn lg"
							// Beside a share button it takes a row to itself: it leads.
							style={{ flex: share ? '1 0 100%' : 1 }}
							onClick={onAgain}
						>
							{tutorial ? m.quick_play() : m.play_again()}
						</button>
					)}
					{share && (
						<button type="button" className="btn lg ghost" style={{ flex: 1 }} onClick={send}>
							{copied ? m.link_copied() : m.share()}
						</button>
					)}
					<button
						type="button"
						className={`btn lg${shared ? '' : ' ghost'}`}
						style={{ flex: 1 }}
						onClick={onHome}
					>
						{shared ? m.play() : past ? m.history() : m.home()}
					</button>
				</div>
			</div>
		</div>
	);
}

/** What a round's guess was, under its world, crossed out when it named
 *  another world. The right world with no place on it has its check, which
 *  says all there is. */
function Guessed({ round }: { round: Played }) {
	const { guess, truth, score } = round;
	if (guess?.body === truth.body && score.groundKm === null) return null;
	return (
		<span className="mono mut miss">
			{guess && guess.body !== truth.body && (
				<X className="off" size={12} role="img" aria-label={m.wrong_world()} />
			)}
			{miss(round)}
		</span>
	);
}

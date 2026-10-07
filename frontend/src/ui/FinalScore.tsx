import { useMemo, useState, type ReactNode } from 'react';
import { bodyName } from '../game/bodies';
import { roundUrl } from '../game/links';
import { formatClock } from '../game/rules';
import type { Played } from '../game/run';
import { MAX_POINTS } from '../game/scoring';
import type { Space } from '../game/space';
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
	/** Absent for a player who is not the one starting the next game. */
	onAgain?: () => void;
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
	onAgain,
	onHome,
	children
}: Props) {
	const total = played.reduce((sum, round) => sum + round.score.points, 0);
	const best = played.length * MAX_POINTS;
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
			const text = `${total.toLocaleString('en')} of ${best.toLocaleString('en')} points on spaceguesser`;
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
			<Recap space={space} rounds={recap} focus={focus} />
			<div className="rpanel glass">
				<div className="col" style={{ gap: 3 }}>
					<span className="hd">{shared ? 'shared run' : 'run complete'}</span>
					<div className="score">
						<b>{total.toLocaleString('en')}</b>
						<span className="mono mut" style={{ fontSize: 12 }}>
							of {best.toLocaleString('en')} points
						</span>
					</div>
				</div>
				{children}
				<div className="rounds">
					{played.map((round, index) => (
						<div
							className={`rk pick${focus === index ? ' on' : ''}`}
							key={index}
							role="button"
							tabIndex={0}
							aria-pressed={focus === index}
							title={focus === index ? 'back to the whole run' : 'look at this round'}
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
							<span className="mono mut miss">{miss(round)}</span>
							{round.secondsLeft !== null && !round.timedOut && (
								<span className="mono dim" style={{ fontSize: '11.5px' }}>
									{formatClock(round.secondsLeft)} left
								</span>
							)}
							<span className="gain">{round.score.points.toLocaleString('en')}</span>
							<a
								className="go"
								href={roundUrl(round.round, round.truth)}
								target="_blank"
								rel="noopener noreferrer"
								title="show in spacemap"
								aria-label="show in spacemap"
								onClick={(event) => event.stopPropagation()}
							>
								↗
							</a>
						</div>
					))}
				</div>
				<div className="acts">
					{onAgain && (
						<button
							type="button"
							className="btn lg"
							// Beside a share button it takes a row to itself: it leads.
							style={{ flex: share ? '1 0 100%' : 1 }}
							onClick={onAgain}
						>
							Play again
						</button>
					)}
					{share && (
						<button type="button" className="btn lg ghost" style={{ flex: 1 }} onClick={send}>
							{copied ? 'Link copied' : 'Share'}
						</button>
					)}
					<button
						type="button"
						className={`btn lg${shared ? '' : ' ghost'}`}
						style={{ flex: 1 }}
						onClick={onHome}
					>
						{shared ? 'Play' : 'Home'}
					</button>
				</div>
			</div>
		</div>
	);
}

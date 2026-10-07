import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
	KIND_LABELS,
	dayOf,
	describePast,
	formatDay,
	kindOf,
	weeksOf,
	type Day,
	type PastRun
} from '../game/history';
import { recallProfile } from '../game/players';
import { describeRun, formatNumber } from '../game/rules';
import * as m from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import { Avatar } from './Avatar';

interface Props {
	runs: PastRun[];
	/** Something the reader should know on landing here. */
	notice?: ReactNode;
	onOpen: (run: PastRun) => void;
	onEdit: () => void;
	onClear: () => void;
	onBack: () => void;
}

/** Half a year: what the card is wide enough for at its widest. */
const WEEKS = 26;
/** A day's square and the gap to the next, as the stylesheet draws them. */
const DAY_PX = 14;
const GAP_PX = 3;
/** A day with this many runs is as full as a day gets. */
const FULL = 4;

/** The days of a week from its Monday, every other one named: that is all
 *  there is room for down the side. */
function weekdays(): string[] {
	const name = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' });
	// 1 January 2024 was a Monday.
	return [0, 1, 2, 3, 4, 5, 6].map((day) =>
		day < 5 && day % 2 === 0 ? name.format(new Date(2024, 0, 1 + day)) : ''
	);
}

/** A week is headed by the month that begins in it. */
function monthOf(week: (Day | null)[]): string {
	const first = week.find((day) => day && new Date(day.at).getDate() === 1);
	return first ? new Date(first.at).toLocaleDateString(getLocale(), { month: 'short' }) : '';
}

export function History({ runs, notice, onOpen, onEdit, onClear, onBack }: Props) {
	const [profile] = useState(recallProfile);
	/** The day whose runs are listed by themselves, as its midnight; null for
	 *  every run. */
	const [picked, setPicked] = useState<number | null>(null);
	/** Clearing is asked twice: there is no getting a history back. */
	const [clearing, setClearing] = useState(false);
	// As many weeks as there is room for, so a narrow card cuts none in half.
	const strip = useRef<HTMLDivElement>(null);
	const [room, setRoom] = useState(WEEKS);
	useEffect(() => {
		const watch = new ResizeObserver(([{ contentRect }]) => {
			// Half a pixel of give: a width that is a hair short still fits.
			const fit = Math.floor((contentRect.width + GAP_PX + 0.5) / (DAY_PX + GAP_PX));
			setRoom(Math.max(1, Math.min(WEEKS, fit)));
		});
		watch.observe(strip.current!);
		return () => watch.disconnect();
	}, []);
	const weeks = useMemo(() => weeksOf(runs, room), [runs, room]);
	const listed = picked === null ? runs : runs.filter((run) => dayOf(run.at) === picked);

	return (
		<div className="scrim">
			<div
				className="card glass panel history"
				style={{ width: 520, '--face': profile.color } as CSSProperties}
			>
				<div className="hdr">
					<h2>{m.history()}</h2>
					{runs.length > 0 && <span className="hd">{m.runs_count({ count: runs.length })}</span>}
					<button type="button" className="btn ghost back" onClick={onBack}>
						{m.back()}
					</button>
				</div>
				<div className="prev">
					<Avatar profile={profile} />
					<span className={profile.name ? 'nm' : 'nm mut'}>{profile.name || m.pick_a_name()}</span>
					<span className="mono dim tag">{m.how_others_see_you_multiplayer()}</span>
					<button type="button" className="btn ghost" onClick={onEdit}>
						{m.edit()}
					</button>
				</div>
				<div className="field">
					<div className="ends">
						<span className="hd">{m.activity()}</span>
						<span className="scale hd" aria-hidden="true">
							{m.activity_less()}
							{Array.from({ length: FULL + 1 }, (_, level) => (
								<i className="day" data-level={level} key={level} />
							))}
							{m.activity_more()}
						</span>
					</div>
					<div className="heat">
						<div className="weekdays" aria-hidden="true">
							{weekdays().map((name, weekday) => (
								<span key={weekday}>{name}</span>
							))}
						</div>
						<div className="weeks" ref={strip}>
							{weeks.map((week, index) => (
								<div className="week" key={index}>
									<span className="month">{monthOf(week)}</span>
									{week.map((day, weekday) =>
										!day ? (
											<i className="day ahead" key={weekday} />
										) : day.runs ? (
											<button
												type="button"
												className="day"
												key={weekday}
												data-level={Math.min(day.runs, FULL)}
												aria-pressed={day.at === picked}
												title={m.runs_on_day({ count: day.runs, day: formatDay(day.at) })}
												onClick={() => setPicked(day.at === picked ? null : day.at)}
											/>
										) : (
											<i
												className="day"
												key={weekday}
												title={m.no_runs_on_day({ day: formatDay(day.at) })}
											/>
										)
									)}
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="field">
					<div className="row">
						<span className="hd">
							{picked === null
								? m.runs()
								: `${formatDay(picked)} · ${m.runs_count({ count: listed.length })}`}
						</span>
						{picked !== null && (
							<button type="button" className="quiet hd" onClick={() => setPicked(null)}>
								{m.show_all()}
							</button>
						)}
					</div>
					{notice && <span className="note">{notice}</span>}
					{runs.length > 0 ? (
						<div className="rounds runs">
							{listed.map((run) => {
								const row = (
									<>
										<span className="when">{formatDay(run.at)}</span>
										<span className="nm">{KIND_LABELS[kindOf(run)]()}</span>
										<span className="mono mut miss">{describePast(run)}</span>
										<span className="gain">{formatNumber(run.total)}</span>
									</>
								);
								return run.code === null ? (
									<div className="rk" key={run.at} title={m.run_has_no_link()}>
										{row}
									</div>
								) : (
									<button
										type="button"
										className="rk pick"
										key={run.at}
										title={describeRun(run.settings).join(' · ')}
										onClick={() => onOpen(run)}
									>
										{row}
									</button>
								);
							})}
						</div>
					) : (
						<span className="note">{m.history_empty()}</span>
					)}
				</div>
				<div className="ends note">
					<span>{m.stored_locally()}</span>
					{runs.length > 0 &&
						(clearing ? (
							<span className="row">
								<button
									type="button"
									className="quiet"
									onClick={() => {
										setClearing(false);
										setPicked(null);
										onClear();
									}}
								>
									{m.clear_runs_for_good({ count: runs.length })}
								</button>
								<button type="button" className="quiet" onClick={() => setClearing(false)}>
									{m.keep()}
								</button>
							</span>
						) : (
							<button type="button" className="quiet" onClick={() => setClearing(true)}>
								{m.clear_history()}
							</button>
						))}
				</div>
			</div>
		</div>
	);
}

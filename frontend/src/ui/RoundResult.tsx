import { useMemo } from 'react';
import type { PanoramaEntry, LonLat } from 'spacemap';
import { panoramaUrl } from '../game/links';
import { BODY_NAMES, formatClock, formatDistance } from '../game/rules';
import { ResultMap } from './ResultMap';

interface Props {
	body: string;
	truth: PanoramaEntry;
	/** Null when the round ran out with nothing picked. */
	guess: LonLat | null;
	distanceKm: number;
	points: number;
	/** Seconds still on the clock; null on an untimed run. */
	secondsLeft: number | null;
	round: number;
	rounds: number;
	timedOut: boolean;
	onNext: () => void;
}

export function coordinates(at: LonLat): string {
	const ns = at.lat >= 0 ? 'N' : 'S';
	const ew = at.lon >= 0 ? 'E' : 'W';
	return `${Math.abs(at.lat).toFixed(3)}° ${ns}  ${Math.abs(at.lon).toFixed(3)}° ${ew}`;
}

/** What the export knows about the stop, in the order a reader wants it. */
export function describe(entry: PanoramaEntry): string {
	const parts: string[] = [];
	if (entry.mission) parts.push(entry.mission[0].toUpperCase() + entry.mission.slice(1));
	if (entry.sol !== undefined) parts.push(`sol ${entry.sol}`);
	// The export's own field, so unreadable only if the export is wrong; a
	// missing date is worth less than the card it would otherwise throw away.
	const day = new Date(entry.time);
	if (!Number.isNaN(day.getTime())) parts.push(day.toISOString().slice(0, 10));
	return parts.join(' · ');
}

export function RoundResult({
	body,
	truth,
	guess,
	distanceKm,
	points,
	secondsLeft,
	round,
	rounds,
	timedOut,
	onNext
}: Props) {
	// Stable, so the map is framed once rather than on every render.
	const placements = useMemo(() => [{ guess, truth }], [guess, truth]);

	return (
		<div className="board">
			<ResultMap body={body} rounds={placements} />
			<div className="rpanel glass">
				<div className="col" style={{ gap: 3 }}>
					<span className="hd">actual location</span>
					<span style={{ fontSize: '13.5px' }}>{BODY_NAMES[body] ?? body}</span>
					<span className="mono mut" style={{ fontSize: '11.5px' }}>
						{describe(truth)}
					</span>
					<span className="mono dim" style={{ fontSize: '11.5px' }}>
						{coordinates(truth)}
					</span>
					<a
						className="out mono"
						href={panoramaUrl(body, truth)}
						target="_blank"
						rel="noopener noreferrer"
					>
						show in spacemap
					</a>
				</div>
				<div className="score">
					<b>+{points.toLocaleString('en')}</b>
					<span className="mono mut" style={{ fontSize: 12 }}>
						{guess ? `${formatDistance(distanceKm)} off` : 'no guess'}
						{!timedOut && secondsLeft !== null && ` · ${formatClock(secondsLeft)} left`}
					</span>
				</div>
				{timedOut && (
					<span className="note">
						{guess ? 'time ran out — the last point you picked stood' : 'time ran out'}
					</span>
				)}
				<span className="note">
					round {round} of {rounds}
				</span>
				<button type="button" className="btn lg" style={{ marginTop: 'auto' }} onClick={onNext}>
					{round < rounds ? 'Next round' : 'See total'}
				</button>
			</div>
		</div>
	);
}

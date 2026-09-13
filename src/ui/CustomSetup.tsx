import { useState } from 'react';
import { MOVEMENT_LABELS, QUICK_PLAY, type Movement, type RunSettings } from '../game/rules';

interface Props {
	onStart: (settings: RunSettings) => void;
	onBack: () => void;
	ready: boolean;
}

function Seg<T extends number | string>({
	options,
	value,
	onChange
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<div className="seg">
			{options.map((option) => (
				<button
					key={String(option.value)}
					type="button"
					aria-pressed={option.value === value}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

export function CustomSetup({ onStart, onBack, ready }: Props) {
	const [settings, setSettings] = useState<RunSettings>(QUICK_PLAY);
	const set = (patch: Partial<RunSettings>) => setSettings((old) => ({ ...old, ...patch }));

	return (
		<div className="scrim">
			<div className="card glass panel" style={{ width: 470 }}>
				<div className="hdr">
					<h2>Custom run</h2>
					<button type="button" className="btn ghost back" onClick={onBack}>
						Back
					</button>
				</div>
				<div className="field">
					<span className="hd">rounds</span>
					<Seg
						value={settings.rounds}
						onChange={(rounds) => set({ rounds })}
						options={[3, 5, 10].map((n) => ({ value: n, label: String(n) }))}
					/>
				</div>
				<div className="field">
					<span className="hd">movement</span>
					<Seg
						value={settings.movement}
						onChange={(movement) => set({ movement })}
						options={(Object.keys(MOVEMENT_LABELS) as Movement[]).map((value) => ({
							value,
							label: MOVEMENT_LABELS[value]
						}))}
					/>
					<span className="note">
						free walks the rover's traverse; look only stands still; no pan or zoom locks the view
						where it opened
					</span>
				</div>
				<div className="field">
					<span className="hd">timer</span>
					<Seg
						value={settings.timer}
						onChange={(timer) => set({ timer })}
						options={[
							{ value: 0, label: 'off' },
							{ value: 30, label: '30 s' },
							{ value: 60, label: '60 s' },
							{ value: 120, label: '2 min' }
						]}
					/>
					<span className="note">per round</span>
				</div>
				<div className="acts">
					<button
						type="button"
						className="btn lg"
						style={{ flex: 1 }}
						disabled={!ready}
						onClick={() => onStart(settings)}
					>
						Start solo
					</button>
				</div>
			</div>
		</div>
	);
}

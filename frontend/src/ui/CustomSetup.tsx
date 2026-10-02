import { useState } from 'react';
import { MOVEMENT_LABELS, QUICK_PLAY, type Movement, type RunSettings } from '../game/rules';

export interface SetupAction {
	label: string;
	ghost?: boolean;
	/** Starts a run, which needs somewhere to stand. */
	plays?: boolean;
	go: (settings: RunSettings) => void;
}

interface Props {
	title: string;
	/** The rules the card opens on. */
	initial?: RunSettings;
	actions: SetupAction[];
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

export function CustomSetup({ title, initial = QUICK_PLAY, actions, onBack, ready }: Props) {
	const [settings, setSettings] = useState<RunSettings>(initial);
	const set = (patch: Partial<RunSettings>) => setSettings((old) => ({ ...old, ...patch }));

	return (
		<div className="scrim">
			<div className="card glass panel" style={{ width: 470 }}>
				<div className="hdr">
					<h2>{title}</h2>
					<button type="button" className="btn ghost back" onClick={onBack}>
						Back
					</button>
				</div>
				<div className="field">
					<span className="hd">rounds</span>
					<Seg
						value={settings.rounds}
						onChange={(rounds) => set({ rounds })}
						options={[3, 5, 10, 20].map((n) => ({ value: n, label: String(n) }))}
					/>
				</div>
				<div className="field">
					<span className="hd">rounds are</span>
					<Seg
						value={settings.modes.ground ? (settings.modes.orbit ? 'both' : 'ground') : 'orbit'}
						onChange={(kind) =>
							set({ modes: { ground: kind !== 'orbit', orbit: kind !== 'ground' } })
						}
						options={[
							{ value: 'both', label: 'both' },
							{ value: 'ground', label: 'on the ground' },
							{ value: 'orbit', label: 'from orbit' }
						]}
					/>
					<span className="note">both is a coin toss each round</span>
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
				</div>
				<div className="field">
					<span className="hd">timer</span>
					<Seg
						value={settings.timer}
						onChange={(timer) => set({ timer })}
						options={[
							{ value: 0, label: 'off' },
							{ value: 10, label: '10 s' },
							{ value: 30, label: '30 s' },
							{ value: 60, label: '60 s' },
							{ value: 120, label: '2 min' }
						]}
					/>
					<span className="note">per round</span>
				</div>
				<div className="acts">
					{actions.map((action) => (
						<button
							key={action.label}
							type="button"
							className={`btn lg${action.ghost ? ' ghost' : ''}`}
							style={{ flex: 1 }}
							disabled={action.plays && !ready}
							onClick={() => action.go(settings)}
						>
							{action.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

import { useState } from 'react';
import { EMOJI, NAME_MAX, SWATCHES, recallProfile, type Profile } from '../game/players';
import type { Trouble } from '../game/useLobby';
import { Avatar, Glyph } from './Avatar';

interface Props {
	/** The run being joined; absent when this player is opening one. */
	code?: string;
	busy: boolean;
	trouble: Trouble | null;
	onGo: (profile: Profile) => void;
	onBack: () => void;
}

const TROUBLES: Partial<Record<Trouble, string>> = {
	not_found: 'No run with that code',
	full: 'That lobby is full',
	in_progress: 'That run has already started — it takes new players between games',
	busy: 'The server is full — try again in a moment',
	unreachable: 'Could not reach the server'
};

export function ProfileSetup({ code, busy, trouble, onGo, onBack }: Props) {
	const [profile, setProfile] = useState(recallProfile);
	const set = (patch: Partial<Profile>) => setProfile((old) => ({ ...old, ...patch }));
	const named = profile.name.trim().length > 0;

	return (
		<div className="scrim">
			<form
				className="card glass panel"
				style={{ width: 404 }}
				onSubmit={(event) => {
					event.preventDefault();
					if (named && !busy) onGo({ ...profile, name: profile.name.trim() });
				}}
			>
				<div className="hdr">
					<h2>{code ? 'Join run' : 'Create run'}</h2>
					{code && <span className="mono dim code-tag">{code}</span>}
					<button type="button" className="btn ghost back" onClick={onBack}>
						Back
					</button>
				</div>
				<div className="field">
					<label className="hd" htmlFor="name">
						username
					</label>
					<input
						id="name"
						type="text"
						placeholder="pick a name"
						autoComplete="nickname"
						maxLength={NAME_MAX}
						autoFocus
						value={profile.name}
						onChange={(event) => set({ name: event.target.value })}
					/>
				</div>
				<div className="field">
					<span className="hd">emoji</span>
					<div className="emoji">
						{EMOJI.map((emoji) => (
							<button
								key={emoji}
								type="button"
								aria-pressed={emoji === profile.emoji}
								onClick={() => set({ emoji })}
							>
								<Glyph emoji={emoji} />
							</button>
						))}
					</div>
				</div>
				<div className="field">
					<span className="hd">background</span>
					<div className="sw">
						{SWATCHES.map((color) => (
							<button
								key={color}
								type="button"
								aria-label={color}
								aria-pressed={color === profile.color}
								style={{ background: color }}
								onClick={() => set({ color })}
							/>
						))}
					</div>
				</div>
				<div className="prev">
					<Avatar profile={profile} />
					<span className={named ? 'nm' : 'nm mut'}>{named ? profile.name : 'pick a name'}</span>
					<span className="mono dim tag">how others see your guesses</span>
				</div>
				{trouble && <span className="note bad">{TROUBLES[trouble] ?? trouble}</span>}
				<div className="acts">
					<button type="submit" className="btn lg" style={{ flex: 1 }} disabled={!named || busy}>
						{busy ? 'Connecting…' : code ? 'Join lobby' : 'Create lobby'}
					</button>
				</div>
			</form>
		</div>
	);
}

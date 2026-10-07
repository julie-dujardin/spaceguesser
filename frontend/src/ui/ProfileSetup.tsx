import { useState } from 'react';
import { EMOJI, NAME_MAX, SWATCHES, recallProfile, type Profile } from '../game/players';
import type { Trouble } from '../game/useLobby';
import * as m from '../paraglide/messages.js';
import { Avatar, Glyph } from './Avatar';

interface Props {
	/** The run being joined; absent when this player is opening one. */
	code?: string;
	/** Changing the face with no run to take it to. */
	edit?: boolean;
	busy: boolean;
	trouble: Trouble | null;
	onGo: (profile: Profile) => void;
	onBack: () => void;
}

const TROUBLES: Partial<Record<Trouble, () => string>> = {
	not_found: m.trouble_not_found,
	full: m.trouble_full,
	in_progress: m.trouble_in_progress,
	busy: m.trouble_busy,
	unreachable: m.trouble_unreachable
};

export function ProfileSetup({ code, edit, busy, trouble, onGo, onBack }: Props) {
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
					<h2>{edit ? m.profile() : code ? m.join_run() : m.create_run()}</h2>
					{code && <span className="mono dim code-tag">{code}</span>}
					<button type="button" className="btn ghost back" onClick={onBack}>
						{m.back()}
					</button>
				</div>
				<div className="field">
					<label className="hd" htmlFor="name">
						{m.username()}
					</label>
					<input
						id="name"
						type="text"
						placeholder={m.pick_a_name()}
						autoComplete="nickname"
						maxLength={NAME_MAX}
						autoFocus
						value={profile.name}
						onChange={(event) => set({ name: event.target.value })}
					/>
				</div>
				<div className="field">
					<span className="hd">{m.emoji()}</span>
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
					<span className="hd">{m.background()}</span>
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
					<span className={named ? 'nm' : 'nm mut'}>{named ? profile.name : m.pick_a_name()}</span>
					<span className="mono dim tag">{m.how_others_see_you()}</span>
				</div>
				{trouble && <span className="note bad">{TROUBLES[trouble]?.() ?? trouble}</span>}
				<div className="acts">
					<button type="submit" className="btn lg" style={{ flex: 1 }} disabled={!named || busy}>
						{busy ? m.connecting() : edit ? m.save() : code ? m.join_lobby() : m.create_lobby()}
					</button>
				</div>
			</form>
		</div>
	);
}

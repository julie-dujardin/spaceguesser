import { useEffect, useRef, useState } from 'react';
import { EMOJI, NAME_MAX, SWATCHES, recallProfile, type Profile } from '../game/players';
import type { Trouble } from '../game/useLobby';
import * as m from '../paraglide/messages.js';
import { Avatar, Glyph } from './Avatar';
import { TURNSTILE, useProof } from './useProof';

interface Props {
	/** The run being joined; absent when this player is opening one. */
	code?: string;
	/** Changing the face with no run to take it to. */
	edit?: boolean;
	busy: boolean;
	trouble: Trouble | null;
	/** `proof` is for the server, and null when there is none to give it. */
	onGo: (profile: Profile, proof: string | null) => void;
	onBack: () => void;
}

const TROUBLES: Partial<Record<Trouble, () => string>> = {
	not_found: m.trouble_not_found,
	full: m.trouble_full,
	in_progress: m.trouble_in_progress,
	busy: m.trouble_busy,
	// A build with no check to run has no blocker to blame for it.
	unverified: TURNSTILE ? m.trouble_unverified : m.trouble_unverified_unbuilt,
	unreachable: m.trouble_unreachable
};

export function ProfileSetup({ code, edit, busy, trouble, onGo, onBack }: Props) {
	const [profile, setProfile] = useState(recallProfile);
	const set = (patch: Partial<Profile>) => setProfile((old) => ({ ...old, ...patch }));
	const named = profile.name.trim().length > 0;
	// Not while a connection is under way: a seat taken back needs no proof, and
	// an opening that is refused needs a new one, which a new widget makes.
	const proof = useProof(edit || busy ? null : code ? 'join' : 'create');
	/** Between the click and the token it waits for. */
	const [checking, setChecking] = useState(false);
	const held = busy || checking;
	/** The card as it is when the token comes, not as it was at the click. */
	const latest = useRef(profile);
	useEffect(() => {
		latest.current = profile;
	});

	return (
		<div className="scrim">
			<form
				className="card glass panel"
				style={{ width: 404 }}
				onSubmit={(event) => {
					event.preventDefault();
					if (!named || held) return;
					setChecking(true);
					void proof.take().then((token) => {
						setChecking(false);
						const name = latest.current.name.trim();
						if (token !== undefined && name) onGo({ ...latest.current, name }, token);
					});
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
				<div className="gate">
					<div ref={proof.slot} className={proof.shown ? 'proof shown' : 'proof'} />
					<div className="acts">
						{/* While Cloudflare wants a click, the button waits on it and says what it will do. */}
						<button
							type="submit"
							className="btn lg"
							style={{ flex: 1 }}
							disabled={!named || held || proof.asking}
						>
							{held && !proof.asking
								? m.connecting()
								: edit
									? m.save()
									: code
										? m.join_lobby()
										: m.create_lobby()}
						</button>
					</div>
				</div>
			</form>
		</div>
	);
}

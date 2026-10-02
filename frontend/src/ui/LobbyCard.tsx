import { useState } from 'react';
import { invitePath, settingsOf, type Lobby } from '../game/lobby';
import { profileOf } from '../game/players';
import { describeRun } from '../game/rules';
import { Avatar } from './Avatar';
import { Qr } from './Qr';

interface Props {
	lobby: Lobby;
	you: string | null;
	/** Whether there are panoramas to draw a run from yet. */
	ready: boolean;
	onStart: () => void;
	onEdit: () => void;
	onLeave: () => void;
}

export function LobbyCard({ lobby, you, ready, onStart, onEdit, onLeave }: Props) {
	const [copied, setCopied] = useState(false);
	const url = location.origin + invitePath(lobby.code);
	const hosting = lobby.host === you;
	const host = lobby.players.find((seat) => seat.id === lobby.host);

	const copy = () => {
		void navigator.clipboard?.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		});
	};

	return (
		<div className="scrim">
			<div className="card glass lobby">
				<div className="panel">
					<div className="hdr">
						<h2>Lobby</h2>
						<span className="mono dim code-tag">{lobby.code}</span>
						<button type="button" className="btn ghost back" onClick={onLeave}>
							Leave
						</button>
					</div>
					<div className="share">
						<Qr text={url} />
						<div className="col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
							<span className="hd">invite link</span>
							<div className="link">
								<span>{url.replace(/^https?:\/\//, '')}</span>
								<button type="button" className="btn ghost" onClick={copy}>
									{copied ? 'Copied' : 'Copy'}
								</button>
							</div>
							<span className="note">
								QR opens the same link. Anyone with it can join until the host starts.
							</span>
						</div>
					</div>
					<div className="field">
						<span className="hd">run settings</span>
						<div className="rules">
							{describeRun(settingsOf(lobby.settings)).map((rule) => (
								<span key={rule}>{rule}</span>
							))}
							{hosting && (
								<button type="button" onClick={onEdit}>
									change
								</button>
							)}
						</div>
					</div>
					<div className="acts">
						{hosting ? (
							<button type="button" className="btn lg" disabled={!ready} onClick={onStart}>
								Start run
							</button>
						) : (
							<span className="note">
								waiting for {host ? profileOf(host.name).name : 'the host'} to start
							</span>
						)}
					</div>
				</div>
				<div className="roster">
					<span className="hd">
						players <span className="mut">{lobby.players.length}</span>
					</span>
					{lobby.players.map((seat) => {
						const profile = profileOf(seat.name);
						return (
							<div className={`pl${seat.connected ? '' : ' away'}`} key={seat.id}>
								<Avatar profile={profile} />
								<span className="nm">{profile.name}</span>
								<span className="tag">
									{[
										seat.id === you && 'you',
										seat.id === lobby.host && 'host',
										!seat.connected && 'away'
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</div>
						);
					})}
					<span className="note" style={{ marginTop: 'auto' }}>
						host controls the start
					</span>
				</div>
			</div>
		</div>
	);
}

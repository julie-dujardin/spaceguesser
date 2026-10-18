import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { invitePath, settingsOf, type Lobby } from '../game/lobby';
import { profileOf } from '../game/players';
import { describeRun } from '../game/rules';
import * as m from '../paraglide/messages.js';
import { Avatar } from './Avatar';
import { Seg } from './CustomSetup';
import { Qr } from './Qr';

interface Props {
	lobby: Lobby;
	you: string | null;
	/** Whether there are panoramas to draw a run from yet. */
	ready: boolean;
	onStart: () => void;
	onEdit: () => void;
	/** The host's own seat: playing the game, or watching it. */
	onObserve: (observing: boolean) => void;
	onLeave: () => void;
}

export function LobbyCard({ lobby, you, ready, onStart, onEdit, onObserve, onLeave }: Props) {
	const [copied, setCopied] = useState(false);
	const url = location.origin + invitePath(lobby.code);
	const hosting = lobby.host === you;
	const host = lobby.players.find((seat) => seat.id === lobby.host);
	const observing = !!host?.observing;
	// A game nobody plays has nothing to watch: its rounds would close as they open.
	const anyPlayer = lobby.players.some((seat) => !seat.observing);

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
						<h2>{m.lobby()}</h2>
						<button type="button" className="btn ghost back" onClick={onLeave}>
							{m.leave()}
						</button>
					</div>
					<div className="field">
						<span className="hd">{m.invite_link()}</span>
						<div className="share">
							<Qr text={url} />
							<span className="or">{m.or()}</span>
							<div className="col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
								<div className="link">
									<span>{url.replace(/^https?:\/\//, '')}</span>
									<button type="button" className="btn ghost" onClick={copy}>
										{copied ? m.copied() : m.copy()}
									</button>
								</div>
								<span className="note">{m.invite_note()}</span>
							</div>
						</div>
					</div>
					<div className="field">
						<span className="hd">{m.run_settings()}</span>
						<div className="rules">
							{describeRun(settingsOf(lobby.settings)).map((rule) => (
								<span key={rule}>{rule}</span>
							))}
							{hosting && (
								<button type="button" onClick={onEdit}>
									{m.change()}
								</button>
							)}
						</div>
					</div>
					{hosting && (
						<div className="field">
							<span className="hd">{m.seat_part()}</span>
							<Seg
								value={observing}
								onChange={(next) => next !== observing && onObserve(next)}
								options={[
									{ value: false, label: m.seat_play() },
									{ value: true, label: m.seat_observe() }
								]}
							/>
							{observing && !anyPlayer && <span className="note">{m.observe_nobody()}</span>}
						</div>
					)}
					<div className="acts">
						{hosting ? (
							<button
								type="button"
								className="btn lg"
								disabled={!ready || !anyPlayer}
								onClick={onStart}
							>
								{!ready && <LoaderCircle className="spin" size="1em" />}
								{m.start_run()}
							</button>
						) : (
							<span className="note">
								{host
									? m.waiting_for_player({ name: profileOf(host.name).name })
									: m.waiting_for_host()}
							</span>
						)}
					</div>
				</div>
				<div className="roster">
					<span className="hd">
						{m.players()} <span className="mut">{lobby.players.length}</span>
					</span>
					{lobby.players.map((seat) => {
						const profile = profileOf(seat.name);
						return (
							<div className={`pl${seat.connected ? '' : ' away'}`} key={seat.id}>
								<Avatar profile={profile} />
								<span className="nm">{profile.name}</span>
								<span className="tag">
									{[
										seat.id === you && m.tag_you(),
										// Only the host observes, so saying so says who hosts.
										seat.id === lobby.host && (seat.observing ? m.tag_observing() : m.tag_host()),
										!seat.connected && m.tag_away()
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</div>
						);
					})}
					<span className="note" style={{ marginTop: 'auto' }}>
						{m.host_starts()}
					</span>
				</div>
			</div>
		</div>
	);
}

import { useState } from 'react';
import { CODE_LENGTH } from '../game/lobby';
import * as m from '../paraglide/messages.js';

interface Props {
	onCreate: () => void;
	onJoin: (code: string) => void;
	onBack: () => void;
}

export function Friends({ onCreate, onJoin, onBack }: Props) {
	const [code, setCode] = useState('');

	return (
		<div className="scrim">
			<div className="card glass panel" style={{ width: 420 }}>
				<div className="hdr">
					<h2>{m.play_with_friends()}</h2>
					<button type="button" className="btn ghost back" onClick={onBack}>
						{m.back()}
					</button>
				</div>
				<button type="button" className="mode framed" onClick={onCreate}>
					<span className="t">{m.create_a_run()}</span>
					<span className="d">{m.create_a_run_hint()}</span>
				</button>
				<form
					className="field"
					onSubmit={(event) => {
						event.preventDefault();
						if (code.length === CODE_LENGTH) onJoin(code);
					}}
				>
					<label className="hd" htmlFor="code">
						{m.join_with_code()}
					</label>
					<div className="row">
						<input
							id="code"
							type="text"
							className="code"
							placeholder="K7M2QD"
							autoComplete="off"
							autoCapitalize="characters"
							spellCheck={false}
							maxLength={CODE_LENGTH}
							value={code}
							onChange={(event) => setCode(event.target.value.trim().toUpperCase())}
						/>
						<button type="submit" className="btn tall" disabled={code.length !== CODE_LENGTH}>
							{m.join()}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

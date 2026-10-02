import { useState } from 'react';
import { CODE_LENGTH } from '../game/lobby';

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
					<h2>Play with friends</h2>
					<button type="button" className="btn ghost back" onClick={onBack}>
						Back
					</button>
				</div>
				<button type="button" className="mode framed" onClick={onCreate}>
					<span className="t">Create a run</span>
					<span className="d">set the rules, then invite by link or QR</span>
				</button>
				<form
					className="field"
					onSubmit={(event) => {
						event.preventDefault();
						if (code.length === CODE_LENGTH) onJoin(code);
					}}
				>
					<label className="hd" htmlFor="code">
						or join with a code
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
							Join
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

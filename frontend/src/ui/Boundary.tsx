/** What the page shows when the app throws while drawing itself. Without it
 *  React takes everything down and leaves the page black. */

import { Component, type ReactNode } from 'react';
import * as m from '../paraglide/messages.js';

export class Boundary extends Component<{ children: ReactNode }, { broken: boolean }> {
	state = { broken: false };

	static getDerivedStateFromError() {
		return { broken: true };
	}

	render() {
		if (!this.state.broken) return this.props.children;
		return (
			<div className="scrim">
				<div className="card glass broken">
					<h1>spaceguesser</h1>
					<p className="lede">{m.broken_lede()}</p>
					{/* The way back in: a seat in a lobby is kept in the browser. */}
					<button type="button" className="start" onClick={() => location.reload()}>
						<span className="t">{m.broken_reload()}</span>
					</button>
				</div>
			</div>
		);
	}
}

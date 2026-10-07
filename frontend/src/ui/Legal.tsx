import { ABOUT, aboutPath } from '../game/about';
import { aboutLabel } from './About';

/** The way to the pages beside the game. A new tab, as the credit line's own
 *  links are: a run in progress is not worth a page of small print. */
export function Legal() {
	return (
		<nav className="legal">
			{ABOUT.map((page) => (
				<a key={page} href={aboutPath(page)} target="_blank" rel="noopener">
					{aboutLabel(page)}
				</a>
			))}
		</nav>
	);
}

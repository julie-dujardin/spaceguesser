import { ChevronDown, ChevronUp } from 'lucide-react';
import * as m from '../paraglide/messages.js';

interface Props {
	folded: boolean;
	onFold: (folded: boolean) => void;
}

/** The chevron in a result panel's top-right corner. On a phone the panel
 *  covers most of the map it is about, so it folds down to what was scored
 *  and the way on, marked `keep`. A wider window has room for both, and no
 *  chevron. */
export function Fold({ folded, onFold }: Props) {
	const label = folded ? m.panel_unfold() : m.panel_fold();
	return (
		<button
			type="button"
			className="fold keep"
			aria-expanded={!folded}
			title={label}
			aria-label={label}
			onClick={() => onFold(!folded)}
		>
			{folded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
		</button>
	);
}

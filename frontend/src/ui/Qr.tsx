import { useMemo } from 'react';
import { encode } from 'uqr';
import * as m from '../paraglide/messages.js';

/** Drawn here rather than fetched: an invite is not a third party's to see. */
export function Qr({ text }: { text: string }) {
	const { size, path } = useMemo(() => {
		const { data, size } = encode(text, { border: 2 });
		const path = data
			.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
			.join('');
		return { size, path };
	}, [text]);

	return (
		<svg
			className="qr"
			viewBox={`0 0 ${size} ${size}`}
			shapeRendering="crispEdges"
			role="img"
			aria-label={m.qr_label({ text })}
		>
			<path d={path} fill="#000" />
		</svg>
	);
}

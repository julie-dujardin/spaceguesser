/** A place in the guess panel for the view's own controls: they sit beside the
 *  panel where there is room, and on top of it where it takes the width. */

import { createContext, useMemo, useState, type ReactNode } from 'react';

export const ToolSlot = createContext<{
	slot: HTMLElement | null;
	setSlot: (element: HTMLElement | null) => void;
}>({ slot: null, setSlot: () => {} });

export function ToolSlotProvider({ children }: { children: ReactNode }) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	const value = useMemo(() => ({ slot, setSlot }), [slot]);
	return <ToolSlot value={value}>{children}</ToolSlot>;
}

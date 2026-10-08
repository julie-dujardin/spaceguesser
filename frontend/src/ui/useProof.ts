/** Proof for the multiplayer server that a person is at the page: a Turnstile
 *  token, which Cloudflare makes and the server checks with it. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocale } from '../paraglide/runtime.js';

/** With no key named the server is sent no proof, and had better not want one. */
const SITEKEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITEKEY || undefined;

/** Whether this build can make a proof at all. */
export const TURNSTILE = !!SITEKEY;

/** Cloudflare serves it from here alone: a copy in the bundle stops working. */
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** How long a click waits on a token still being made. Past it the server is
 *  asked without one, and says whether that matters. */
const PATIENCE_MS = 10_000;

/** The widget is never narrower, so a slot that is has it drawn smaller. */
const WIDGET_MIN_PX = 300;

interface Turnstile {
	render(slot: HTMLElement, options: Record<string, unknown>): string | null | undefined;
	reset(widget: string): void;
	remove(widget: string): void;
}

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
	loading ??= new Promise<Turnstile>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = SCRIPT;
		script.async = true;
		script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
		script.onerror = reject;
		document.head.append(script);
	}).catch((blocked: unknown) => {
		// Forgotten, so the next card tries again: a blocker may be off by then.
		loading = null;
		throw blocked;
	});
	return loading;
}

/**
 * Makes tokens in `slot` for an opening message of the kind `action` names,
 * for as long as it names one: null loads nothing of Cloudflare's. The slot is
 * empty unless Cloudflare wants a click: `asking` while it waits for one,
 * `shown` for as long as its widget takes room, which outlasts the click.
 */
export function useProof(action: 'create' | 'join' | null) {
	const slot = useRef<HTMLDivElement>(null);
	const [asking, setAsking] = useState(false);
	const [shown, setShown] = useState(false);
	const widget = useRef<{ api: Turnstile; id: string } | null>(null);
	const token = useRef<string | null>(null);
	/** A widget is up and has not failed, so a token is held or on its way. */
	const coming = useRef(false);
	/** The widget's token was handed over, and it does not know to make another. */
	const spent = useRef(false);
	const waiting = useRef<(() => void) | null>(null);
	const patience = useRef<ReturnType<typeof setTimeout>>(undefined);
	/** Counts the widgets taken down, so a click that waited on one can tell. */
	const ended = useRef(0);

	useEffect(() => {
		const el = slot.current;
		if (!SITEKEY || !action || !el) return;
		let gone = false;
		coming.current = true;
		// Measured: Cloudflare says when it starts asking, not when it stops showing.
		const sized = new ResizeObserver(([{ contentRect }]) => {
			setShown(contentRect.height > 0);
			el.style.setProperty('--fit', String(Math.min(1, contentRect.width / WIDGET_MIN_PX)));
		});
		sized.observe(el);
		const wake = () => {
			clearTimeout(patience.current);
			waiting.current?.();
			waiting.current = null;
		};
		const settle = (made: string | null) => {
			token.current = made;
			coming.current = !!made;
			spent.current = false;
			wake();
		};
		const fail = () => {
			setAsking(false);
			settle(null);
		};
		load().then(
			(api) => {
				if (gone) return;
				let id: string | null | undefined;
				try {
					id = api.render(el, {
						sitekey: SITEKEY,
						action,
						appearance: 'interaction-only',
						size: 'flexible',
						theme: 'dark',
						language: getLocale(),
						callback: (made: string) => {
							setAsking(false);
							settle(made);
						},
						// Handled, which is what returning true says.
						'error-callback': () => {
							fail();
							return true;
						},
						'unsupported-callback': fail,
						'expired-callback': () => {
							token.current = null;
						},
						'before-interactive-callback': () => {
							// The wait is the visitor's from here, and they can see why.
							clearTimeout(patience.current);
							setAsking(true);
						},
						'after-interactive-callback': () => setAsking(false)
					});
				} catch {
					// A key or an option Cloudflare will not take: no widget, no token.
				}
				if (id) widget.current = { api, id };
				else fail();
			},
			() => {
				if (!gone) fail();
			}
		);
		return () => {
			gone = true;
			sized.disconnect();
			widget.current?.api.remove(widget.current.id);
			widget.current = null;
			token.current = null;
			coming.current = false;
			spent.current = false;
			ended.current++;
			wake();
			setAsking(false);
			setShown(false);
		};
	}, [action]);

	/** The token, or null when none came. Undefined when the widget was taken
	 *  down under the click, which then opens nothing. */
	const take = useCallback(async (): Promise<string | null | undefined> => {
		const before = ended.current;
		if (spent.current && widget.current) {
			// Cloudflare takes a token once, so another try needs another token.
			spent.current = false;
			widget.current.api.reset(widget.current.id);
		}
		if (coming.current && !token.current) {
			await new Promise<void>((resolve) => {
				waiting.current = resolve;
				patience.current = setTimeout(resolve, PATIENCE_MS);
			});
			waiting.current = null;
			if (ended.current !== before) return undefined;
		}
		const held = token.current;
		token.current = null;
		spent.current = !!held;
		return held;
	}, []);

	return { slot, asking, shown, take };
}

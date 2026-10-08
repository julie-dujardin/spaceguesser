/** The socket to the multiplayer server, and the seat held through it. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	SEAT_TAKEN,
	lobbyOf,
	type ClientMessage,
	type Lobby,
	type LobbyError,
	type ServerMessage
} from './lobby';
import { seatName, type Profile } from './players';
import type { RunSettings } from './rules';

/** `wss://…/ws`. With no server named there is no multiplayer to offer, and the
 *  app does not show any. */
const SERVER: string | undefined = import.meta.env.VITE_MULTIPLAYER_URL || undefined;

export const MULTIPLAYER = !!SERVER;

export type Trouble =
	/** Refused at the door, with the server's reason. */
	| LobbyError
	/** No answer from the server at all. */
	| 'unreachable'
	/** The game ended, or went on without this seat, while the socket was down. */
	| 'gone';

export interface Session {
	/** `displaced`: the seat is being played from another tab or device. */
	status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'displaced';
	lobby: Lobby | null;
	you: string | null;
	/** The server's clock minus this device's, for reading a round's deadline. */
	skew: number;
	/** Counts sockets that got in, so a message can be sent again on the next. */
	connection: number;
	trouble: Trouble | null;
}

const IDLE: Session = {
	status: 'idle',
	lobby: null,
	you: null,
	skew: 0,
	connection: 0,
	trouble: null
};

interface Kept {
	code: string;
	token: string;
}

const KEY = 'spaceguesser.seat';

function recallSeat(): Kept | null {
	try {
		const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Kept> | null;
		return kept?.code && kept.token ? { code: kept.code, token: kept.token } : null;
	} catch {
		return null;
	}
}

function keepSeat(seat: Kept | null) {
	try {
		if (seat) localStorage.setItem(KEY, JSON.stringify(seat));
		else localStorage.removeItem(KEY);
	} catch {
		// A seat that is not kept is lost on reload, and only then.
	}
}

const RETRY_MS = [500, 1000, 2000, 4000];

/**
 * `invite` is the code the page was opened on, if any: a seat kept from an
 * earlier game is taken back on load unless the visitor came for another one,
 * or, with `resume` off, for something that is not a game at all.
 */
export function useLobby(invite: string | null, resume = true) {
	const [session, setSession] = useState<Session>(IDLE);
	const socket = useRef<WebSocket | null>(null);
	const seat = useRef<Kept | null>(null);
	const retry = useRef<ReturnType<typeof setTimeout>>(undefined);

	const drop = useCallback(() => {
		clearTimeout(retry.current);
		const open = socket.current;
		// Cleared first, so the close this causes is not read as the line dropping.
		socket.current = null;
		open?.close();
	}, []);

	const connect = useCallback(
		(hello: ClientMessage, after: ClientMessage[] = [], attempt = 0) => {
			if (!SERVER) return;
			drop();
			const opened = new WebSocket(SERVER);
			socket.current = opened;
			const returning = hello.type === 'rejoin';
			let token: string | null = null;
			let refused: LobbyError | null = null;

			opened.onopen = () => opened.send(JSON.stringify(hello));

			opened.onmessage = (event) => {
				if (socket.current !== opened) return;
				const message = JSON.parse(String(event.data)) as ServerMessage;
				if (message.type === 'joined') {
					token = message.token;
					attempt = 0;
					setSession((old) => ({ ...old, you: message.you, connection: old.connection + 1 }));
					for (const queued of after) opened.send(JSON.stringify(queued));
				} else if (message.type === 'lobby') {
					if (token) {
						seat.current = { code: message.lobby.code, token };
						keepSeat(seat.current);
					}
					setSession((old) => ({
						...old,
						status: 'open',
						lobby: lobbyOf(message.lobby),
						skew: message.now - Date.now(),
						trouble: null
					}));
				} else if (!token) {
					// Past the door an error is a race lost to another message, and the
					// next snapshot already says who won.
					refused = message.code;
				}
			};

			opened.onclose = (event) => {
				if (socket.current !== opened) return;
				socket.current = null;
				if (refused) {
					// Only a seat that is gone is refused on the way back in.
					if (returning) keepSeat((seat.current = null));
					setSession((old) => ({
						...IDLE,
						// A stale seat found on load is not news; one lost mid-game is.
						trouble: returning ? (old.lobby ? 'gone' : null) : refused
					}));
				} else if (event.code === SEAT_TAKEN) {
					// Taking it straight back would have the two tabs trade it forever.
					setSession((old) => ({ ...old, status: 'displaced' }));
				} else if (token || returning) {
					const again = seat.current;
					if (!again) return setSession(IDLE);
					setSession((old) => ({ ...old, status: old.lobby ? 'reconnecting' : 'connecting' }));
					const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
					retry.current = setTimeout(
						() => connect({ type: 'rejoin', ...again }, [], attempt + 1),
						wait
					);
				} else {
					setSession({ ...IDLE, trouble: 'unreachable' });
				}
			};
		},
		[drop]
	);

	useEffect(() => {
		const kept = recallSeat();
		if (SERVER && resume && kept && (!invite || invite === kept.code)) {
			seat.current = kept;
			setSession({ ...IDLE, status: 'connecting' });
			connect({ type: 'rejoin', ...kept });
		}
		return drop;
	}, [invite, resume, connect, drop]);

	return useMemo(() => {
		const enter = (hello: ClientMessage, after?: ClientMessage[]) => {
			setSession({ ...IDLE, status: 'connecting' });
			connect(hello, after);
		};
		return {
			...session,
			create: (profile: Profile, settings: RunSettings) =>
				enter({ type: 'create', name: seatName(profile) }, [{ type: 'settings', settings }]),
			join: (code: string, profile: Profile) =>
				enter({ type: 'join', code, name: seatName(profile) }),
			/** False when the line is down and the message went nowhere. */
			send: (message: ClientMessage): boolean => {
				if (socket.current?.readyState !== WebSocket.OPEN) return false;
				socket.current.send(JSON.stringify(message));
				return true;
			},
			/** Takes the seat back from wherever else it is being played. */
			reclaim: () => {
				if (seat.current) connect({ type: 'rejoin', ...seat.current });
			},
			leave: () => {
				if (socket.current?.readyState === WebSocket.OPEN)
					socket.current.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage));
				drop();
				keepSeat((seat.current = null));
				setSession(IDLE);
			},
			forget: () => setSession((old) => ({ ...old, trouble: null }))
		};
	}, [session, connect, drop]);
}

export type LobbySession = ReturnType<typeof useLobby>;

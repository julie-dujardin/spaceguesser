import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'spaceguesser.identity';

/** The module afresh, as a page just loaded has it. */
async function loaded() {
	vi.resetModules();
	return import('./players');
}

describe('identity', () => {
	let kept: Map<string, string>;

	beforeEach(() => {
		kept = new Map();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => void kept.set(key, value)
		});
	});

	it('is made once, and is the same on the next visit', async () => {
		const first = (await loaded()).identity();
		expect(first).toMatch(/^[0-9a-f]{32}$/);
		expect(kept.get(KEY)).toBe(first);
		expect((await loaded()).identity()).toBe(first);
	});

	it('is not made until it is asked for', async () => {
		await loaded();
		expect(kept.has(KEY)).toBe(false);
	});

	it('is made again over anything else found in its place', async () => {
		kept.set(KEY, 'someone else entirely');
		const made = (await loaded()).identity();
		expect(made).toMatch(/^[0-9a-f]{32}$/);
		expect(kept.get(KEY)).toBe(made);
	});

	it('holds for the page where the browser keeps nothing', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		const players = await loaded();
		expect(players.identity()).toBe(players.identity());
		expect((await loaded()).identity()).not.toBe(players.identity());
	});
});

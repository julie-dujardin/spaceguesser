import { describe, expect, it } from 'vitest';
import type { PanoramaEntry } from 'spacemap';
import { spot, type Stop } from './rounds';
import {
	LESSONS,
	TUTORIAL,
	TUTORIAL_DATE,
	UNSEEN,
	backward,
	countdown,
	nextEnd,
	onward,
	shownTip,
	tutorialRun,
	type Progress,
	type Seen
} from './tutorial';

const RAD = Math.PI / 180;

function apart(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const cos =
		Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
		Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD);
	return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
}

/** A stop for every panorama the lessons stand in. */
const STOPS: Stop[] = LESSONS.flatMap(({ where }) =>
	where.mode === 'ground'
		? [
				{
					body: where.body,
					entry: { id: where.panorama, lat: 1, lon: 2, time: '' } as PanoramaEntry
				}
			]
		: []
);

const NOTHING: Progress = { dragged: null, opened: null, picked: null, placed: false, now: 0 };
/** Long enough ago for any wait to have run out. */
const LONG_AGO = -60_000;

describe('tutorialRun', () => {
	it('is a lesson a round, all at the one date', () => {
		const { rounds, lessons } = tutorialRun(STOPS, true);
		expect(rounds).toHaveLength(TUTORIAL.rounds);
		expect(lessons).toEqual(LESSONS);
		expect(rounds.every((round) => round.time === TUTORIAL_DATE)).toBe(true);
	});

	it('flies over the place each lesson is about, with the Sun well up', () => {
		const { rounds, lessons } = tutorialRun(STOPS, true);
		rounds.forEach((round, i) => {
			const { where } = lessons[i];
			if (round.mode !== 'orbit' || where.mode !== 'orbit') return;
			expect(round.u).toBeLessThan(1);
			expect(apart(spot(round, where.noon), where.over)).toBeLessThan(1e-5);
		});
	});

	it('leaves out a lesson whose panorama is gone, and the flown ones without a map', () => {
		const { rounds, lessons } = tutorialRun(STOPS.slice(1), false);
		expect(rounds.every((round) => round.mode === 'ground')).toBe(true);
		expect(rounds).toHaveLength(STOPS.length - 1);
		expect(lessons.map((lesson) => lesson.where)).toEqual(
			LESSONS.slice(1)
				.filter(({ where }) => where.mode === 'ground')
				.map((lesson) => lesson.where)
		);
	});
});

describe('the tips', () => {
	const guided = LESSONS[0].tips;
	const ids = guided.map((tip) => tip.id);
	const shown = (progress: Partial<Progress>, seen: Partial<Seen> = {}) =>
		ids[shownTip(guided, { ...NOTHING, ...progress }, { ...UNSEEN, ...seen })] ?? null;

	it('walk through a guess one step at a time', () => {
		expect(shown({})).toBe('look');
		expect(shown({ dragged: LONG_AGO })).toBe('map');
		expect(shown({ dragged: LONG_AGO, opened: LONG_AGO })).toBe('levels');
		expect(shown({ dragged: LONG_AGO, opened: LONG_AGO, picked: 'naif-499' })).toBe('place');
	});

	it('skip a step the reader took before being told', () => {
		expect(shown({ opened: LONG_AGO }, { dismissed: ['look'] })).toBe('levels');
	});

	it('wait for their moment when the one before is waved off', () => {
		expect(shown({ dragged: LONG_AGO }, { dismissed: ['map'] })).toBeNull();
		expect(shown({ dragged: LONG_AGO, opened: -1 }, { dismissed: ['map'] })).toBe('levels');
	});

	it('have no place to point at on a body with no map', () => {
		expect(shown({ dragged: LONG_AGO, opened: LONG_AGO, picked: 'naif-299' })).toBeNull();
	});

	it('ring the Guess button once there is a place to guess', () => {
		const place = guided.find((tip) => tip.id === 'place')!;
		expect(place.ring?.({ ...NOTHING, picked: 'naif-499' })).toBe('surface');
		expect(place.ring?.({ ...NOTHING, picked: 'naif-499', placed: true })).toBe('guess');
	});

	it('are over once every one is waved off', () => {
		expect(shown({}, { dismissed: ids })).toBeNull();
	});

	it('go back one at a time, and on again as far as the one due', () => {
		const progress = { ...NOTHING, dragged: LONG_AGO, opened: LONG_AGO };
		let seen = backward(guided, progress, UNSEEN);
		expect(ids[shownTip(guided, progress, seen)]).toBe('map');
		seen = backward(guided, progress, seen);
		expect(ids[shownTip(guided, progress, seen)]).toBe('look');
		expect(backward(guided, progress, seen)).toEqual(seen);
		seen = onward(guided, progress, seen);
		expect(ids[shownTip(guided, progress, seen)]).toBe('map');
		seen = onward(guided, progress, seen);
		expect(seen).toEqual(UNSEEN);
		expect(ids[shownTip(guided, progress, seen)]).toBe('levels');
		// Going on from the one due waves it off.
		expect(onward(guided, progress, seen).dismissed).toEqual(['levels']);
	});

	it('stay a while after the reader acts, counting down to the next', () => {
		const lately = { ...NOTHING, dragged: -1_000 };
		expect(shown({ dragged: -1_000 })).toBe('look');
		expect(countdown(guided, 0, lately)).toEqual({ end: 5_000, ms: 6_000 });
		expect(nextEnd(guided, lately)).toBe(5_000);
		expect(shown({ dragged: -1_000, now: 5_000 })).toBe('map');
		expect(countdown(guided, 0, { ...lately, now: 5_000 })).toBeNull();
		expect(nextEnd(guided, { ...lately, now: 5_000 })).toBeNull();
	});

	it('point at the switch where the planet is behind the moon', () => {
		const ganymede = LESSONS.find(({ where }) => where.body === 'naif-503')!.tips;
		expect(ganymede[shownTip(ganymede, NOTHING, UNSEEN)]).toMatchObject({ at: 'tools' });
		expect(ganymede[0].ring?.(NOTHING)).toBe('tools');
	});
});

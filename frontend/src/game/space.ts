/**
 * The Solar System map the game keeps for its whole life. It is the view of an
 * orbit round, and it is also the one thing that knows where the bodies are at
 * a round's time: where the Sun stands over a place, how far apart two guesses
 * of a system are.
 */

import { createMap, type CameraHold, type LonLat, type OffsetKm, type SpaceMap } from 'spacemap';
import { bodyOf, membersOf, systemOf, viewDistance } from './bodies';
import { anywhere, spot, type OrbitRound, type Place, type Round } from './rounds';
import { NO_SKY, type Sky } from './scoring';

const RAD = Math.PI / 180;

/** Small bodies stream in behind the map; one that has not shown by now is
 *  not going to. */
const LOAD_TIMEOUT_MS = 20_000;
/** Frames a jump is given to land before it is made again: a jump into
 *  another system is dropped while that system loads. */
const SETTLE_FRAMES = 4;
/** A body the map will not settle on by now is one it cannot show. */
const SETTLE_TIMEOUT_MS = 25_000;
/** A spin the map has not fetched by now is taken as not measured. */
const SPIN_TIMEOUT_MS = 5_000;
/** A flight lands in a few seconds or not at all. */
const FLIGHT_TIMEOUT_MS = 8_000;

/** Which way the reader is looking from where they hang: clockwise from north
 *  and up from the horizon, so straight down is a pitch of −90. */
export interface Gaze {
	heading: number;
	pitch: number;
}

export const DOWN: Gaze = { heading: 0, pitch: -90 };

/** Looking up stops short of the zenith, where a heading stops meaning anything. */
const MAX_PITCH = 80;

type Vec = [number, number, number];

/** Unit vectors east, north and up at a place, in body-fixed axes. */
function frame(at: LonLat): { east: Vec; north: Vec; up: Vec } {
	const lat = at.lat * RAD;
	const lon = at.lon * RAD;
	return {
		east: [-Math.sin(lon), Math.cos(lon), 0],
		north: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
		up: [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
	};
}

const mix = (a: Vec, ka: number, b: Vec, kb: number, c: Vec, kc: number): Vec => [
	a[0] * ka + b[0] * kb + c[0] * kc,
	a[1] * ka + b[1] * kb + c[1] * kc,
	a[2] * ka + b[2] * kb + c[2] * kc
];

/** A body-fixed point as the place under it and its height over the datum. */
function toSurface(point: Vec, radiusKm: number) {
	const length = Math.hypot(...point);
	return {
		latitude: Math.asin(point[2] / length) / RAD,
		longitude: Math.atan2(point[1], point[0]) / RAD,
		altitudeKm: length - radiusKm
	};
}

export class Space {
	private hold: CameraHold | null = null;
	/** Counts the times the camera changed hands. */
	private turn = 0;
	/** Where the reader hangs and which way they look, to put them back there
	 *  after the map has been elsewhere to measure. */
	private stood: { place: Place; gaze: Gaze } | null = null;

	private constructor(
		readonly map: SpaceMap,
		private readonly container: HTMLElement
	) {}

	/** Rejects when WebGL or the data is not there. */
	static async open(container: HTMLElement): Promise<Space> {
		const map = await createMap({
			container,
			live: false,
			// The game moves the camera; the reader's hands are on the game.
			interactive: false,
			layers: {
				spacecraft: false,
				satellites: false,
				debris: false,
				// Names and orbits would answer the round.
				orbits: false,
				labels: false,
				nomenclature: false
			}
		});
		map.clock.pause();
		return new Space(map, container);
	}

	/** Stop drawing while something opaque is over the map. What the map lays
	 *  over its canvas — the rings round far bodies, its credit line — is HTML
	 *  and would show through, so the whole of it goes. */
	cover(covered: boolean): void {
		this.map.setCovered(covered);
		this.container.style.visibility = covered ? 'hidden' : '';
	}

	private frames(count: number): Promise<void> {
		return new Promise((resolve) => {
			let seen = 0;
			const off = this.map.on('frame', () => {
				if (++seen < count) return;
				off();
				resolve();
			});
		});
	}

	radiusKm(body: string): number | null {
		return this.map.getBody(body)?.radiusKm ?? bodyOf(body)?.radiusKm ?? null;
	}

	/** How far from `body`'s centre the game looks at it from. */
	standoffKm(body: string): number {
		const info = bodyOf(body);
		return (this.radiusKm(body) ?? 1) * (info ? viewDistance(info) : 4);
	}

	/**
	 * Put the map at `time`, around `body`. The positions the map answers with
	 * afterwards are that moment's.
	 */
	async travel(time: number, body: string): Promise<void> {
		this.release();
		const turn = this.turn;
		// Whoever takes the camera next ends this: it must not jump it back.
		const mine = () => {
			if (turn !== this.turn) throw new Error(`the map was sent elsewhere than ${body}`);
		};
		this.cover(false);
		this.map.clock.setDate(new Date(time));
		const deadline = Date.now() + LOAD_TIMEOUT_MS;
		while (!this.map.getBody(body)) {
			if (Date.now() > deadline) throw new Error(`${body} never loaded`);
			await new Promise((resolve) => setTimeout(resolve, 100));
			mine();
		}
		const settled = Date.now() + SETTLE_TIMEOUT_MS;
		for (let tries = 0; Date.now() < settled; tries++) {
			const target = { body, distanceKm: this.standoffKm(body) };
			// A jump is instant, and enough for anything the map already draws as
			// a body. One of the belt's dots only becomes a body by being flown to.
			if (tries % 2 === 0) this.map.jumpTo(target);
			else {
				await Promise.race([
					this.map.flyTo(target).catch(() => {}),
					new Promise((resolve) => setTimeout(resolve, FLIGHT_TIMEOUT_MS))
				]);
				mine();
			}
			await this.frames(SETTLE_FRAMES);
			mine();
			if (this.map.getCamera()?.body !== body) continue;
			if (!this.map.getBody(body)?.placed) throw new Error(`${body} is nowhere at that date`);
			return;
		}
		throw new Error(`the map did not settle on ${body}`);
	}

	/** The place an orbit round is over, which only the sky at its time says. */
	async place(round: OrbitRound): Promise<Place> {
		this.stood = null;
		await this.travel(round.time, round.body);
		const turn = this.turn;
		// The map answers once it knows how the body spins, which it fetches on
		// arriving: before that the place would turn away from the Sun with it.
		const deadline = Date.now() + SPIN_TIMEOUT_MS;
		let noon = this.map.getSubsolarPoint(round.body);
		while (!noon && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (turn !== this.turn) throw new Error(`the map was sent elsewhere than ${round.body}`);
			noon = this.map.getSubsolarPoint(round.body);
		}
		return { body: round.body, ...(noon ? spot(round, noon) : anywhere(round)) };
	}

	/**
	 * Hang over `place` and look along `gaze`. The camera is held rather than
	 * left to the map's own orbiting: the reader is somewhere, and turns their
	 * head.
	 */
	look(place: Place, gaze: Gaze): void {
		const radius = this.radiusKm(place.body);
		if (!radius) return;
		this.stood = { place, gaze };
		const altitude = this.standoffKm(place.body) - radius;
		const pitch = Math.min(MAX_PITCH, Math.max(-90, gaze.pitch)) * RAD;
		const heading = gaze.heading * RAD;
		const { east, north, up } = frame(place);
		const flat = Math.cos(pitch);
		const toward = mix(
			north,
			flat * Math.cos(heading),
			east,
			flat * Math.sin(heading),
			up,
			Math.sin(pitch)
		);
		// What is overhead in the picture: perpendicular to the gaze, so it holds
		// through the nadir, where the top of the picture is the heading itself.
		const lift = Math.sin(pitch);
		const above = mix(north, -lift * Math.cos(heading), east, -lift * Math.sin(heading), up, flat);

		const eye = mix(up, radius + altitude, north, 0, east, 0);
		const reach = Math.max(altitude, 1) / 2;
		const at = (direction: Vec) => toSurface(mix(eye, 1, direction, reach, up, 0), radius);
		const position = {
			body: place.body,
			latitude: place.lat,
			longitude: place.lon,
			altitudeKm: altitude
		};
		// The pose takes `up` on ecliptic axes, and only the map knows how the
		// body is turned: it is read back as the offset between two places.
		const tilt = this.map.offsetKm(position, { body: place.body, ...at(above) });
		if (!tilt) return;
		this.hold ??= this.map.holdCamera();
		this.hold.set({
			position,
			target: { body: place.body, ...at(toward) },
			up: tilt as OffsetKm
		});
	}

	/** Give the camera back to the map. */
	release(): void {
		this.turn++;
		this.hold?.release();
		this.hold = null;
	}

	/**
	 * The sky a guess on `guessed` is scored against. The right body needs
	 * none; any other sends the map to the round's time to say how far off it
	 * was that day. A sky the map cannot give is no sky: the guess is still
	 * scored, for what it got right.
	 */
	async measure(round: Round, truth: Place, guessed: string | null): Promise<Sky> {
		if (!guessed || guessed === truth.body) return NO_SKY;
		const back = round.mode === 'orbit' ? this.stood : null;
		try {
			// A dot in the belt has no position to measure from until it has been
			// flown to; it keeps one afterwards.
			if (!this.map.getBody(guessed)?.placed) await this.travel(round.time, guessed);
			await this.travel(round.time, truth.body);
			return this.sky(truth.body, guessed);
		} catch {
			return NO_SKY;
		} finally {
			if (back) this.look(back.place, back.gaze);
			else if (round.mode === 'ground') this.cover(true);
		}
	}

	/** The map must already be at the round's time, around `truth`. */
	private sky(truth: string, guessed: string): Sky {
		const between = (a: string, b: string) => this.map.distanceKm({ body: a }, { body: b });
		const system = systemOf(truth);
		const sameSystem = systemOf(guessed) === system;
		const reaches = membersOf(system)
			.filter((member) => member.id !== system)
			.map((member) => between(system, member.id));
		return {
			systemsKm: sameSystem ? 0 : between(system, systemOf(guessed)),
			bodiesKm: sameSystem ? between(truth, guessed) : null,
			systemExtentKm: reaches.some((km) => km === null)
				? null
				: 2 * Math.max(0, ...(reaches as number[]))
		};
	}
}

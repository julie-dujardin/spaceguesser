// Draws the daily challenge of each day that has no file yet, then checks
// them as the upload does. Each day is kept unlike the days around it, so
// the run of days reads as picked rather than repeated.
//   node scripts/draw-dailies.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--seed n]
// From today to two weeks on by default. A day that has a file keeps it. The
// files already there and the tutorial are what a new day is kept apart from.
// It does not see the maps: a place on blank or dark ground is found by
// looking at the days, and changed by hand.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { subsolarPoint, sunlight } from 'spacemap';
import { runnerImport } from 'vite';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const FOLDER = fileURLToPath(new URL('../../dailies/', import.meta.url));
/** The export the SDK reads, for the IAU names the SDK does not hand out. */
const EXPORT = 'https://static.spacemap.co/v1';
const DAY_MS = 86_400_000;

const { values: args } = parseArgs({
	options: { from: { type: 'string' }, to: { type: 'string' }, seed: { type: 'string' } }
});

// The game's own modules read their messages.
if (!existsSync(`${FRONTEND}src/paraglide/messages.js`))
	spawnSync('pnpm', ['messages'], { cwd: FRONTEND, stdio: 'inherit' });
const load = async (path) =>
	(await runnerImport(`${FRONTEND}${path}`, { configFile: false, logLevel: 'error' })).module;
const { DAILY, checkDaily, formatDaily, utcDay } = await load('src/game/daily.ts');
const { aim, fetchStops, spot } = await load('src/game/rounds.ts');
const { POOLS, setTiled, viewDistance } = await load('src/game/bodies.ts');
const { LESSONS } = await load('src/game/tutorial.ts');
// The game takes the non-commercial imagery, Huygens with it.
(await load('src/game/host.ts')).setHost();

const from = args.from ?? utcDay();
const to = args.to ?? utcDay(Date.parse(from) + 14 * DAY_MS);
const seed = Number(args.seed ?? Math.floor(Math.random() * 1e9));

/** mulberry32: a seed gives the same days again. */
let state = seed >>> 0;
function random() {
	state = (state + 0x6d2b79f5) >>> 0;
	let t = state;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** One of `items`, as likely as its weight. Null when none weighs anything. */
function pick(items, weigh) {
	const weights = items.map((item) => weigh(item));
	let left = random() * weights.reduce((sum, w) => sum + w, 0);
	if (!(left > 0)) return null;
	for (const [i, w] of weights.entries()) if ((left -= w) < 0) return items[i];
	return items.findLast((_, i) => weights[i] > 0);
}

function shuffle(items) {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

const dayNumber = (day) => Date.parse(day) / DAY_MS;

const RAD = Math.PI / 180;
function arc(a, b) {
	const cos =
		Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
		Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD);
	return Math.acos(Math.min(1, Math.max(-1, cos)));
}

const toLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

// --- The rules ---

const BALANCED = POOLS[DAILY.difficulty];
const BODY = new Map(BALANCED.map((body) => [body.id, body]));
const MARS = 'naif-499';

/** How many panoramas a day has, one to three: near Quick Play's coin toss,
 *  less the days with none. */
const GROUND_WEIGHT = [0, 0.25, 0.55, 0.2];
/** At most this many panoramas from Mars a day, each by another probe. */
const MARS_MAX = 2;

/** A Mars probe with thousands of panoramas is a kind of its own, and every
 *  other body is one: Mars would else be the only ground there is. */
const kindOf = (stop) => (stop.body === MARS ? stop.entry.mission : stop.body);
/** A kind with fewer panoramas is rare: a day now and then, not every few. */
const RARE_BELOW = 50;
/** The share of days with a rare kind, never two days running. Due on a
 *  schedule instead, they come back on a beat. */
const RARE_SHARE = 0.25;
/** Days before a rare kind comes back, then days over which it comes due. */
const RARE_GAP = 6;
/** Days by which a rare kind with several sites is stood on again, whatever
 *  the draw: the Moon is the ground most players know after Mars. A kind
 *  with one site waits on `NEAR_DAYS` instead. */
const RARE_DUE = 14;

/** A panorama with a title is a colour 360 its team put together and named:
 *  this share of the days of a probe that has one left show one. */
const CURATED_SHARE = 0.6;
/** A panorama from a stop this near one played in the last `NEAR_DAYS` is the
 *  same round. A probe that never moved comes back once that is past. */
const NEAR_KM = 0.5;
const NEAR_DAYS = 30;
/** A probe's next panorama is weighed down within this of its last one. */
const ALONG_KM = 3;

/** A clouded body is a name to give, not a place to find. A small body or a
 *  bare shape is the hard round few players know. A world is the rest. */
function classOf(body) {
	if (!body.surface && body.radiusKm > 1000) return 'clouded';
	return body.surface && body.radiusKm >= 150 ? 'world' : 'small';
}
/** The share of days with one round of the class, the rest being worlds. A
 *  day with four rounds to fly can have a second small body. */
const CLASS_SHARE = { small: 0.75, clouded: 0.25 };
const SECOND_SMALL = 0.35;
/** Days between two clouded rounds. */
const CLOUDED_GAP = 3;
/** Days before a body is flown over again, then days over which it comes
 *  back into favour: a hard gap alone brings back together the bodies that
 *  were drawn together. A small one stays in mind longer. */
const BODY_GAP = { world: 5, small: 10, clouded: 10 };
const BODY_RETURN = { world: 8, small: 14, clouded: 14 };

/** How high the Sun stands at least over a place flown over, as `aim` counts
 *  it: 1 is the game's floor, and a margin keeps the view from half night. */
const MAX_U = 0.85;
/** Over a body with nothing to find, the view is kept near noon. */
const MAX_U_WHOLE = 0.5;
/** A place flown over this near one flown over before, in radii, is the same. */
const NEAR_RADII = 0.25;
/** A body this well named has its names where it was seen: with none of them
 *  lit, the lit side is the part no probe mapped. */
const NAMED = 5;
/** What part of the view a feature fills to be worth the flight: less is too
 *  small to see, more is the view itself. */
const FILL_MIN = 0.1;
const FILL_MAX = 2;
/** The weight of a feature the IAU gives no size: on Triton, most of them. */
const UNSIZED = 0.5;
/** IAU types that name no landform: satellite craters lettered after their
 *  parent, and the names of landing sites. */
const NO_LANDFORM = new Set(['SF', 'LF']);

// --- What there is, and what was played ---

const stops = (await fetchStops()).filter((stop) => BODY.has(stop.body));
const STOP = new Map(stops.map((stop) => [stop.entry.id, stop]));
const kindSize = new Map();
for (const stop of stops) kindSize.set(kindOf(stop), (kindSize.get(kindOf(stop)) ?? 0) + 1);
const RARE = [...kindSize].filter(([, size]) => size < RARE_BELOW).map(([kind]) => kind);
const COMMON = [...kindSize].filter(([, size]) => size >= RARE_BELOW).map(([kind]) => kind);
/** A kind with more sites to stand on comes up more: the Moon has six, a
 *  lander one. */
const sites = new Map(
	RARE.map((kind) => [
		kind,
		new Set(
			stops
				.filter((stop) => kindOf(stop) === kind)
				.map((stop) => `${stop.entry.lat.toFixed(2)},${stop.entry.lon.toFixed(2)}`)
		).size
	])
);

mkdirSync(FOLDER, { recursive: true });
const kept = readdirSync(FOLDER)
	.filter((name) => /^\d{4}-\d\d-\d\d\.json$/.test(name))
	.map((name) => JSON.parse(readFileSync(FOLDER + name, 'utf8')));

/** Every round played or drawn, with its day: the tutorial's are of no day. */
const played = [
	...LESSONS.map(({ where }) => ({ ...where, day: -Infinity })),
	...kept.flatMap((daily) => daily.rounds.map((where) => ({ ...where, day: dayNumber(daily.day) })))
];

const stopOf = (where) => (where.mode === 'ground' ? STOP.get(where.panorama) : undefined);

/** Days since a round that `match`es, Infinity when there was none. */
function daysSince(day, match) {
	const last = Math.max(...played.filter(match).map((where) => where.day));
	return last === -Infinity ? Infinity : day - last;
}
const sinceKind = (day, kind) =>
	daysSince(day, (where) => stopOf(where) && kindOf(stopOf(where)) === kind);

/** The IAU features of `body`, from the export's marker files. */
async function fetchFeatures(body) {
	const read = async (path) => {
		const answer = await fetch(`${EXPORT}/${path}`);
		if (answer.status === 404) return null;
		if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
		return gunzipSync(Buffer.from(await answer.arrayBuffer()));
	};
	const [raw, labels] = await Promise.all([
		read(`nomenclature/positions/${body}.bin.gz`),
		read(`nomenclature/labels/en/${body}.txt.gz`)
	]);
	if (!raw || !labels) return [];
	const names = labels.toString('utf8').split('\n');
	const features = [];
	for (let i = 0; i < raw.readUInt32LE(8); i++) {
		const at = 16 + 20 * i;
		if (NO_LANDFORM.has(raw.toString('ascii', at + 16, at + 18))) continue;
		features.push({
			name: names[i].trim(),
			lat: raw.readInt32LE(at + 4) / 1e7,
			lon: toLon(raw.readUInt32LE(at + 8) / 1e7),
			km: raw.readUInt32LE(at + 12) / 1000
		});
	}
	return features;
}

const FEATURES = new Map(
	await Promise.all(
		BALANCED.filter((body) => body.surface).map(async (body) => [
			body.id,
			await fetchFeatures(body.id)
		])
	)
);

/** The width of ground a flown round shows, in km: the whole disc when it is
 *  seen from far enough. A device that draws a body's tiles flies lower over
 *  it, Mars a twentieth as high: a feature is sized to read at both. */
function viewWidthKm(body) {
	const width = () => {
		const reach = (viewDistance(body) - 1) * Math.tan(30 * RAD);
		return 2 * Math.min(1, reach) * body.radiusKm;
	};
	const far = width();
	setTiled(body.id, true);
	const near = width();
	setTiled(body.id, false);
	return Math.sqrt(far * near);
}

// --- Drawing a day ---

/** A panorama of `kind`, apart from the ones played: a named colour 360 on
 *  most days, and on along the traverse from the probe's last one. */
function pickPanorama(kind, day) {
	const before = played.filter((where) => where.mode === 'ground');
	const usedIds = new Set(before.map((where) => where.panorama));
	const recent = before
		.filter((where) => day - where.day < NEAR_DAYS)
		.map(stopOf)
		.filter(Boolean);
	const distanceKm = (a, b) => arc(a.entry, b.entry) * BODY.get(a.body).radiusKm;
	const candidates = stops.filter(
		(stop) =>
			kindOf(stop) === kind &&
			!usedIds.has(stop.entry.id) &&
			!recent.some((other) => other.body === stop.body && distanceKm(other, stop) < NEAR_KM)
	);
	const curated = candidates.filter((stop) => stop.entry.title);
	const pool = curated.length && random() < CURATED_SHARE ? curated : candidates;
	const last = stopOf(
		before.findLast((where) => stopOf(where) && kindOf(stopOf(where)) === kind) ?? {}
	);
	return pick(pool, (stop) => (last ? 0.2 + Math.min(1, distanceKm(last, stop) / ALONG_KM) : 1));
}

/** A place on `body` lit at `noon`, apart from where it was flown over: a
 *  named feature the view frames, or anywhere lit on a body with few names.
 *  Null when there is none. */
function pickPlace(body, noon) {
	if (!body.surface) return spot({ u: random() * MAX_U_WHOLE, v: random() }, noon);
	const flown = played.filter((where) => where.mode === 'orbit' && where.body === body.id);
	const apart = (place) => !flown.some((where) => arc(where.over, place) < NEAR_RADII);
	const named = FEATURES.get(body.id) ?? [];
	const width = viewWidthKm(body);
	const feature = pick(
		named.filter((feature) => aim(feature, noon).u <= MAX_U && apart(feature)),
		(feature) => {
			if (!feature.km) return UNSIZED;
			const fill = feature.km / width;
			return fill < FILL_MIN || fill > FILL_MAX ? 0 : Math.min(fill, 1);
		}
	);
	if (feature) return feature;
	if (named.length >= NAMED) return null;
	for (let tries = 0; tries < 50; tries++) {
		const place = spot({ u: random() * MAX_U, v: random() }, noon);
		if (apart(place)) return place;
	}
	return null;
}

/** The rounds in an order with no body twice running. */
function order(rounds) {
	for (let tries = 0; tries < 200; tries++) {
		const out = shuffle(rounds);
		if (out.every((round, i) => i === 0 || out[i - 1].body !== round.body)) return out;
	}
	return shuffle(rounds);
}

const round = (digits) => (degrees) => Number(degrees.toFixed(digits));

async function drawDay(name) {
	const day = dayNumber(name);
	const date = new Date(Date.parse(name) + Math.floor(random() * 288) * 300_000);
	const groundCount = pick([0, 1, 2, 3], (count) => GROUND_WEIGHT[count]);

	// Now and then a rare kind, then Mars.
	const ground = [];
	const sinceRare = daysSince(
		day,
		(where) => stopOf(where) && RARE.includes(kindOf(stopOf(where)))
	);
	const overdue = RARE.find((kind) => sites.get(kind) > 1 && sinceKind(day, kind) >= RARE_DUE);
	if (groundCount && sinceRare > 1 && (overdue || random() < RARE_SHARE)) {
		const kind =
			overdue ??
			pick(RARE, (kind) => {
				const since = sinceKind(day, kind);
				if (since < RARE_GAP) return 0;
				return Math.sqrt(sites.get(kind)) * Math.min(1, (since - RARE_GAP + 1) / RARE_GAP);
			});
		const stop = kind && pickPanorama(kind, day);
		if (stop) ground.push(stop);
	}
	const onMars = () => ground.filter((stop) => stop.body === MARS);
	// A probe that kept to a few km runs out of stops apart from its last
	// month: the next one is asked.
	const spent = new Set();
	while (ground.length < groundCount && onMars().length < MARS_MAX) {
		const kind = pick(
			COMMON.filter(
				(kind) => !spent.has(kind) && !onMars().some((stop) => stop.entry.mission === kind)
			),
			(kind) => Math.min(8, sinceKind(day, kind)) ** 1.5
		);
		if (!kind) break;
		const stop = pickPanorama(kind, day);
		if (stop) ground.push(stop);
		else spent.add(kind);
	}

	// The sky: bodies with a noon, and moons out of shadow.
	const sky = new Map();
	for (const body of BALANCED) {
		const noon = await subsolarPoint(body.id, date);
		if (!noon) continue;
		if (body.system !== body.id && ((await sunlight(body.id, date)) ?? 1) < 1) continue;
		sky.set(body.id, noon);
	}

	// One body a system, so a day spans the Solar System. With two panoramas
	// of Mars, a third round there is one too many.
	const systems = new Set(
		ground.filter((stop) => stop.body !== MARS).map((stop) => BODY.get(stop.body).system)
	);
	if (onMars().length >= MARS_MAX) systems.add(MARS);

	// The day's mix first: left to the weights, the worlds a gap holds back
	// leave their share to the odd ones.
	const slots = DAILY.rounds - ground.length;
	const sinceClouded = daysSince(
		day,
		(where) => where.mode === 'orbit' && classOf(BODY.get(where.body)) === 'clouded'
	);
	const mix = [];
	if (sinceClouded >= CLOUDED_GAP && random() < CLASS_SHARE.clouded) mix.push('clouded');
	if (slots - mix.length >= 2 && random() < CLASS_SHARE.small) mix.push('small');
	if (slots - mix.length >= 3 && mix.includes('small') && random() < SECOND_SMALL)
		mix.push('small');
	while (mix.length < slots) mix.push('world');

	const orbit = [];
	const placeless = new Set();
	const weigh = (strict) => (body) => {
		const gap = BODY_GAP[classOf(body)] * strict;
		const since = daysSince(day, (where) => where.mode === 'orbit' && where.body === body.id);
		if (since < gap) return 0;
		const fresh =
			since === Infinity ? 1.5 : 1 - Math.exp(-(since - gap + 1) / BODY_RETURN[classOf(body)]);
		// Seen from the ground the same day, Mars is half the weight.
		return body.id === MARS && onMars().length ? fresh / 2 : fresh;
	};
	for (const cls of mix) {
		for (;;) {
			const open = (of) =>
				BALANCED.filter(
					(body) =>
						classOf(body) === of &&
						sky.has(body.id) &&
						!systems.has(body.system) &&
						!placeless.has(body.id)
				);
			// Short of worlds, a small body stands in. Short of both, the gaps
			// shrink before the day goes without.
			let body =
				pick(open(cls), weigh(1)) ?? (cls === 'world' ? pick(open('small'), weigh(1)) : null);
			if (!body) {
				body = pick(open(cls), weigh(0.5)) ?? pick(open(cls), weigh(0));
				if (!body) throw new Error(`${name}: no ${cls} body left to fly over`);
				console.warn(`${name}: ${body.name} flown over again before its gap is out`);
			}
			const place = pickPlace(body, sky.get(body.id));
			if (!place) {
				placeless.add(body.id);
				continue;
			}
			systems.add(body.system);
			orbit.push({ body, place });
			break;
		}
	}

	const rounds = order([
		...ground.map((stop) => ({ mode: 'ground', body: stop.body, panorama: stop.entry.id })),
		...orbit.map(({ body, place }) => ({
			mode: 'orbit',
			body: body.id,
			over: { lat: round(2)(place.lat), lon: round(2)(place.lon) },
			noon: { lat: round(4)(sky.get(body.id).lat), lon: round(4)(sky.get(body.id).lon) },
			name: place.name
		}))
	]);
	const names = rounds.map((where) => where.name);
	for (const where of rounds) delete where.name;
	return { daily: { day: name, time: date.toISOString().replace('.000Z', 'Z'), rounds }, names };
}

// --- The days ---

function describe(where, name) {
	const body = BODY.get(where.body)?.name ?? where.body;
	if (where.mode === 'orbit')
		return `${body} from orbit, over ${name ?? `${where.over.lat}, ${where.over.lon}`}`;
	const { entry } = STOP.get(where.panorama);
	return `${body}, ${entry.mission}: ${entry.title ?? where.panorama}`;
}

console.log(`seed ${seed}, ${from} to ${to}`);
let failed = 0;
for (let day = dayNumber(from); day <= dayNumber(to); day++) {
	const name = utcDay(day * DAY_MS);
	const path = `${FOLDER}${name}.json`;
	if (existsSync(path)) {
		console.log(`${name}: kept`);
		continue;
	}
	const { daily, names } = await drawDay(name);
	const { problems } = await checkDaily(`${name}.json`, daily, stops);
	for (const problem of problems) console.error(`${name}: ${problem}`);
	if (problems.length) {
		failed++;
		continue;
	}
	writeFileSync(path, formatDaily(daily));
	played.push(...daily.rounds.map((where) => ({ ...where, day })));
	console.log(`${name}, at ${daily.time.slice(11, 16)}`);
	for (const [i, where] of daily.rounds.entries()) console.log(`  ${describe(where, names[i])}`);
}
if (failed) {
	console.error(`${failed} day(s) not drawn`);
	process.exit(1);
}

// Writes src/game/bodies.json: every body the published export can show well
// enough to guess at. Run it when the export gains a map or a shape model:
//   node scripts/build-bodies.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DATA = 'https://static.spacemap.co';
const OUT = new URL('../src/game/bodies.json', import.meta.url);

/**
 * Left out by hand, with why. Each was stood over in the map before it went in
 * here; the export says none of this about itself.
 */
const EXCLUDED = {
	'naif-10': 'the Sun has no surface to stand over',
	'naif-399': 'every other guessing game is already here',
	'spkid-120065803': 'a moon of an asteroid: the map never loads it',
	'spkid-20101955': 'Bennu: the map has no position for it at present dates',
	'spkid-20065803': 'Didymos: the map has no position for it at present dates',
	'naif-635': 'Daphnis: too small for the map to draw',
	'naif-701': 'Ariel: the side in sunlight this decade was never mapped',
	'naif-702': 'Umbriel: the side in sunlight this decade was never mapped',
	'naif-703': 'Titania: the side in sunlight this decade was never mapped',
	'naif-704': 'Oberon: the side in sunlight this decade was never mapped'
};

/** Nothing of the ground shows from orbit, so the body is the whole answer. */
const CLOUDED = new Set([
	'naif-299', // Venus
	'naif-599',
	'naif-606', // Titan
	'naif-699',
	'naif-799',
	'naif-899'
]);

/** Semi-major axis of Jupiter in AU: what divides the two zones. */
const JUPITER_AU = 5.2;

async function get(path) {
	const response = await fetch(`${DATA}${path}`);
	if (!response.ok) return null;
	const bytes = Buffer.from(await response.arrayBuffer());
	const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
	return JSON.parse(text.toString('utf8'));
}

const meta = await get('/v1/metadata.json');
const { versions } = meta;
const versioned = (path, cls) => get(`${path}?v=${versions[cls]}`);

/** The export's own record of an object, out of the hash bucket it is filed in. */
const buckets = new Map();
async function recordOf(id) {
	const bucket =
		createHash('sha256').update(id).digest().readUInt32BE(0) % meta.object_bundles.global;
	if (!buckets.has(bucket))
		buckets.set(bucket, versioned(`/v1/objects/__global__/${bucket}.json.gz`, 'objects'));
	return (await buckets.get(bucket))?.[id] ?? null;
}

/** "101955 Bennu" is Bennu and "(29075) 1950 DA" is 1950 DA, which is all the
 *  name that one has. A comet keeps its number: it is how it is known. */
function tidy(name) {
	return name.replace(/^\(\d+\) /, '').replace(/^\d+ (?=[A-Z][a-z])/, '');
}

/** Pixels across a WebP, from whichever of its three headers it opens with. */
function webpWidth(bytes) {
	const chunk = bytes.toString('latin1', 12, 16);
	if (chunk === 'VP8X') return bytes.readUIntLE(24, 3) + 1;
	if (chunk === 'VP8L') return (bytes.readUInt16LE(21) & 0x3fff) + 1;
	if (chunk === 'VP8 ') return bytes.readUInt16LE(26) & 0x3fff;
	return 0;
}

/** How wide the best tier of a map is, in pixels round the equator. The export
 *  publishes no size for it, so the picture's own header is read. */
async function widthOf(bundle, tiers = ['high', 'medium', 'low']) {
	for (const tier of ['high', 'medium', 'low'].filter((t) => tiers.includes(t))) {
		const response = await fetch(
			`${DATA}/v1/textures/${bundle}/${tier}.webp?v=${versions.textures}`,
			{ headers: { Range: 'bytes=0-63' } }
		);
		if (!response.ok) continue;
		const width = webpWidth(Buffer.from(await response.arrayBuffer()));
		if (width) return width;
	}
	return 0;
}

/** The best map this app may draw: the first that is open, or licensed for
 *  non-commercial use, which the game is. */
function openMap(id, texture, tiers, alternates = []) {
	return [{ id, tiers, ...texture }, ...alternates].find(
		(map) => map.type && (!map.distribution || map.distribution === 'non-commercial')
	);
}

const KINDS = { planet: 'planet', dwarf_planet: 'dwarf', moon: 'moon', comet: 'comet' };

/** A planet or moon's NAIF code is its barycentre's with two more digits. */
function systemOf(id) {
	const match = /^naif-(\d)\d\d$/.exec(id);
	return match ? `naif-${match[1]}99` : id;
}

/** Every body with a map or a measured shape: the candidates. */
const candidates = new Map();
for (let n = 1; n <= 9; n++) {
	const system = await get(`/v1/systems/naif-${n}.json`);
	for (const [id, entry] of Object.entries(system ?? {})) {
		const map = openMap(id, entry.texture, entry.tiers, entry.alternates);
		if (map || CLOUDED.has(id)) candidates.set(id, { map });
	}
}
const models = await versioned('/v1/models/index.json', 'models');
for (const bundle of Object.values(models.bundles)) {
	if (bundle.kind !== 'shape_model') continue;
	for (const object of bundle.objects)
		candidates.set(object.id, { ...candidates.get(object.id), model: true });
}

/** Orbits round the Sun as the Solar System map has them: Pluto's own record
 *  is of its orbit round Charon. */
const solar = await get('/v1/groups/__solar_system_map__.json.gz');
const heliocentric = new Map(solar.objects.map((o) => [o.id, o]));

const out = [];
for (const [id, { map: systemMap, model }] of candidates) {
	if (id in EXCLUDED) continue;
	const record = await recordOf(id);
	if (!record) throw new Error(`${id} has no record`);
	const system = systemOf(id);
	const kind = KINDS[record.type] ?? 'asteroid';
	// A body in no system file carries its map in its own record.
	const map =
		systemMap ??
		(record.map_texture_available
			? openMap(id, record.texture, undefined, record.alternates)
			: undefined);
	const widthPx = map ? await widthOf(map.id, map.tiers) : 0;
	const { a, b, c } = record.radii ?? {};
	const radiusKm = a
		? (a + b + c) / 3
		: record.sbdb?.diameter
			? record.sbdb.diameter / 2
			: undefined;
	// With no size there is nothing to frame the camera on.
	if (!radiusKm) {
		console.warn(`skipped ${id} ${record.name}: no size`);
		continue;
	}
	// What orbits the Sun by itself is found on the zone maps, which place it
	// by its orbit.
	const small = system === id && kind !== 'planet';
	const orbit = heliocentric.get(id) ?? record.orbit;
	out.push({
		id,
		name: tidy(record.name),
		kind,
		system,
		zone: small ? (orbit.a < JUPITER_AU ? 'inner' : 'outer') : undefined,
		aAu: small ? Math.round(orbit.a * 1000) / 1000 : undefined,
		tiltDeg: small ? Math.round(orbit.i * 10) / 10 : undefined,
		radiusKm: Math.round(radiusKm * 100) / 100,
		widthPx: widthPx || undefined,
		surface: widthPx > 0 && !CLOUDED.has(id),
		model: model || undefined,
		// With no measured spin there is no noon to stand under.
		spin: record.orientation ? undefined : false
	});
}
out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

writeFileSync(OUT, `${JSON.stringify(out, null, '\t')}\n`);
console.log(`${out.length} bodies, ${out.filter((b) => b.surface).length} with a map to guess on`);

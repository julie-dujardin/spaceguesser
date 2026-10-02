// Writes src/game/bodies.json: every body the published export can show well
// enough to guess at. Run it when the export gains a map or a shape model:
//   node scripts/build-bodies.mjs
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DATA = 'https://static.spacemap.co';
const OUT = new URL('../src/game/bodies.json', import.meta.url);

/** Left out by hand, with why. */
const EXCLUDED = {
	'naif-10': 'the Sun has no surface to stand over',
	'naif-399': 'every other guessing game is already here',
	'spkid-120065803': 'a moon of an asteroid: the map never loads it'
};

/** Clouds all the way down: the body is the whole answer. */
const GIANTS = new Set(['naif-599', 'naif-699', 'naif-799', 'naif-899']);

/** Mapped bodies the export's own lists do not name. */
const NAMES = {
	'naif-705': 'Miranda',
	'naif-715': 'Puck',
	'naif-901': 'Charon',
	'naif-902': 'Nix',
	'naif-903': 'Hydra'
};

/** Small bodies that live beyond Jupiter; the rest are inside its orbit. */
const OUTER = new Set(['naif-999', 'spkid-20486958', 'spkid-1000036']);

async function get(path) {
	const response = await fetch(`${DATA}${path}`);
	if (!response.ok) return null;
	const bytes = Buffer.from(await response.arrayBuffer());
	const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
	return JSON.parse(text.toString('utf8'));
}

const versions = (await get('/v1/metadata.json')).versions;
const versioned = (path, cls) => get(`${path}?v=${versions[cls]}`);

/** "101955 Bennu" is Bennu, but "1950 DA" is all the name it has. */
function tidy(name) {
	return /^\d{4} [A-Z]{2}\d*$/.test(name) ? name : name.replace(/^\d+ /, '');
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
			{
				headers: { Range: 'bytes=0-63' }
			}
		);
		if (!response.ok) continue;
		const width = webpWidth(Buffer.from(await response.arrayBuffer()));
		if (width) return width;
	}
	return 0;
}

const KINDS = { dwarf_planet: 'dwarf', moon: 'moon', comet: 'comet' };
const kindOf = (type) => KINDS[type] ?? 'asteroid';

/** A planet or moon's NAIF code is its barycentre's with two more digits. */
function systemOf(id) {
	const match = /^naif-(\d)\d\d$/.exec(id);
	return match ? `naif-${match[1]}99` : id;
}

const bodies = new Map();
const add = (id, patch) => bodies.set(id, { ...bodies.get(id), id, ...patch });

const solar = await get('/v1/groups/__solar_system_map__.json.gz');
const listed = new Map(solar.objects.map((o) => [o.id, o]));

for (let n = 1; n <= 9; n++) {
	const system = await get(`/v1/systems/naif-${n}.json`);
	for (const [id, entry] of Object.entries(system ?? {})) {
		// The best map this app may draw: the first one with no licence attached.
		const open = [{ id, tiers: entry.tiers, ...entry.texture }, ...(entry.alternates ?? [])].find(
			(map) => map.type && !map.distribution
		);
		const width = open ? await widthOf(open.id, open.tiers) : 0;
		if (!width && !GIANTS.has(id)) continue;
		const { a, b, c } = entry.radii ?? {};
		add(id, {
			name: NAMES[id] ?? (listed.has(id) ? tidy(listed.get(id).name) : undefined),
			kind: !id.endsWith('99') ? 'moon' : id === 'naif-999' ? 'dwarf' : 'planet',
			radiusKm: a ? Math.round(((a + b + c) / 3) * 10) / 10 : undefined,
			widthPx: width || undefined,
			surface: width > 0 && !GIANTS.has(id)
		});
	}
}

const models = await versioned('/v1/models/index.json', 'models');
for (const bundle of Object.values(models.bundles)) {
	if (bundle.kind !== 'shape_model') continue;
	for (const object of bundle.objects) {
		const known = bodies.get(object.id);
		add(object.id, {
			name: known?.name ?? tidy(object.name),
			kind: known?.kind ?? kindOf(object.type),
			model: true,
			surface: known?.surface ?? false
		});
	}
}

// Ceres and Vesta are mapped too, outside any planet's system file.
for (const [id, body] of bodies) {
	if (body.widthPx || /^naif-\d\d\d$/.test(id)) continue;
	const width = await widthOf(id);
	if (width) add(id, { widthPx: width, surface: true });
}

const out = [...bodies.values()]
	.filter((body) => !(body.id in EXCLUDED))
	.map((body) => {
		if (!body.name) throw new Error(`${body.id} has no name: add it to NAMES`);
		const system = systemOf(body.id);
		// Only what orbits the Sun on its own belongs to a zone.
		const small = system === body.id && body.kind !== 'planet';
		return { ...body, system, zone: small ? (OUTER.has(body.id) ? 'outer' : 'inner') : undefined };
	})
	.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

writeFileSync(OUT, `${JSON.stringify(out, null, '\t')}\n`);
console.log(`${out.length} bodies, ${out.filter((b) => b.surface).length} with a map to guess on`);

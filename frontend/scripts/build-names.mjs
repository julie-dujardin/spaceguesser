// Writes src/game/names.json: what the bodies in play are called in each of
// the app's languages but English, which the catalogue already has. Run it
// when the app gains a language or the catalogue a body:
//   node scripts/build-names.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DATA = 'https://static.spacemap.co';
const OUT = new URL('../src/game/names.json', import.meta.url);

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const bodies = read('../src/game/bodies.json');
const { baseLocale, locales } = read('../project.inlang/settings.json');

/** The export's names in one language, by id; null when it has none in it. */
async function labels(locale) {
	const response = await fetch(`${DATA}/v1/labels/${locale}.gz`);
	if (!response.ok) return null;
	const bytes = Buffer.from(await response.arrayBuffer());
	const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
	return new Map(
		text
			.toString('utf8')
			.split('\n')
			.filter((line) => line.includes('\x1f'))
			.map((line) => line.split('\x1f'))
	);
}

/** As the catalogue tidies its own: "(16) Psyché" and "16 Psyche" are Psyche. */
function tidy(name) {
	return name.replace(/^\(\d+\) /, '').replace(/^\d+ (?=\p{Lu}\p{Ll})/u, '');
}

// A primary nobody stands over still names its system.
const primaries = new Set(bodies.map((body) => body.system));
for (const { id } of bodies) primaries.delete(id);
// A comet goes by its designation in every language.
const named = [
	...bodies.filter((body) => body.kind !== 'comet'),
	...[...primaries].map((id) => ({ id }))
];

const english = await labels(baseLocale);
if (!english) throw new Error(`the export has no ${baseLocale} names`);

const out = {};
for (const locale of locales.filter((code) => code !== baseLocale)) {
	const theirs = await labels(locale);
	if (!theirs) {
		console.warn(`skipped ${locale}: the export has no names in it`);
		continue;
	}
	out[locale] = {};
	for (const { id, name } of named) {
		const label = theirs.get(id);
		// The export falls back to English where a language has no name.
		if (!label || label === english.get(id)) continue;
		if (tidy(label) !== name) out[locale][id] = tidy(label);
	}
	console.log(`${locale}: ${Object.keys(out[locale]).length} names`);
}

writeFileSync(OUT, `${JSON.stringify(out, null, '\t')}\n`);

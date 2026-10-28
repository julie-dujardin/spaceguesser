// Checks the daily challenge files, then copies them to the VPS and to the R2
// backup. A flown round can leave out `noon`: the check writes it in the file.
//   node scripts/upload-dailies.mjs           check, then upload
//   node scripts/upload-dailies.mjs --check   check only
// The files are in `dailies/` at the root of the repository, one per UTC day,
// named `YYYY-MM-DD.json`. A file has `day`, `time` (an ISO moment: the sky of
// every round) and five `rounds`, each one of:
//   { "mode": "ground", "body": "naif-499", "panorama": "<panorama id>" }
//   { "mode": "orbit", "body": "naif-501", "over": { "lat": 10, "lon": 115 } }
// `DAILY_VPS` is the rsync destination (`host:/srv/spaceguesser/daily`) and
// `DAILY_BUCKET` the R2 bucket, from the shell or from the root `.env`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FOLDER = `${ROOT}dailies/`;

try {
	process.loadEnvFile(`${ROOT}.env`);
} catch {
	// No `.env`: the shell gives the settings.
}

function run(command, args) {
	const { status } = spawnSync(command, args, { cwd: FRONTEND, stdio: 'inherit' });
	if (status !== 0) {
		console.error(`${command} failed`);
		process.exit(1);
	}
}

const names = existsSync(FOLDER)
	? readdirSync(FOLDER)
			.filter((name) => name.endsWith('.json'))
			.sort()
	: [];
// rsync deletes on the VPS what is not here: an empty folder is a mistake.
if (!names.length) {
	console.error(`no files in ${FOLDER}`);
	process.exit(1);
}

// The game's own modules read their messages.
if (!existsSync(`${FRONTEND}src/paraglide/messages.js`)) run('pnpm', ['messages']);
const load = async (path) =>
	(await runnerImport(`${FRONTEND}${path}`, { configFile: false, logLevel: 'error' })).module;
const { checkDaily, formatDaily, utcDay } = await load('src/game/daily.ts');
const { fetchStops } = await load('src/game/rounds.ts');
// The game takes the non-commercial imagery, Huygens with it.
(await load('src/game/host.ts')).setHost();

// A day gone by was checked before it began, against the panoramas of then.
const ahead = names.filter((name) => name >= `${utcDay()}.json`);
const stops = await fetchStops();
let failed = 0;
for (const name of ahead) {
	const path = FOLDER + name;
	let value;
	try {
		value = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		console.error(`${name}: ${error.message}`);
		failed++;
		continue;
	}
	const { filled, problems } = await checkDaily(name, value, stops);
	if (filled) writeFileSync(path, formatDaily(value));
	for (const problem of problems) console.error(`${name}: ${problem}`);
	if (problems.length) failed++;
	else console.log(`${name}: ok${filled ? `, noon written for ${filled} round(s)` : ''}`);
}
console.log(`${ahead.length} day(s) from today checked, ${names.length - ahead.length} past`);
if (failed) {
	console.error(`${failed} file(s) to fix: nothing uploaded`);
	process.exit(1);
}
if (process.argv.includes('--check')) process.exit(0);

const { DAILY_VPS: vps, DAILY_BUCKET: bucket } = process.env;
if (!vps || !bucket) {
	console.error('set DAILY_VPS and DAILY_BUCKET to upload');
	process.exit(1);
}
// Readable by the server, which runs as nobody. A file renamed here must not
// stay there under its old day.
run('rsync', [
	'-rt',
	'--delete',
	'--chmod=D755,F644',
	'--include=*.json',
	'--exclude=*',
	FOLDER,
	`${vps.replace(/\/?$/, '/')}`
]);
console.log(`${names.length} file(s) on ${vps}`);
// The past days went to R2 while they were ahead.
for (const name of ahead) {
	run('pnpm', [
		'exec',
		'wrangler',
		'r2',
		'object',
		'put',
		`${bucket}/${name}`,
		'--file',
		FOLDER + name,
		'--content-type',
		'application/json',
		'--remote'
	]);
}
console.log(`${ahead.length} file(s) in R2 ${bucket}`);

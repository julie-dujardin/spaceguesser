// Whether a panorama shows the whole horizon. The export's `hfov_deg` is the
// frame of the mosaic, and `sphere_percent` cannot tell a ring of ground from
// a turn of the horizon: only the image's own alpha can.
import sharp from 'sharp';

const EXPORT = 'https://static.spacemap.co/v1';
/** Texels a degree of the sized-down image. */
const PER_DEG = 4;
/** The share of azimuths with data. Mosaics leave a few columns at the seam. */
const MIN_COVERED = 0.98;
/** An azimuth with less than this has a stray frame, not a view. */
const MIN_SPAN_DEG = 5;
/** The elevation the view must span. It is below the horizon to take in
 *  mosaics that stop just above it. */
const LEVEL_DEG = -8;

/** What `alpha`, a 360 by 180 degree grid from the top, shows of the horizon. */
export function measureTurn(alpha, width, height) {
	let covered = 0;
	let top = 0;
	let bottom = 0;
	for (let x = 0; x < width; x++) {
		let first = -1;
		let last = -1;
		let count = 0;
		for (let y = 0; y < height; y++) {
			if (alpha[y * width + x] <= 8) continue;
			if (first < 0) first = y;
			last = y;
			count++;
		}
		if (count < MIN_SPAN_DEG * PER_DEG) continue;
		covered++;
		top += 90 - first / PER_DEG;
		bottom += 90 - (last + 1) / PER_DEG;
	}
	// A tilted rover's horizon is a wave: its mean is level.
	return {
		covered: covered / width,
		top: covered ? top / covered : -90,
		bottom: covered ? bottom / covered : 90
	};
}

export const isFullTurn = ({ covered, top, bottom }) =>
	covered >= MIN_COVERED && top > LEVEL_DEG && bottom < LEVEL_DEG;

/** Read one alpha image into `measureTurn`'s grid. */
export async function readTurn(image) {
	const width = 360 * PER_DEG;
	const height = 180 * PER_DEG;
	const alpha = await sharp(image)
		.ensureAlpha()
		.extractChannel('alpha')
		.resize(width, height, { fit: 'fill', kernel: 'nearest' })
		.raw()
		.toBuffer();
	return measureTurn(alpha, width, height);
}

const known = new Map();

/** Whether `stop` can be played as a full turn, or is played anyway when
 *  `waived` says so. */
export function showsFullTurn({ entry }, waived) {
	if (waived(entry)) return Promise.resolve(true);
	if (!known.has(entry.id))
		known.set(
			entry.id,
			(async () => {
				const answer = await fetch(`${EXPORT}/panoramas/${entry.id}.webp`);
				if (!answer.ok) throw new Error(`${entry.id}: ${answer.status}`);
				return isFullTurn(await readTurn(Buffer.from(await answer.arrayBuffer())));
			})()
		);
	return known.get(entry.id);
}

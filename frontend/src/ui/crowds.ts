/**
 * The whole run's view, where rows of pins that would land on one another go
 * together in one box instead, clear of the map's names. From far enough the
 * inner planets are one dot, and their rows one heap; nearer, the box parts
 * into its rows again.
 */

/** A box on screen, in pixels. */
export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Room left round a box, so that the rings round the pins do not touch. */
const MARGIN = 8;
/** Below the place the box is for, as a row of pins hangs below its dot. */
const UNDER = 12;
/** How far a box may go to find room, and in what steps. */
const REACH = 160;
const STEP = 8;
/** The most pins on one line of a box. */
const ACROSS = 5;
/** Where a line from the place begins: out of its dot. */
const LEADER_GAP = 6;
/** A box this near, and under its place, needs no line to it. */
const LEADER_FROM = 48;

export function overlaps(a: Box, b: Box, margin = 0): boolean {
	return (
		a.left < b.right + margin &&
		b.left < a.right + margin &&
		a.top < b.bottom + margin &&
		b.top < a.bottom + margin
	);
}

function moved(box: Box, [dx, dy]: Offset): Box {
	return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}

/** The boxes that touch, directly or through others, by index: only the
 *  groups of two and more. */
export function crowds(boxes: Box[], margin = MARGIN): number[][] {
	const parent = boxes.map((_, index) => index);
	const root = (index: number): number =>
		parent[index] === index ? index : (parent[index] = root(parent[index]));
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length; j++)
			if (overlaps(boxes[i], boxes[j], margin)) parent[root(i)] = root(j);
	const groups = new Map<number, number[]>();
	boxes.forEach((_, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), index]));
	return [...groups.values()].filter((group) => group.length > 1);
}

export type Offset = [number, number];

/** Nearest first. A step aside costs less than one down, which takes the box
 *  further from its place; on a tie, down and right go first. */
const OFFSETS: Offset[] = [];
for (let dx = -REACH; dx <= REACH; dx += STEP)
	for (let dy = -REACH; dy <= REACH; dy += STEP) OFFSETS.push([dx, dy]);
OFFSETS.sort(
	([ax, ay], [bx, by]) => Math.hypot(ax, 1.5 * ay) - Math.hypot(bx, 1.5 * by) || by - ay || bx - ax
);

/**
 * How far to move `box` so that it covers none of `taken` and stays inside
 * `bounds`. It stays where it is when it can, and then where it went last, so
 * that it does not hop about as the view moves. Where nothing is free, it
 * stays.
 */
export function settle(box: Box, taken: Box[], bounds: Box, last?: Offset): Offset {
	const free = (offset: Offset) => {
		const there = moved(box, offset);
		return (
			there.left >= bounds.left &&
			there.top >= bounds.top &&
			there.right <= bounds.right &&
			there.bottom <= bounds.bottom &&
			!taken.some((other) => overlaps(there, other, MARGIN))
		);
	};
	if (free([0, 0])) return [0, 0];
	if (last && free(last)) return last;
	return OFFSETS.find(free) ?? [0, 0];
}

/** A heap of rows shown as one box. */
interface Merged {
	box: HTMLElement;
	leader: HTMLElement;
	last: Offset;
}

function boxOf(rect: DOMRect): Box {
	return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** The pins of the rows, in the order of the rounds, each place before its
 *  guess. */
function gather(rows: HTMLElement[]): HTMLElement {
	const pins = rows.flatMap((row) => [...row.children] as HTMLElement[]);
	const order = (pin: HTMLElement) =>
		2 * Number(pin.textContent) + (pin.classList.contains('truth') ? 0 : 1);
	const box = document.createElement('div');
	box.className = 'crowd';
	// Lines of even length, as many pins to one as a row of pins takes.
	const lines = Math.ceil(pins.length / ACROSS);
	box.style.setProperty('--across', String(Math.ceil(pins.length / lines)));
	box.append(...pins.sort((a, b) => order(a) - order(b)).map((pin) => pin.cloneNode(true)));
	return box;
}

/**
 * Watch `rows`, the rows of pins the map holds under each place, and show the
 * ones that land on one another as one box in `layer`, which lies over the
 * map. Returns what stops it.
 */
export function declutter(rows: HTMLElement[], layer: HTMLElement): () => void {
	const merged = new Map<string, Merged>();
	// How far each row hangs under its place.
	const hangs = new Map(rows.map((row) => [row, parseFloat(getComputedStyle(row).marginTop) || 0]));
	let frame = 0;

	const tick = () => {
		frame = requestAnimationFrame(tick);
		const origin = layer.getBoundingClientRect();
		const bounds: Box = {
			left: origin.left + MARGIN,
			top: origin.top + MARGIN,
			right: origin.right - MARGIN,
			bottom: origin.bottom - MARGIN
		};
		// A row the map has hidden, behind the camera or not yet placed, has no size.
		const shown = rows.filter((row) => row.offsetWidth > 0);
		const boxes = shown.map((row) => boxOf(row.getBoundingClientRect()));
		const groups = crowds(boxes);
		const inGroup = new Set(groups.flat());

		// Everything else in the map's layer: the names and the rings round the
		// bodies, as far as they are drawn.
		const marks: Box[] = [];
		for (const child of rows[0]?.parentElement?.children ?? []) {
			if (rows.includes(child as HTMLElement)) continue;
			for (const part of [child, ...child.querySelectorAll('*')]) {
				const rect = part.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) marks.push(boxOf(rect));
			}
		}
		const taken = boxes.filter((_, index) => !inGroup.has(index));

		const kept = new Set<string>();
		const hidden = new Set<HTMLElement>();
		for (const group of groups.sort((a, b) => b.length - a.length)) {
			const members = group.map((index) => shown[index]);
			const key = members.map((row) => rows.indexOf(row)).join(',');
			kept.add(key);
			let entry = merged.get(key);
			if (!entry) {
				const box = gather(members);
				const leader = document.createElement('div');
				leader.className = 'crowd-leader';
				layer.append(leader, box);
				entry = { box, leader, last: [0, 0] };
				merged.set(key, entry);
			}
			members.forEach((row) => hidden.add(row));

			const places = group.map((index) => ({
				x: (boxes[index].left + boxes[index].right) / 2,
				y: boxes[index].top - (hangs.get(shown[index]) ?? 0)
			}));
			const x = places.reduce((sum, place) => sum + place.x, 0) / places.length;
			const y = places.reduce((sum, place) => sum + place.y, 0) / places.length;
			const width = entry.box.offsetWidth;
			const height = entry.box.offsetHeight;
			const home: Box = {
				left: x - width / 2,
				top: y + UNDER,
				right: x + width / 2,
				bottom: y + UNDER + height
			};
			// The group's own dots are where the box points, not in its way.
			const clear = marks.filter(
				(mark) =>
					!places.some(
						(place) =>
							place.x >= mark.left &&
							place.x <= mark.right &&
							place.y >= mark.top &&
							place.y <= mark.bottom
					)
			);
			const offset = settle(home, [...clear, ...taken], bounds, entry.last);
			entry.last = offset;
			const there = moved(home, offset);
			taken.push(there);
			entry.box.style.transform = `translate(${there.left - origin.left}px, ${there.top - origin.top}px)`;

			// Away from its place, the box keeps a line to it.
			const toX = Math.min(Math.max(x, there.left), there.right);
			const toY = Math.min(Math.max(y, there.top), there.bottom);
			const length = Math.hypot(toX - x, toY - y) - LEADER_GAP;
			const far = x < there.left || x > there.right || length > LEADER_FROM;
			entry.leader.style.display = far ? '' : 'none';
			if (far) {
				const angle = Math.atan2(toY - y, toX - x);
				const fromX = x + LEADER_GAP * Math.cos(angle) - origin.left;
				const fromY = y + LEADER_GAP * Math.sin(angle) - origin.top;
				entry.leader.style.width = `${length}px`;
				entry.leader.style.transform = `translate(${fromX}px, ${fromY}px) rotate(${angle}rad)`;
			}
		}

		for (const [key, entry] of merged) {
			if (kept.has(key)) continue;
			entry.box.remove();
			entry.leader.remove();
			merged.delete(key);
		}
		rows.forEach((row) => row.classList.toggle('merged', hidden.has(row)));
	};
	frame = requestAnimationFrame(tick);

	return () => {
		cancelAnimationFrame(frame);
		for (const entry of merged.values()) {
			entry.box.remove();
			entry.leader.remove();
		}
		rows.forEach((row) => row.classList.remove('merged'));
	};
}

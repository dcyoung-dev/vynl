/** Shared isometric geometry for the deck drawing: one camera, so the plinth, record and arm register. */
export const VIEW = { w: 440, h: 320 } as const;

const KX = 0.693;
const KY = 0.4;
const ORIGIN = { x: 220, y: 150 } as const;

/** World point (x and y on the floor, z up) to screen. */
export function P(x: number, y: number, z = 0): [number, number] {
  return [ORIGIN.x + KX * (x - y), ORIGIN.y + KY * (x + y) - z];
}

/** Maps a local floor plane onto the screen, so a spinning disc turns in true perspective. */
export const PLANE = `matrix(${KX} ${KY} ${-KX} ${KY} ${ORIGIN.x} ${ORIGIN.y})`;

export const PLINTH = { hx: 150, hy: 115, depth: 26 } as const;
export const RECORD = { cx: -30, cy: 0, r: 100, label: 34 } as const;
export const ARM = {
  pivot: { x: 118, y: -78 },
  length: 150,
  post: 14,
} as const;

export const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
export const poly = (corners: [number, number, number][]) => pts(corners.map(([x, y, z]) => P(x, y, z)));

/** Small parts on the plinth, in floor-plane coordinates. */
export const PINS = {
  slot: 34,
  knob: { x: 112, y: 70 },
  led: { x: 70, y: 92 },
} as const;

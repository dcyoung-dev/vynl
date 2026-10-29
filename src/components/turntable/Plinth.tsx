import { ARM, P, PINS, PLANE, PLINTH, poly, RECORD, VIEW } from './deck';

const { hx, hy, depth } = PLINTH;
const inset = (n: number): [number, number, number][] => [
  [-hx + n, -hy + n, 0],
  [hx - n, -hy + n, 0],
  [hx - n, hy - n, 0],
  [-hx + n, hy - n, 0],
];

const FEET: [number, number][] = [
  [-hx + 14, hy - 14],
  [hx - 14, hy - 14],
  [hx - 14, -hy + 14],
];

const RULER = Array.from({ length: 21 }, (_, i) => -96 + i * 6);
const KNURL = Array.from({ length: 16 }, (_, i) => (i * 360) / 16);

/** Static deck body: shadow, feet, a four-tone plinth, and the small parts that sit on it. */
export default function Plinth({ playing }: { playing: boolean }) {
  const [sx, sy] = P(0, 0, -depth - 6);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      width={VIEW.w}
      height={VIEW.h}
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <ellipse cx={sx} cy={sy + 6} rx={185} ry={62} className="fill-neutral-950/35" />
      <ellipse cx={sx} cy={sy + 2} rx={165} ry={50} className="fill-neutral-950/35" />

      {FEET.map(([x, y]) => {
        const [fx, fy] = P(x, y, -depth);
        return (
          <g key={`${x},${y}`}>
            <rect x={fx - 9} y={fy} width={18} height={8} className="fill-neutral-900" />
            <ellipse cx={fx} cy={fy + 8} rx={9} ry={5} className="fill-neutral-950" />
            <ellipse cx={fx} cy={fy} rx={9} ry={5} className="fill-neutral-800" />
          </g>
        );
      })}

      <polygon points={poly([[-hx, hy, 0], [hx, hy, 0], [hx, hy, -depth], [-hx, hy, -depth]])} className="fill-neutral-800 stroke-neutral-700" strokeWidth={0.8} />
      <polygon points={poly([[hx, -hy, 0], [hx, hy, 0], [hx, hy, -depth], [hx, -hy, -depth]])} className="fill-neutral-900 stroke-neutral-700" strokeWidth={0.8} />
      <polygon points={poly(inset(0))} className="fill-neutral-600 stroke-neutral-400" strokeWidth={0.9} />
      <polygon points={poly(inset(5))} className="fill-neutral-700 stroke-neutral-600" strokeWidth={0.6} />
      <polygon points={poly([[-hx, hy, -depth + 5], [hx, hy, -depth + 5]])} className="fill-none stroke-neutral-700" strokeWidth={0.6} />

      <g transform={PLANE}>
        {inset(11).map(([x, y]) => (
          <g key={`${x},${y}`}>
            <circle cx={x} cy={y} r={2.4} className="fill-neutral-700 stroke-neutral-500" strokeWidth={0.5} />
            <line x1={x - 1.4} y1={y - 1.4} x2={x + 1.4} y2={y + 1.4} className="stroke-neutral-950" strokeWidth={0.6} />
          </g>
        ))}

        <rect x={-100} y={hy - 28} width={132} height={14} rx={2} className="fill-neutral-900 stroke-neutral-600" strokeWidth={0.6} />
        {RULER.map((x, i) => (
          <line key={x} x1={x} y1={hy - 14} x2={x} y2={hy - (i % 5 === 0 ? 24 : 19)} className={i % 5 === 0 ? 'stroke-neutral-300' : 'stroke-neutral-500'} strokeWidth={0.6} />
        ))}

        <rect x={129} y={-PINS.slot} width={10} height={PINS.slot * 2} rx={5} className="fill-neutral-950 stroke-neutral-600" strokeWidth={0.6} />
        <rect x={127} y={-4} width={14} height={8} rx={2} className="fill-neutral-500 stroke-neutral-300" strokeWidth={0.6} />
        <line x1={127} y1={0} x2={141} y2={0} className="stroke-neutral-950" strokeWidth={0.8} />

        <g transform={`translate(${PINS.knob.x} ${PINS.knob.y})`}>
          <circle r={13} className="fill-neutral-900 stroke-neutral-500" strokeWidth={0.8} />
          {KNURL.map((deg) => (
            <line key={deg} x1={0} y1={0} x2={11.5 * Math.cos((deg * Math.PI) / 180)} y2={11.5 * Math.sin((deg * Math.PI) / 180)} className="stroke-neutral-700" strokeWidth={0.8} />
          ))}
          <circle r={7} className="fill-neutral-600 stroke-neutral-300" strokeWidth={0.7} />
          <line x1={0} y1={0} x2={0} y2={-6} className="stroke-honey-bronze" strokeWidth={1.4} strokeLinecap="round" />
        </g>

        <circle cx={PINS.led.x} cy={PINS.led.y} r={3.2} className="fill-neutral-950 stroke-neutral-500" strokeWidth={0.6} />
        <circle cx={PINS.led.x} cy={PINS.led.y} r={1.8} className={playing ? 'fill-honey-bronze' : 'fill-neutral-700'} />
        {playing && <circle cx={PINS.led.x} cy={PINS.led.y} r={6} className="fill-honey-bronze/25" />}

        <circle cx={RECORD.cx} cy={RECORD.cy} r={RECORD.r + 9} className="fill-neutral-950/30" />
        <rect x={ARM.pivot.x - 22} y={ARM.pivot.y - 18} width={44} height={36} rx={5} className="fill-neutral-800 stroke-neutral-600" strokeWidth={0.7} />
        <circle cx={ARM.pivot.x} cy={ARM.pivot.y} r={14} className="fill-neutral-900 stroke-neutral-500" strokeWidth={0.7} />
      </g>
    </svg>
  );
}

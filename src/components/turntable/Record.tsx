import type { Album, PlaybackStatus } from '../../lib/store/queue';
import { P, PLANE, RECORD, VIEW } from './deck';

export interface RecordProps {
  album: Album | null;
  status: PlaybackStatus;
}

/** States in which audio is coming out somewhere Vynl follows, so the record turns. */
const SPINNING: ReadonlySet<PlaybackStatus> = new Set(['Playing', 'Mirroring', 'AlbumEnding']);

const PLATTER_R = RECORD.r + 5;
const LIFT = 8;
/** Floor circles are drawn as ellipses of these semi-axes (per unit radius) in the deck's camera. */
const EX = 0.98;
const EY = 0.566;

/** A still wedge of light on the record's top, in screen space: a reflection does not turn with the vinyl. */
function sheen(from: number, to: number) {
  const [cx, cy] = P(RECORD.cx, RECORD.cy, LIFT);
  const at = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    return [cx + EX * RECORD.r * Math.cos(t), cy + EY * RECORD.r * Math.sin(t)] as const;
  };
  const [x1, y1] = at(from);
  const [x2, y2] = at(to);
  return `M${cx.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} A${EX * RECORD.r},${EY * RECORD.r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
}

const GROOVES = Array.from({ length: 19 }, (_, i) => RECORD.label + 5 + i * 3);
const TRACK_GAPS = [52, 68, 81];
const STROBE = Array.from({ length: 60 }, (_, i) => (i * 360) / 60);

/** Fits a line of text inside the label's chord by squeezing it when it would run over. */
function fit(text: string, size: number, max: number) {
  return text.length * size * 0.52 > max ? max : undefined;
}

export default function Record({ album, status }: RecordProps) {
  const turning = SPINNING.has(status) || status === 'Paused';
  const paused = status === 'Paused' ? 'animate-paused' : '';
  const spin = turning ? `animate-spin-record motion-reduce:animate-spin-record-slow ${paused}` : '';
  const wobble = turning ? `animate-record-wobble motion-reduce:animate-none ${paused}` : '';
  const artists = album?.artists.join(', ') ?? '';

  return (
    <svg
      data-testid="record"
      aria-hidden="true"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      width={VIEW.w}
      height={VIEW.h}
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {Array.from({ length: LIFT }, (_, z) => (
        <g key={z} transform={`translate(0 ${-z})`}>
          <g transform={PLANE}>
            <circle
              cx={RECORD.cx}
              cy={RECORD.cy}
              r={PLATTER_R}
              className={z === LIFT - 1 ? 'fill-neutral-600' : 'fill-neutral-700'}
            />
          </g>
        </g>
      ))}
      <g transform={`translate(0 ${-LIFT})`}>
        <g transform={PLANE}>
          <g transform={`translate(${RECORD.cx} ${RECORD.cy})`}>
            <circle r={PLATTER_R} className="fill-neutral-700" />
            {STROBE.map((deg) => (
              <circle
                key={deg}
                cx={(PLATTER_R - 2.2) * Math.cos((deg * Math.PI) / 180)}
                cy={(PLATTER_R - 2.2) * Math.sin((deg * Math.PI) / 180)}
                r={0.7}
                className="fill-neutral-400"
              />
            ))}
            <g data-testid="record-spinner" className={`origin-[0_0] ${spin}`}>
              <g data-testid="record-wobble" className={`origin-[0_0] ${wobble}`}>
                <circle r={RECORD.r} className="fill-neutral-950" />
                {GROOVES.map((r) => (
                  <circle key={r} r={r} className="fill-none stroke-neutral-800" strokeWidth={0.7} />
                ))}
                {TRACK_GAPS.map((r) => (
                  <circle key={r} r={r} className="fill-none stroke-neutral-700" strokeWidth={1.2} />
                ))}
                <circle r={RECORD.r - 3} className="fill-none stroke-neutral-900" strokeWidth={2.5} />
                <circle r={RECORD.r - 0.4} className="fill-none stroke-neutral-700" strokeWidth={0.8} />
                <g data-testid="record-label" className="fill-vanilla-custard">
                  <circle r={RECORD.label} className="fill-night-bordeaux stroke-neutral-950" strokeWidth={0.8} />
                  <circle r={RECORD.label - 4} className="fill-none stroke-vanilla-custard/25" strokeWidth={0.6} />
                  {album && (
                    <g textAnchor="middle">
                      <text y={-8} fontSize={7.5} textLength={fit(album.name, 7.5, 50)} className="font-display">
                        {album.name}
                      </text>
                      <text y={4} fontSize={5.5} textLength={fit(artists, 5.5, 50)}>
                        {artists}
                      </text>
                    </g>
                  )}
                </g>
                <circle cy={16} r={1.1} className="fill-vanilla-custard/40" />
                <circle r={3} className="fill-neutral-300 stroke-neutral-500" strokeWidth={0.6} />
              </g>
            </g>
          </g>
        </g>
        <path d={sheen(200, 245)} className="fill-white/10" />
        <path d={sheen(20, 62)} className="fill-white/5" />
      </g>
    </svg>
  );
}

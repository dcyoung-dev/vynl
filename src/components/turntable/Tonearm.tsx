import { useLayoutEffect, useRef } from 'react';
import { ARM, PLANE, P, VIEW } from './deck';
import type { Album, PlaybackStatus, Position } from '../../lib/store/queue';

export interface TonearmProps {
  status: PlaybackStatus;
  /** Progress through the whole album, 0 to 1. */
  progress: number;
}

/** States in which the needle is down on a record, even if it isn't turning. */
const ON_RECORD: ReadonlySet<PlaybackStatus> = new Set([
  'Playing',
  'Paused',
  'AlbumEnding',
  'Mirroring',
  'ReadyToResume',
  'PlayingElsewhere',
  'AuthLost',
]);

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** (durations of earlier tracks + position in the current track) ÷ the album's total duration (KTD19). */
export function albumProgress(album: Album | null, position: Position): number {
  if (!album) return 0;
  const total = album.tracks.reduce((sum, t) => sum + t.durationMs, 0);
  if (total <= 0) return 0;
  const before = album.tracks.slice(0, position.trackIndex).reduce((sum, t) => sum + t.durationMs, 0);
  return clamp((before + position.positionMs) / total);
}

/** The arm drawn along +x from its pivot, so the swing is one rotation about the origin. */
function ArmArt() {
  const L = ARM.length;
  return (
    <>
      <circle r={11} className="fill-neutral-600 stroke-neutral-500" strokeWidth={0.8} />
      <circle r={6.5} className="fill-neutral-800 stroke-neutral-400" strokeWidth={0.7} />
      <line x1={-30} y1={0} x2={-14} y2={0} className="stroke-neutral-400" strokeWidth={9} strokeLinecap="round" />
      <line x1={-26} y1={-1.5} x2={-18} y2={-1.5} className="stroke-neutral-200/40" strokeWidth={1.2} strokeLinecap="round" />
      <line x1={-14} y1={0} x2={L - 14} y2={0} className="stroke-honey-bronze" strokeWidth={3.6} strokeLinecap="round" />
      <line x1={-8} y1={-1} x2={L - 20} y2={-1} className="stroke-vanilla-custard/50" strokeWidth={0.8} strokeLinecap="round" />
      <rect x={L - 16} y={-5} width={16} height={10} rx={2} className="fill-neutral-800 stroke-honey-bronze" strokeWidth={1} />
      <rect x={L - 12} y={-3} width={8} height={6} rx={1} className="fill-neutral-600" />
      <circle cx={L} cy={0} r={1.4} className="fill-vanilla-custard" />
    </>
  );
}

export default function Tonearm({ status, progress }: TonearmProps) {
  const ref = useRef<SVGGElement>(null);

  // KTD11: a CSS custom property set through the CSSOM, never an inline style attribute.
  useLayoutEffect(() => {
    ref.current?.style.setProperty('--tonearm-progress', String(clamp(progress)));
  }, [progress]);

  const { x, y } = ARM.pivot;
  const [bx, by] = P(x, y, 0);

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      width={VIEW.w}
      height={VIEW.h}
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <g ref={ref} data-testid="tonearm" data-resting={ON_RECORD.has(status) ? undefined : ''} className="tonearm">
        <g transform={PLANE} className="fill-neutral-950/40 stroke-neutral-950/40">
          <g transform={`translate(${x} ${y})`}>
            <g className="tonearm-swing">
              <line x1={-14} y1={0} x2={ARM.length} y2={0} strokeWidth={3} strokeLinecap="round" />
            </g>
          </g>
        </g>
        <ellipse cx={bx} cy={by} rx={13} ry={7.5} className="fill-neutral-700 stroke-neutral-500" strokeWidth={0.8} />
        <line x1={bx} y1={by} x2={bx} y2={by - ARM.post} className="stroke-neutral-500" strokeWidth={14} />
        <line x1={bx - 3} y1={by - 1} x2={bx - 3} y2={by - ARM.post} className="stroke-neutral-300/40" strokeWidth={2} />
        <g transform={`translate(0 ${-ARM.post})`}>
          <g transform={PLANE}>
            <g transform={`translate(${x} ${y})`}>
              <g className="tonearm-swing">
                <g className="tonearm-lift">
                  <ArmArt />
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

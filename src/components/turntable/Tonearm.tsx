import { useLayoutEffect, useRef } from 'react';
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

export default function Tonearm({ status, progress }: TonearmProps) {
  const ref = useRef<HTMLDivElement>(null);

  // KTD11: a CSS custom property set through the CSSOM, never an inline style attribute.
  useLayoutEffect(() => {
    ref.current?.style.setProperty('--tonearm-progress', String(clamp(progress)));
  }, [progress]);

  return (
    <div
      ref={ref}
      data-testid="tonearm"
      data-resting={ON_RECORD.has(status) ? undefined : ''}
      aria-hidden="true"
      className="tonearm pointer-events-none absolute top-[6%] left-[92%] h-[72%] w-[6%] -translate-x-1/2"
    >
      <span className="absolute top-0 left-1/2 aspect-square w-[180%] -translate-1/2 rounded-full bg-neutral-700 ring-4 ring-honey-bronze" />
      <span className="absolute top-0 left-1/2 h-[92%] w-[22%] -translate-x-1/2 rounded-full bg-honey-bronze shadow-md shadow-neutral-950/50" />
      <span className="absolute bottom-0 left-1/2 h-[10%] w-[70%] -translate-x-1/2 rounded-sm bg-honey-bronze shadow-md shadow-neutral-950/50" />
    </div>
  );
}

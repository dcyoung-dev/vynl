import type { Album, PlaybackStatus } from '../../lib/store/queue';

export interface RecordProps {
  album: Album | null;
  status: PlaybackStatus;
}

/** States in which audio is coming out somewhere Vynl follows, so the record turns. */
const SPINNING: ReadonlySet<PlaybackStatus> = new Set(['Playing', 'Mirroring', 'AlbumEnding']);

export default function Record({ album, status }: RecordProps) {
  const turning = SPINNING.has(status) || status === 'Paused';
  const paused = status === 'Paused' ? 'animate-paused' : '';
  const spin = turning ? `animate-spin-record motion-reduce:animate-spin-record-slow ${paused}` : '';
  const wobble = turning ? `animate-record-wobble motion-reduce:animate-none ${paused}` : '';

  return (
    <div data-testid="record" className="relative aspect-square w-full rounded-full perspective-distant">
      <div data-testid="record-spinner" className={`size-full rounded-full transform-3d ${spin}`}>
        <div
          data-testid="record-wobble"
          className={`record-grooves relative size-full rounded-full shadow-2xl shadow-neutral-950/60 ${wobble}`}
        >
          <div
            data-testid="record-label"
            className="absolute inset-[32%] flex flex-col items-center justify-center gap-1 overflow-hidden rounded-full bg-night-bordeaux p-[8%] text-center text-vanilla-custard"
          >
            {album && (
              <>
                <p className="line-clamp-2 font-display text-sm leading-tight">{album.name}</p>
                <p className="line-clamp-2 text-xs leading-tight">{album.artists.join(', ')}</p>
              </>
            )}
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 size-[6%] -translate-1/2 rounded-full bg-neutral-300"
            />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="record-sheen pointer-events-none absolute inset-0 rounded-full" />
    </div>
  );
}

import type { PlaybackStatus } from '../../lib/store/queue';

export interface ControlsProps {
  status: PlaybackStatus;
  signedIn: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const SOUNDING: ReadonlySet<PlaybackStatus> = new Set(['Playing', 'Mirroring', 'AlbumEnding']);

const secondary =
  'grid size-11 place-items-center rounded-full border border-muted-teal text-vanilla-custard enabled:hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze disabled:opacity-50';

export default function Controls({ status, signedIn, onPlayPause, onNext, onPrevious }: ControlsProps) {
  const playing = SOUNDING.has(status);
  const disabled = !signedIn;
  return (
    <div className="flex items-center justify-center gap-4">
      <button type="button" aria-label="Previous track" disabled={disabled} onClick={onPrevious} className={secondary}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M6 5h2v14H6zM20 5v14L9 12z" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        disabled={disabled}
        onClick={onPlayPause}
        className="grid size-14 place-items-center rounded-full bg-honey-bronze text-night-bordeaux shadow-md shadow-neutral-950/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vanilla-custard disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true">
          {playing ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M7 4v16l13-8z" />}
        </svg>
      </button>
      <button type="button" aria-label="Next track" disabled={disabled} onClick={onNext} className={secondary}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
        </svg>
      </button>
    </div>
  );
}

import type { Track } from '../../lib/store/queue';

export interface TrackListProps {
  tracks: Track[];
  currentIndex: number;
  /** Called with the zero-based index of the chosen track. Omit for a read-only list. */
  onMoveNeedle?: (trackIndex: number) => void;
  disabled?: boolean;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function TrackList({ tracks, currentIndex, onMoveNeedle, disabled = false }: TrackListProps) {
  return (
    <ol className="w-full divide-y divide-muted-teal/30">
      {tracks.map((track, i) => {
        const current = i === currentIndex;
        const row = (
          <>
            <span className="w-6 shrink-0 text-right tabular-nums opacity-80">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{track.name}</span>
            <span className="shrink-0 tabular-nums opacity-80">{formatDuration(track.durationMs)}</span>
          </>
        );
        const tone = current ? 'bg-muted-teal text-night-bordeaux' : 'text-vanilla-custard';
        return (
          <li key={`${track.uri}-${i}`}>
            {onMoveNeedle ? (
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                disabled={disabled}
                onClick={() => onMoveNeedle(i)}
                className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left ${tone} enabled:hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-honey-bronze disabled:opacity-60 ${current ? 'enabled:hover:bg-muted-teal' : ''}`}
              >
                {row}
              </button>
            ) : (
              <div aria-current={current ? 'true' : undefined} className={`flex items-center gap-3 rounded-sm px-3 py-2 ${tone}`}>
                {row}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

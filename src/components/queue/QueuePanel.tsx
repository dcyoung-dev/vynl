import { useId } from 'react';
import { useAppState } from '../../lib/store/AppState';
import type { Album } from '../../lib/store/queue';
import { usePlayNow } from '../browse/PlayNow';
import { spotifyAlbumUrl } from '../../lib/spotify/links';
import { primaryButton, secondaryButton, spotifyLink } from '../browse/AlbumCard';

export interface QueuePanelProps {
  /** KTD8: a follower tab lists the queue without "Move up", "Move down" or "Remove". */
  isFollower: boolean;
}

/** The albums lined up after the current record, reordered with buttons rather than drag-and-drop (R15). */
export default function QueuePanel({ isFollower }: QueuePanelProps) {
  const { state, dispatch } = useAppState();
  const headingId = useId();
  const playNow = usePlayNow();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 text-vanilla-custard">
      <h2 id={headingId} className="font-display text-2xl">
        Up next
      </h2>
      {state.queue.length === 0 ? (
        <p>Nothing queued yet.</p>
      ) : (
        <ol aria-label="Queue" className="flex flex-col gap-3">
          {state.queue.map((album, index) => (
            <QueueItem
              key={`${album.id}-${index}`}
              album={album}
              isFirst={index === 0}
              isLast={index === state.queue.length - 1}
              isFollower={isFollower}
              onPlayNow={() => {
                playNow.activate?.();
                dispatch({ type: 'remove', index });
                void playNow(album);
              }}
              onMoveUp={() => dispatch({ type: 'moveUp', index })}
              onMoveDown={() => dispatch({ type: 'moveDown', index })}
              onRemove={() => dispatch({ type: 'remove', index })}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

interface QueueItemProps {
  album: Album;
  isFirst: boolean;
  isLast: boolean;
  isFollower: boolean;
  onPlayNow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function QueueItem({ album, isFirst, isLast, isFollower, onPlayNow, onMoveUp, onMoveDown, onRemove }: QueueItemProps) {
  const nameId = useId();
  return (
    <li aria-labelledby={nameId} className="flex gap-3 rounded-md border border-muted-teal/60 p-2">
      {album.imageUrl ? (
        <img src={album.imageUrl} alt="" className="aspect-square size-16 shrink-0 rounded-sm object-contain" />
      ) : (
        <div aria-hidden="true" className="aspect-square size-16 shrink-0 rounded-sm bg-neutral-800" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 id={nameId} className="truncate font-semibold leading-tight">
          {album.name}
        </h3>
        <p className="truncate text-sm">{album.artists.join(', ')}</p>
        <a href={spotifyAlbumUrl(album.id)} target="_blank" rel="noopener noreferrer" className={spotifyLink}>
          Listen on Spotify
        </a>
        {!isFollower && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={primaryButton} onClick={onPlayNow}>
              Play now
            </button>
            <button type="button" className={secondaryButton} disabled={isFirst} onClick={onMoveUp}>
              Move up
            </button>
            <button type="button" className={secondaryButton} disabled={isLast} onClick={onMoveDown}>
              Move down
            </button>
            <button type="button" className={secondaryButton} onClick={onRemove}>
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

import { useCallback, useRef, useState } from 'react';
import { getAlbum, type AlbumPage, type AlbumSummary } from '../../lib/spotify/api';
import { QuotaExceededError } from '../../lib/spotify/errors';
import { useAppState } from '../../lib/store/AppState';
import { usePlayNow } from './PlayNow';

export function spotifyAlbumUrl(id: string): string {
  return `https://open.spotify.com/album/${encodeURIComponent(id)}`;
}

/** KTD3: the quota error carries its own message; anything else gets the caller's wording. */
export function loadErrorMessage(error: unknown, fallback: string): string {
  return error instanceof QuotaExceededError ? error.message : fallback;
}

export const primaryButton =
  'rounded-full bg-honey-bronze px-3 py-1.5 text-sm font-semibold text-night-bordeaux focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vanilla-custard disabled:opacity-50';
export const secondaryButton =
  'rounded-full border border-muted-teal px-3 py-1.5 text-sm text-vanilla-custard enabled:hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze disabled:opacity-50';
export const spotifyLink =
  'text-sm text-vanilla-custard underline underline-offset-2 hover:text-honey-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze';

export interface AlbumCardProps {
  album: AlbumSummary;
  /** KTD8: a follower tab can browse but shows no "Play now" or "Add to queue". */
  isFollower: boolean;
  /** Called after "Play now" has put the album on, so the drawer can close. */
  onPlayNow?: () => void;
}

type Pending = 'play' | 'add' | null;

/**
 * One album from the library or search. Browse lists only carry summaries, so the full album
 * (with its tracks) is fetched when the listener plays or queues it.
 */
export default function AlbumCard({ album, isFollower, onPlayNow }: AlbumCardProps) {
  const { dispatch } = useAppState();
  const playNow = usePlayNow();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<unknown>(null);

  async function choose(action: 'play' | 'add') {
    if (action === 'play') playNow.activate?.();
    setPending(action);
    setError(null);
    try {
      const full = await getAlbum(album.id);
      if (action === 'play') {
        void playNow(full);
        onPlayNow?.();
      } else {
        dispatch({ type: 'add', album: full });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  return (
    <article className="flex flex-col gap-2 text-vanilla-custard">
      {album.imageUrl ? (
        <img
          src={album.imageUrl}
          alt={`Cover of ${album.name}`}
          loading="lazy"
          className="aspect-square w-full rounded-sm object-contain"
        />
      ) : (
        <div aria-hidden="true" className="aspect-square w-full rounded-sm bg-neutral-800" />
      )}
      <div>
        <h3 className="font-semibold leading-tight">{album.name}</h3>
        <p className="text-sm">{album.artists.join(', ')}</p>
      </div>
      {!isFollower && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={pending !== null}
            aria-busy={pending === 'play'}
            onClick={() => void choose('play')}
          >
            {pending === 'play' ? 'Starting…' : 'Play now'}
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={pending !== null}
            aria-busy={pending === 'add'}
            onClick={() => void choose('add')}
          >
            {pending === 'add' ? 'Adding…' : 'Add to queue'}
          </button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-honey-bronze">
          {loadErrorMessage(error, "Couldn't load this album from Spotify.")}
        </p>
      )}
      <a href={spotifyAlbumUrl(album.id)} target="_blank" rel="noopener noreferrer" className={spotifyLink}>
        Listen on Spotify
      </a>
    </article>
  );
}

interface Pages {
  items: AlbumSummary[];
  nextOffset: number | null;
  loading: boolean;
  error: unknown;
  /** True once the first page has arrived, so an empty list can say so. */
  loaded: boolean;
}

const NO_PAGES: Pages = { items: [], nextOffset: null, loading: false, error: null, loaded: false };

/** Paged album results with "load more", "try again", and responses from superseded requests ignored. */
export function useAlbumPages() {
  const [pages, setPages] = useState<Pages>(NO_PAGES);
  const latest = useRef(0);
  const lastRequest = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    latest.current++;
    lastRequest.current = null;
    setPages(NO_PAGES);
  }, []);

  const load = useCallback((fetchPage: (offset: number) => Promise<AlbumPage>, offset: number) => {
    const id = ++latest.current;
    lastRequest.current = () => load(fetchPage, offset);
    setPages((current) => ({ ...(offset === 0 ? NO_PAGES : current), loading: true, error: null }));
    fetchPage(offset).then(
      (page) => {
        if (id !== latest.current) return;
        setPages((current) => ({
          items: offset === 0 ? page.items : [...current.items, ...page.items],
          nextOffset: page.nextOffset,
          loading: false,
          error: null,
          loaded: true,
        }));
      },
      (error: unknown) => {
        if (id !== latest.current) return;
        setPages((current) => ({ ...current, loading: false, error }));
      },
    );
  }, []);

  const retry = useCallback(() => lastRequest.current?.(), []);

  return { pages, load, reset, retry };
}

export interface AlbumResultsProps {
  label: string;
  pages: Pages;
  isFollower: boolean;
  onPlayNow?: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  loadingText: string;
  emptyText: string;
  errorText: string;
}

export function AlbumResults({
  label,
  pages,
  isFollower,
  onPlayNow,
  onLoadMore,
  onRetry,
  loadingText,
  emptyText,
  errorText,
}: AlbumResultsProps) {
  return (
    <div className="flex flex-col gap-4">
      {pages.items.length > 0 && (
        <ul aria-label={label} className="grid grid-cols-2 gap-4">
          {pages.items.map((album) => (
            <li key={album.id}>
              <AlbumCard album={album} isFollower={isFollower} onPlayNow={onPlayNow} />
            </li>
          ))}
        </ul>
      )}
      {pages.loaded && pages.items.length === 0 && !pages.loading && pages.error === null && (
        <p className="text-vanilla-custard">{emptyText}</p>
      )}
      {pages.loading && (
        <p role="status" className="text-vanilla-custard">
          {loadingText}
        </p>
      )}
      {pages.error !== null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-vanilla-custard">
          <p>{loadErrorMessage(pages.error, errorText)}</p>
          <button type="button" className={secondaryButton} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {pages.nextOffset !== null && !pages.loading && pages.error === null && (
        <button type="button" className={`${secondaryButton} self-center`} onClick={onLoadMore}>
          Load more
        </button>
      )}
    </div>
  );
}

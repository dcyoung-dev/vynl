import { useEffect, useId, useState } from 'react';
import { searchAlbums } from '../../lib/spotify/api';
import { AlbumResults, useAlbumPages } from './AlbumCard';

export const SEARCH_DEBOUNCE_MS = 300;

export interface AlbumSearchProps {
  /** KTD8: hides "Play now" and "Add to queue". */
  isFollower: boolean;
  /** Called after "Play now" has put an album on. */
  onPlayNow?: () => void;
}

/** Search across Spotify's album catalogue, 10 results at a time (KTD15). Albums only (R6). */
export default function AlbumSearch({ isFollower, onPlayNow }: AlbumSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const { pages, load, reset, retry } = useAlbumPages();
  const trimmed = query.trim();
  const fetchPage = (offset: number) => searchAlbums(trimmed, offset);

  useEffect(() => {
    reset();
    if (!trimmed) return;
    const timer = setTimeout(() => load((offset) => searchAlbums(trimmed, offset), 0), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, load, reset]);

  return (
    <div className="flex flex-col gap-4">
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={inputId} className="sr-only">
          Search albums
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Album or artist"
          autoComplete="off"
          className="w-full rounded-full border border-muted-teal bg-neutral-900/40 px-4 py-2 text-vanilla-custard placeholder:text-vanilla-custard/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
        />
      </form>
      {trimmed ? (
        <AlbumResults
          label="Search results"
          pages={pages}
          isFollower={isFollower}
          onPlayNow={onPlayNow}
          onLoadMore={() => pages.nextOffset !== null && load(fetchPage, pages.nextOffset)}
          onRetry={retry}
          loadingText="Searching…"
          emptyText="No albums found"
          errorText="Couldn't search Spotify."
        />
      ) : (
        <p className="text-vanilla-custard">Search Spotify for an album.</p>
      )}
    </div>
  );
}

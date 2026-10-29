import { useEffect } from 'react';
import { getSavedAlbums } from '../../lib/spotify/api';
import { AlbumResults, useAlbumPages } from './AlbumCard';

export interface SavedAlbumsProps {
  /** KTD8: hides "Play now" and "Add to queue". */
  isFollower: boolean;
  /** Called after "Play now" has put an album on. */
  onPlayNow?: () => void;
}

/** "My albums": the listener's saved albums, 50 at a time (KTD15). */
export default function SavedAlbums({ isFollower, onPlayNow }: SavedAlbumsProps) {
  const { pages, load, retry } = useAlbumPages();

  useEffect(() => {
    load(getSavedAlbums, 0);
  }, [load]);

  return (
    <AlbumResults
      label="My albums"
      pages={pages}
      isFollower={isFollower}
      onPlayNow={onPlayNow}
      onLoadMore={() => pages.nextOffset !== null && load(getSavedAlbums, pages.nextOffset)}
      onRetry={retry}
      loadingText="Loading your albums…"
      emptyText="No saved albums yet."
      errorText="Couldn't load your albums."
    />
  );
}

import type { AlbumSummary } from '../../lib/spotify/api';

/** Artwork for a public playlist row, with a labelled fallback when the album has none. */
export default function AlbumArt({ album }: { album: Pick<AlbumSummary, 'imageUrl' | 'name'> }) {
  if (album.imageUrl) {
    return <img src={album.imageUrl} alt="" width={64} height={64} loading="lazy" className="size-16 shrink-0 rounded" />;
  }
  return (
    <div
      aria-hidden="true"
      className="flex size-16 shrink-0 items-center justify-center rounded bg-night-bordeaux text-center text-xs text-vanilla-custard"
    >
      No artwork
    </div>
  );
}

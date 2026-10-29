import type { Album } from '../../lib/store/queue';

export interface CoverArtProps {
  album: Album | null;
}

/** The album cover, square and unaltered: one image, lightly rounded, with nothing over it (R10). */
export default function CoverArt({ album }: CoverArtProps) {
  if (!album?.imageUrl) return null;
  return (
    <img
      src={album.imageUrl}
      alt={`${album.name} by ${album.artists.join(', ')}`}
      className="aspect-square w-full rounded-md object-contain shadow-lg shadow-neutral-950/40"
    />
  );
}

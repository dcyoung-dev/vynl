export function spotifyAlbumUrl(id: string): string {
  return `https://open.spotify.com/album/${encodeURIComponent(id)}`;
}

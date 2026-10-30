import { setLastAccount } from '../lib/store/account';
import { loadState, saveState } from '../lib/store/persist';
import type { Album } from '../lib/store/queue';
import type { SpotifyAlbum } from '../lib/spotify/types';
import { DEMO_ALBUMS, DEMO_USER } from './catalogue';
import { install } from './fakeSpotify';

function toAlbum(album: SpotifyAlbum): Album {
  return {
    id: album.id,
    uri: album.uri,
    name: album.name,
    artists: album.artists.map((artist) => artist.name),
    imageUrl: album.images[0]?.url ?? null,
    tracks: album.tracks.items.map((track) => ({ uri: track.uri, name: track.name, durationMs: track.duration_ms })),
  };
}

const byId = (id: string) => toAlbum(DEMO_ALBUMS.find((album) => album.id === id)!);

/**
 * Installs the fake Spotify and, the first time only, saves a record part-way through and a
 * queue for the demo account, so later reloads keep whatever the developer changed.
 */
export function installDemo(): void {
  install();
  setLastAccount(DEMO_USER.id);
  const saved = loadState(DEMO_USER.id);
  if (saved.current !== null || saved.queue.length > 0) return;
  saveState(DEMO_USER.id, {
    current: byId('midnight-harbour'),
    position: { trackIndex: 2, positionMs: 45_000 },
    queue: [byId('long-name-album'), byId('thirty-two-pieces'), byId('one-song-only')],
  });
}

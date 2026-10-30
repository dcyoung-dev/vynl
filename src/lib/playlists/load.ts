import { getAlbum } from '../spotify/api';
import type { Album } from '../store/queue';
import type { Playlist } from './catalog';

export class PlaylistLoadError extends Error {
  constructor(
    readonly albumName: string,
    options?: ErrorOptions,
  ) {
    super(`Couldn't load ${albumName}.`, options);
    this.name = 'PlaylistLoadError';
  }
}

/**
 * Resolves every album of a selection to playable metadata, one after another and in order.
 * Nothing is installed here: the caller decides what to do with a complete result, and any failure
 * (or a `signal` that aborts mid-way) leaves the listener's session untouched.
 */
export async function loadPlaylistAlbums(playlist: Playlist, signal?: AbortSignal): Promise<Album[]> {
  const albums: Album[] = [];
  for (const summary of playlist.albums) {
    signal?.throwIfAborted();
    let album: Album;
    try {
      album = await getAlbum(summary.id);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new PlaylistLoadError(summary.name, { cause: error });
    }
    signal?.throwIfAborted();
    if (album.tracks.length === 0) throw new PlaylistLoadError(summary.name);
    albums.push(album);
  }
  return albums;
}

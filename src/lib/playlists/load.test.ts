import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlbum } from '../spotify/api';
import { QuotaExceededError } from '../spotify/errors';
import type { Album } from '../store/queue';
import { findPlaylist } from './catalog';
import { loadPlaylistAlbums, PlaylistLoadError } from './load';

vi.mock('../spotify/api', () => ({ getAlbum: vi.fn() }));

const playlist = findPlaylist('album-rotation')!;

function full(id: string, tracks = 2): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: id,
    artists: ['x'],
    imageUrl: null,
    tracks: Array.from({ length: tracks }, (_, i) => ({ uri: `spotify:track:${id}${i}`, name: `t${i}`, durationMs: 1000 })),
  };
}

beforeEach(() => {
  vi.mocked(getAlbum).mockReset();
  vi.mocked(getAlbum).mockImplementation((id) => Promise.resolve(full(id)));
});

describe('loadPlaylistAlbums', () => {
  it('resolves every album in order, one request at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.mocked(getAlbum).mockImplementation(async (id) => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return full(id);
    });

    const albums = await loadPlaylistAlbums(playlist);

    expect(albums.map((a) => a.id)).toEqual(playlist.albums.map((a) => a.id));
    expect(peak).toBe(1);
  });

  it('uses the resolved metadata, not the display snapshot', async () => {
    vi.mocked(getAlbum).mockImplementation((id) => Promise.resolve({ ...full(id, 5), name: 'Renamed' }));
    const albums = await loadPlaylistAlbums(playlist);
    expect(albums[0].name).toBe('Renamed');
    expect(albums[0].tracks).toHaveLength(5);
  });

  it('fails naming the album when a later album cannot be fetched, with no partial result', async () => {
    vi.mocked(getAlbum).mockImplementation((id) =>
      id === playlist.albums[5].id ? Promise.reject(new Error('boom')) : Promise.resolve(full(id)),
    );
    const error = await loadPlaylistAlbums(playlist).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlaylistLoadError);
    expect((error as PlaylistLoadError).albumName).toBe(playlist.albums[5].name);
    expect(vi.mocked(getAlbum)).toHaveBeenCalledTimes(6);
  });

  it('rejects an album without tracks', async () => {
    vi.mocked(getAlbum).mockImplementation((id) => Promise.resolve(full(id, id === playlist.albums[1].id ? 0 : 2)));
    await expect(loadPlaylistAlbums(playlist)).rejects.toBeInstanceOf(PlaylistLoadError);
  });

  it('keeps the quota error reachable as the cause', async () => {
    const quota = new QuotaExceededError();
    vi.mocked(getAlbum).mockRejectedValue(quota);
    const error = (await loadPlaylistAlbums(playlist).catch((e: unknown) => e)) as PlaylistLoadError;
    expect(error.cause).toBe(quota);
  });

  it('stops fetching when aborted', async () => {
    const controller = new AbortController();
    vi.mocked(getAlbum).mockImplementation(async (id) => {
      controller.abort();
      return full(id);
    });
    await expect(loadPlaylistAlbums(playlist, controller.signal)).rejects.toThrow();
    expect(vi.mocked(getAlbum)).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { findPlaylist, playlists, type Playlist } from './catalog';
import { queueReducer, initialQueueState, type Album } from '../store/queue';

const albumRotationIds = [
  '7jtE0xbYPrmEefrEqKWFha',
  '44ASESIE4S1Rw76k8AcRB5',
  '4r9l0IE5BCE7WUl2f9Jx7e',
  '2zWSnM4pk3NaTGad8hH78l',
  '6Or0QrFbkQ2rkbRJTUoCRz',
  '4KQq5k0VTTfRVYqplDihnd',
  '15KlC2f68uX0tH0ccGkI4r',
  '582w4ysx1o6rfe291qUciG',
  '3dg4N52mvnw0bOdgakVrWB',
  '5pEODhluey5BQStCWB7QlE',
];

describe('playlist catalogue', () => {
  it('publishes the album rotation with its ten albums in order', () => {
    const playlist = findPlaylist('album-rotation');
    expect(playlist?.title).toBe('Album rotation');
    expect(playlist?.description).toBe('Ten albums to put on, one after another.');
    expect(playlist?.albums.map((a) => a.id)).toEqual(albumRotationIds);
    expect(playlist?.albums[0]).toMatchObject({ name: "The Hand You've Been Dealt", artists: ["Joker's Republic"] });
    expect(playlist?.albums[1].name).toBe('Moonflower');
  });

  it('uses unique, URL-safe slugs', () => {
    const slugs = playlists.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps URI, id, name, artists and artwork consistent for every album', () => {
    for (const playlist of playlists) {
      for (const album of playlist.albums) {
        expect(album.uri).toBe(`spotify:album:${album.id}`);
        expect(album.name).not.toBe('');
        expect(album.artists.length).toBeGreaterThan(0);
        expect(album.imageUrl === null || album.imageUrl.startsWith('https://i.scdn.co/image/')).toBe(true);
      }
    }
  });

  it('finds known slugs and never falls back for unknown ones', () => {
    expect(findPlaylist('album-rotation')).toBe(playlists[0]);
    expect(findPlaylist('nope')).toBeUndefined();
    expect(findPlaylist('')).toBeUndefined();
    expect(findPlaylist(null)).toBeUndefined();
    expect(findPlaylist(undefined)).toBeUndefined();
  });

  it('carries no playback progress or account fields', () => {
    const text = JSON.stringify(playlists);
    for (const key of ['position', 'trackIndex', 'positionMs', 'token', 'account', 'current', 'queue']) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it('is not changed by local queue edits derived from it', () => {
    const before = JSON.stringify(playlists);
    const [first, ...rest] = playlists[0].albums.map<Album>((a) => ({ ...a, tracks: [] }));
    let state = { ...initialQueueState(), current: first, queue: rest };
    state = queueReducer(state, { type: 'remove', index: 0 });
    state = queueReducer(state, { type: 'moveDown', index: 0 });
    state = queueReducer(state, { type: 'advance' });
    expect(JSON.stringify(playlists)).toBe(before);
  });

  it('lets a second entry be added as data only', () => {
    const second: Playlist = { slug: 'second', title: 'Second', description: 'More.', albums: playlists[0].albums.slice(0, 2) };
    const all = [...playlists, second];
    expect(all.find((p) => p.slug === 'second')).toBe(second);
    expect(new Set(all.map((p) => p.slug)).size).toBe(all.length);
  });
});

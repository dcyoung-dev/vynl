import { describe, expect, it } from 'vitest';
import { DEMO_ALBUMS, DEMO_DEVICES, DEMO_SEARCH_ALBUMS, DEMO_USER, allDemoAlbums } from './catalogue';

describe('demo catalogue', () => {
  const albums = allDemoAlbums();
  const tracks = albums.flatMap((album) => album.tracks.items);

  it('gives every album a unique id and album URI', () => {
    expect(new Set(albums.map((a) => a.id)).size).toBe(albums.length);
    for (const album of albums) expect(album.uri).toBe(`spotify:album:${album.id}`);
  });

  it('gives every track a unique track URI', () => {
    expect(new Set(tracks.map((t) => t.uri)).size).toBe(tracks.length);
    for (const track of tracks) expect(track.uri).toMatch(/^spotify:track:/);
  });

  it('keeps total_tracks and the paging total in step with the track list', () => {
    for (const album of albums) {
      expect(album.total_tracks).toBe(album.tracks.items.length);
      expect(album.tracks.total).toBe(album.tracks.items.length);
    }
  });

  it('includes the layout stress cases', () => {
    expect(albums.some((a) => a.tracks.items.length >= 30)).toBe(true);
    expect(albums.some((a) => a.tracks.items.length === 1)).toBe(true);
    expect(albums.some((a) => a.name.length > 60)).toBe(true);
    expect(albums.some((a) => a.artists.length > 1)).toBe(true);
    expect(tracks.some((t) => t.name.length > 50)).toBe(true);
  });

  it('uses generated SVG data URIs for cover art', () => {
    for (const album of albums) {
      expect(album.images.length).toBeGreaterThan(0);
      for (const image of album.images) expect(image.url).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('separates the library from the search results', () => {
    const saved = new Set(DEMO_ALBUMS.map((a) => a.id));
    expect(DEMO_ALBUMS.length).toBeGreaterThanOrEqual(12);
    expect(DEMO_SEARCH_ALBUMS.length).toBeGreaterThan(0);
    for (const album of DEMO_SEARCH_ALBUMS) expect(saved.has(album.id)).toBe(false);
  });

  it('defines a demo user and devices besides the demo tab', () => {
    expect(DEMO_USER.display_name).toBeTruthy();
    expect(DEMO_DEVICES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(DEMO_DEVICES.map((d) => d.id)).size).toBe(DEMO_DEVICES.length);
  });
});

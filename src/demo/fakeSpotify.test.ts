import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSignedIn } from '../lib/auth/session';
import * as api from '../lib/spotify/api';
import * as sdk from '../lib/player/sdk';
import { playlists } from '../lib/playlists/catalog';
import { loadPlaylistAlbums } from '../lib/playlists/load';
import { DEMO_ALBUMS, DEMO_TAB_DEVICE_ID, DEMO_USER } from './catalogue';
import { install, uninstall } from './fakeSpotify';

const BIG_ALBUM = DEMO_ALBUMS.find((a) => a.id === 'thirty-two-pieces')!;
const HARBOUR = DEMO_ALBUMS.find((a) => a.id === 'midnight-harbour')!;
const SLOW_FERRY = HARBOUR.tracks.items[2];

describe('fake Spotify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    localStorage.clear();
    install();
  });

  afterEach(() => {
    sdk.disconnect();
    uninstall();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('signs the demo listener in', async () => {
    expect(isSignedIn()).toBe(true);
    await expect(api.getMe()).resolves.toMatchObject({ id: DEMO_USER.id });
  });

  it('pages the saved albums until the last page', async () => {
    const seen: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    const first = await api.getSavedAlbums(0);
    expect(first.nextOffset).not.toBeNull();
    while (offset !== null) {
      const page: api.AlbumPage = await api.getSavedAlbums(offset);
      seen.push(...page.items.map((a) => a.id));
      offset = page.nextOffset;
      pages++;
    }
    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(DEMO_ALBUMS.map((a) => a.id));
  });

  it('answers any search with demo results', async () => {
    const page = await api.searchAlbums('any text');
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((a) => a.id.startsWith('search-'))).toBe(true);
  });

  it('returns every track of the 32-track album', async () => {
    const album = await api.getAlbum(BIG_ALBUM.id);
    expect(album.tracks).toHaveLength(32);
  });

  it('resolves every album of a catalogue playlist in order, with the snapshot track counts', async () => {
    const [playlist] = playlists;
    const albums = await loadPlaylistAlbums(playlist);
    expect(albums.map((album) => album.id)).toEqual(playlist.albums.map((album) => album.id));
    expect(albums.map((album) => album.tracks.length)).toEqual(playlist.albums.map((album) => album.totalTracks));
    expect(albums[0].name).toBe(playlist.albums[0].name);
    expect(albums[0].imageUrl).toMatch(/^data:image\/svg\+xml/);
  });

  it('plays a catalogue playlist album on the demo device', async () => {
    const [first] = playlists[0].albums;
    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: first.uri });
    const state = await api.getPlaybackState();
    expect(state).toMatchObject({ is_playing: true, device: { id: DEMO_TAB_DEVICE_ID, is_active: true } });
    expect(state?.context?.uri).toBe(first.uri);
  });

  it('plays an album at a track, advancing progress with the clock', async () => {
    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: HARBOUR.uri, offsetUri: SLOW_FERRY.uri });
    let state = await api.getPlaybackState();
    expect(state).toMatchObject({ is_playing: true, item: { uri: SLOW_FERRY.uri }, device: { id: DEMO_TAB_DEVICE_ID, is_active: true } });
    expect(state?.context?.uri).toBe(HARBOUR.uri);

    vi.advanceTimersByTime(10_000);
    state = await api.getPlaybackState();
    expect(state?.progress_ms).toBe(10_000);
  });

  it('holds progress while paused', async () => {
    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: HARBOUR.uri });
    vi.advanceTimersByTime(5000);
    await api.pause(DEMO_TAB_DEVICE_ID);
    vi.advanceTimersByTime(20_000);
    const state = await api.getPlaybackState();
    expect(state).toMatchObject({ is_playing: false, progress_ms: 5000 });
  });

  it('rolls into the next track when one ends', async () => {
    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: HARBOUR.uri });
    vi.advanceTimersByTime(HARBOUR.tracks.items[0].duration_ms + 1000);
    const state = await api.getPlaybackState();
    expect(state?.item?.uri).toBe(HARBOUR.tracks.items[1].uri);
    expect(state?.progress_ms).toBe(1000);
  });

  it('ends playback instead of wrapping when skipping past the last track', async () => {
    const last = HARBOUR.tracks.items.at(-1)!;
    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: HARBOUR.uri, offsetUri: last.uri });
    await api.next(DEMO_TAB_DEVICE_ID);
    const state = await api.getPlaybackState();
    expect(state).toMatchObject({ is_playing: false, item: { uri: last.uri } });
  });

  it('goes back a track, or restarts one that is well under way', async () => {
    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: HARBOUR.uri, offsetUri: SLOW_FERRY.uri });
    vi.advanceTimersByTime(10_000);
    await api.previous(DEMO_TAB_DEVICE_ID);
    expect((await api.getPlaybackState())?.item?.uri).toBe(SLOW_FERRY.uri);
    await api.previous(DEMO_TAB_DEVICE_ID);
    expect((await api.getPlaybackState())?.item?.uri).toBe(HARBOUR.tracks.items[1].uri);
  });

  it('transfers playback and tells the tab it is no longer playing', async () => {
    await sdk.load();
    await vi.advanceTimersByTimeAsync(1);
    expect(sdk.getDeviceId()).toBe(DEMO_TAB_DEVICE_ID);

    const states: Array<sdk.WebPlaybackState | null> = [];
    sdk.subscribe((signal) => {
      if (signal.type === 'state') states.push(signal.state);
    });

    await api.play({ deviceId: DEMO_TAB_DEVICE_ID, contextUri: HARBOUR.uri });
    expect(states.at(-1)).toMatchObject({ paused: false });

    await api.transferPlayback('demo-kitchen-speaker', { play: true });
    const state = await api.getPlaybackState();
    expect(state?.device).toMatchObject({ id: 'demo-kitchen-speaker', is_active: true });
    expect(states.at(-1)).toBeNull();
  });

  it('loads the SDK without adding a script tag', async () => {
    const before = document.querySelectorAll('script').length;
    await sdk.load();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelectorAll('script')).toHaveLength(before);
    expect(sdk.getDeviceId()).toBe(DEMO_TAB_DEVICE_ID);
  });

  it('passes non-Spotify requests to the original fetch', async () => {
    uninstall();
    const original = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', original);
    install();
    const response = await fetch('https://example.com/data');
    expect(await response.text()).toBe('ok');
    expect(original).toHaveBeenCalledOnce();
  });

  it('is safe to install twice', () => {
    const wrapped = globalThis.fetch;
    install();
    expect(globalThis.fetch).toBe(wrapped);
  });
});

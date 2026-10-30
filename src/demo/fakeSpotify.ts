import type {
  SpotifyAlbum,
  SpotifyDevice,
  SpotifyPaging,
  SpotifyPlaybackState,
  SpotifySimplifiedAlbum,
  SpotifyTrack,
} from '../lib/spotify/types';
import type { SpotifyPlayer, SpotifyPlayerEvents, SpotifyPlayerOptions, WebPlaybackState } from '../lib/player/sdk';
import { AUTH_STORAGE_KEY } from '../lib/auth/session';
import { DEMO_ALBUMS, DEMO_DEVICES, DEMO_SEARCH_ALBUMS, DEMO_TAB_DEVICE_ID, DEMO_USER, allDemoAlbums, playlistDemoAlbums } from './catalogue';

const API_HOST = 'api.spotify.com';
const ACCOUNTS_HOST = 'accounts.spotify.com';
// Smaller than the real page size so the demo library exercises "load more".
const LIBRARY_PAGE_SIZE = 8;
const TRACKS_PAGE_SIZE = 50;
const TOKEN_LIFETIME_S = 60 * 60 * 24 * 365;
const PREVIOUS_RESTART_MS = 3000;

interface Playback {
  activeDeviceId: string | null;
  album: SpotifyAlbum | null;
  trackIndex: number;
  progressMs: number;
  isPlaying: boolean;
  /** When `progressMs` was last brought up to date. */
  anchor: number;
}

type Listener = (payload: never) => void;

function idle(): Playback {
  return { activeDeviceId: null, album: null, trackIndex: 0, progressMs: 0, isPlaying: false, anchor: Date.now() };
}

let playback = idle();
let installed: { originalFetch: typeof fetch } | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let tabWasActive = false;
const players = new Set<FakePlayer>();

function currentTrack(): SpotifyTrack | null {
  return playback.album?.tracks.items[playback.trackIndex] ?? null;
}

/** Brings progress up to date, rolling into following tracks and stopping at the end of the album. */
function settle(): void {
  const now = Date.now();
  const album = playback.album;
  if (playback.isPlaying && album) {
    let progress = playback.progressMs + (now - playback.anchor);
    for (;;) {
      const duration = album.tracks.items[playback.trackIndex].duration_ms;
      if (progress < duration) break;
      progress -= duration;
      if (playback.trackIndex >= album.tracks.items.length - 1) {
        playback.isPlaying = false;
        progress = 0;
        break;
      }
      playback.trackIndex++;
    }
    playback.progressMs = progress;
  }
  playback.anchor = now;
}

function devices(): SpotifyDevice[] {
  const tab: SpotifyDevice = {
    id: DEMO_TAB_DEVICE_ID,
    name: 'Vynl',
    type: 'Computer',
    is_active: false,
    is_private_session: false,
    is_restricted: false,
    volume_percent: 50,
  };
  return [tab, ...DEMO_DEVICES].map((device) => ({ ...device, is_active: device.id === playback.activeDeviceId }));
}

function simplify(album: SpotifyAlbum): SpotifySimplifiedAlbum {
  const { tracks: _tracks, ...rest } = album;
  return rest;
}

function playbackState(): SpotifyPlaybackState | null {
  settle();
  const track = currentTrack();
  const device = devices().find((d) => d.id === playback.activeDeviceId);
  if (!playback.album || !track || !device) return null;
  return {
    device,
    repeat_state: 'off',
    shuffle_state: false,
    context: { type: 'album', uri: playback.album.uri },
    timestamp: Date.now(),
    progress_ms: playback.progressMs,
    is_playing: playback.isPlaying,
    currently_playing_type: 'track',
    item: { ...track, album: simplify(playback.album) },
  };
}

function webPlaybackState(): WebPlaybackState | null {
  const track = currentTrack();
  if (!playback.album || !track) return null;
  return {
    context: { uri: playback.album.uri },
    paused: !playback.isPlaying,
    position: playback.progressMs,
    duration: track.duration_ms,
    timestamp: Date.now(),
    track_window: { current_track: { uri: track.uri, id: track.id, name: track.name, duration_ms: track.duration_ms } },
  };
}

/** Tells the fake SDK player about a change, and schedules the next track boundary while playing. */
function changed(): void {
  settle();
  const tabActive = playback.activeDeviceId === DEMO_TAB_DEVICE_ID;
  if (tabActive || tabWasActive) {
    const state = tabActive ? webPlaybackState() : null;
    for (const player of players) player.emit('player_state_changed', state);
  }
  tabWasActive = tabActive;

  if (endTimer !== null) clearTimeout(endTimer);
  endTimer = null;
  const track = currentTrack();
  if (playback.isPlaying && track) {
    endTimer = setTimeout(changed, Math.max(0, track.duration_ms - playback.progressMs));
  }
}

class FakePlayer implements SpotifyPlayer {
  private readonly listeners = new Map<string, Listener[]>();
  private connected = false;

  constructor(readonly options: SpotifyPlayerOptions) {}

  async connect(): Promise<boolean> {
    this.connected = true;
    players.add(this);
    setTimeout(() => {
      if (this.connected) this.emit('ready', { device_id: DEMO_TAB_DEVICE_ID });
    }, 0);
    return true;
  }

  disconnect(): void {
    this.connected = false;
    players.delete(this);
  }

  async activateElement(): Promise<void> {}

  addListener<E extends keyof SpotifyPlayerEvents>(event: E, callback: (payload: SpotifyPlayerEvents[E]) => void): boolean {
    const list = this.listeners.get(event) ?? [];
    list.push(callback as Listener);
    this.listeners.set(event, list);
    return true;
  }

  emit<E extends keyof SpotifyPlayerEvents>(event: E, payload: SpotifyPlayerEvents[E]): void {
    for (const callback of this.listeners.get(event) ?? []) (callback as (p: SpotifyPlayerEvents[E]) => void)(payload);
  }
}

function paging<T>(items: T[], offset: number, limit: number, href: string): SpotifyPaging<T> {
  const page = items.slice(offset, offset + limit);
  return {
    href,
    items: page,
    limit,
    next: offset + limit < items.length ? `${href}?offset=${offset + limit}&limit=${limit}` : null,
    offset,
    previous: null,
    total: items.length,
  };
}

function findAlbum(id: string): SpotifyAlbum | undefined {
  return [...allDemoAlbums(), ...playlistDemoAlbums()].find((album) => album.id === id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const noContent = () => new Response(null, { status: 204 });
const notFound = (path: string) => json({ error: { status: 404, message: `Demo has no route for ${path}` } }, 404);

function startAlbum(album: SpotifyAlbum, trackIndex: number, positionMs: number, deviceId: string | null): void {
  playback = {
    activeDeviceId: deviceId ?? playback.activeDeviceId ?? DEMO_TAB_DEVICE_ID,
    album,
    trackIndex,
    progressMs: positionMs,
    isPlaying: true,
    anchor: Date.now(),
  };
}

function moveToTrack(index: number): void {
  playback.trackIndex = index;
  playback.progressMs = 0;
  playback.anchor = Date.now();
}

function skip(direction: 1 | -1): void {
  settle();
  const album = playback.album;
  if (!album) return;
  if (direction === 1) {
    if (playback.trackIndex >= album.tracks.items.length - 1) {
      playback.isPlaying = false;
      playback.progressMs = 0;
    } else {
      moveToTrack(playback.trackIndex + 1);
      playback.isPlaying = true;
    }
  } else if (playback.progressMs > PREVIOUS_RESTART_MS || playback.trackIndex === 0) {
    moveToTrack(playback.trackIndex);
  } else {
    moveToTrack(playback.trackIndex - 1);
  }
}

async function readBody(init?: RequestInit): Promise<Record<string, unknown>> {
  const raw = init?.body;
  if (typeof raw !== 'string' || raw === '') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function routeApi(url: URL, method: string, init?: RequestInit): Promise<Response> {
  const path = url.pathname.replace(/^\/v1/, '');
  const query = url.searchParams;
  const number = (key: string, fallback: number) => {
    const value = Number(query.get(key));
    return query.has(key) && Number.isFinite(value) ? value : fallback;
  };

  if (method === 'GET') {
    if (path === '/me') return json(DEMO_USER);
    if (path === '/me/albums') {
      const offset = number('offset', 0);
      const limit = Math.min(number('limit', LIBRARY_PAGE_SIZE), LIBRARY_PAGE_SIZE);
      const saved = DEMO_ALBUMS.map((album) => ({ added_at: '2026-01-01T00:00:00Z', album }));
      return json(paging(saved, offset, limit, `https://${API_HOST}/v1/me/albums`));
    }
    if (path === '/search') {
      const text = (query.get('q') ?? '').trim().toLowerCase();
      const matches = allDemoAlbums().filter(
        (album) => text !== '' && `${album.name} ${album.artists.map((a) => a.name).join(' ')}`.toLowerCase().includes(text),
      );
      const found = matches.length > 0 ? matches : DEMO_SEARCH_ALBUMS;
      const offset = number('offset', 0);
      const limit = number('limit', 10);
      return json({ albums: paging(found.map(simplify), offset, limit, `https://${API_HOST}/v1/search`) });
    }
    const album = /^\/albums\/([^/]+)(\/tracks)?$/.exec(path);
    if (album) {
      const found = findAlbum(decodeURIComponent(album[1]));
      if (!found) return json({ error: { status: 404, message: 'Album not found' } }, 404);
      const href = `https://${API_HOST}/v1/albums/${found.id}/tracks`;
      if (album[2]) return json(paging(found.tracks.items, number('offset', 0), number('limit', TRACKS_PAGE_SIZE), href));
      return json({ ...found, tracks: paging(found.tracks.items, 0, TRACKS_PAGE_SIZE, href) });
    }
    if (path === '/me/player') {
      const state = playbackState();
      return state ? json(state) : noContent();
    }
    if (path === '/me/player/devices') return json({ devices: devices() });
    return notFound(path);
  }

  const deviceId = query.get('device_id');
  if (method === 'PUT' && path === '/me/player/play') {
    const body = await readBody(init);
    const contextUri = typeof body.context_uri === 'string' ? body.context_uri : null;
    if (contextUri) {
      const album = [...allDemoAlbums(), ...playlistDemoAlbums()].find((a) => a.uri === contextUri);
      if (!album) return json({ error: { status: 404, message: 'Context not found' } }, 404);
      const offsetUri = (body.offset as { uri?: string } | undefined)?.uri;
      const index = Math.max(0, album.tracks.items.findIndex((t) => t.uri === offsetUri));
      startAlbum(album, index, typeof body.position_ms === 'number' ? body.position_ms : 0, deviceId);
    } else if (playback.album) {
      settle();
      if (deviceId) playback.activeDeviceId = deviceId;
      playback.isPlaying = true;
    }
    changed();
    return noContent();
  }
  if (method === 'PUT' && path === '/me/player/pause') {
    settle();
    playback.isPlaying = false;
    changed();
    return noContent();
  }
  if (method === 'POST' && (path === '/me/player/next' || path === '/me/player/previous')) {
    skip(path.endsWith('next') ? 1 : -1);
    changed();
    return noContent();
  }
  if (method === 'PUT' && path === '/me/player') {
    const body = await readBody(init);
    const target = (body.device_ids as string[] | undefined)?.[0];
    if (!target || !devices().some((d) => d.id === target)) {
      return json({ error: { status: 404, message: 'Device not found' } }, 404);
    }
    settle();
    playback.activeDeviceId = target;
    if (body.play === true && playback.album) playback.isPlaying = true;
    changed();
    return noContent();
  }
  if (method === 'PUT' && path === '/me/player/repeat') return noContent();
  return notFound(path);
}

function routeAccounts(): Response {
  return json({ access_token: 'demo-access-token', refresh_token: 'demo-refresh-token', expires_in: TOKEN_LIFETIME_S, token_type: 'Bearer' });
}

function seedAuth(): void {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'demo-access-token',
      refreshToken: 'demo-refresh-token',
      expiresAt: Date.now() + TOKEN_LIFETIME_S * 1000,
    }),
  );
}

/**
 * Fakes Spotify at the browser boundary: a signed-in session, the Web API and token endpoint
 * (through `fetch`), and the Web Playback SDK. App modules run unchanged. Calling it again is a no-op.
 */
export function install(): void {
  if (installed) return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  installed = { originalFetch };
  playback = idle();
  tabWasActive = false;

  seedAuth();
  window.Spotify = { Player: FakePlayer };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    if (url.hostname === API_HOST) return routeApi(url, method, init);
    if (url.hostname === ACCOUNTS_HOST) return routeAccounts();
    return originalFetch(input, init);
  }) as typeof fetch;
}

/** Undoes `install`, for tests. */
export function uninstall(): void {
  if (!installed) return;
  globalThis.fetch = installed.originalFetch;
  delete window.Spotify;
  if (endTimer !== null) clearTimeout(endTimer);
  endTimer = null;
  players.clear();
  playback = idle();
  tabWasActive = false;
  installed = null;
}

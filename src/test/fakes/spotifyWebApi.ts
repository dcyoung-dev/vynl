import { vi } from 'vitest';
import type { SpotifyDevice, SpotifyPlaybackState } from '../../lib/spotify/types';
import type { FakeResponse, RecordedRequest } from './fetch';

export interface FakeLive {
  deviceId: string;
  deviceName?: string;
  contextUri: string | null;
  trackUri: string;
  albumUri: string;
  durationMs?: number;
  progressMs: number;
  isPlaying: boolean;
}

interface Scripted {
  method: string;
  path: string;
  response: FakeResponse | Promise<FakeResponse>;
}

export interface RecordedCommand {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

/**
 * A routed stand-in for the Spotify player endpoints. `GET /me/player` serves `live`
 * (its progress moves with the clock while playing), player commands answer `204`,
 * and `respondOnce` scripts the next matching request (a promise holds it open).
 */
export function stubSpotifyWebApi() {
  const requests: RecordedRequest[] = [];
  const scripted: Scripted[] = [];
  let live: FakeLive | null = null;
  let liveSetAt = 0;
  let devices: SpotifyDevice[] = [];

  function playbackState(): SpotifyPlaybackState | null {
    if (!live) return null;
    const duration = live.durationMs ?? 180_000;
    const elapsed = live.isPlaying ? Date.now() - liveSetAt : 0;
    return {
      device: {
        id: live.deviceId,
        name: live.deviceName ?? live.deviceId,
        type: 'Smartphone',
        is_active: true,
        is_private_session: false,
        is_restricted: false,
        volume_percent: 50,
      },
      repeat_state: 'off',
      shuffle_state: false,
      context: live.contextUri ? { type: 'album', uri: live.contextUri } : null,
      timestamp: Date.now(),
      progress_ms: Math.min(duration, live.progressMs + elapsed),
      is_playing: live.isPlaying,
      currently_playing_type: 'track',
      item: {
        id: live.trackUri,
        uri: live.trackUri,
        name: live.trackUri,
        duration_ms: duration,
        disc_number: 1,
        track_number: 1,
        artists: [],
        album: {
          id: live.albumUri,
          uri: live.albumUri,
          name: live.albumUri,
          album_type: 'album',
          total_tracks: 1,
          images: [],
          artists: [],
        },
      },
    };
  }

  function route(method: string, path: string): FakeResponse {
    if (method === 'GET' && path === '/me/player') {
      const state = playbackState();
      return state ? { body: state } : { status: 204 };
    }
    if (method === 'GET' && path === '/me/player/devices') return { body: { devices } };
    if (path.startsWith('/me/player')) return { status: 204 };
    return { status: 500, body: { error: { status: 500, message: `unrouted ${method} ${path}` } } };
  }

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const raw = init?.body;
    requests.push({
      url,
      method,
      headers: new Headers(init?.headers),
      body: typeof raw === 'string' ? JSON.parse(raw) : undefined,
    });
    const path = url.pathname.replace(/^\/v1/, '');
    const index = scripted.findIndex((s) => s.method === method && s.path === path);
    const next = index >= 0 ? await scripted.splice(index, 1)[0].response : route(method, path);
    const hasBody = next.body !== undefined;
    return new Response(hasBody ? JSON.stringify(next.body) : null, {
      status: next.status ?? 200,
      headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...next.headers },
    });
  });

  vi.stubGlobal('fetch', fetchStub);

  return {
    fetch: fetchStub,
    requests,
    setLive(next: FakeLive | null) {
      live = next;
      liveSetAt = Date.now();
    },
    setDevices(next: Array<Partial<SpotifyDevice> & { id: string }>) {
      devices = next.map((d) => ({
        name: d.id,
        type: 'Speaker',
        is_active: false,
        is_private_session: false,
        is_restricted: false,
        volume_percent: 50,
        ...d,
      }));
    },
    respondOnce(method: string, path: string, response: FakeResponse | Promise<FakeResponse>) {
      scripted.push({ method, path, response });
    },
    /** Every request except `GET /me/player` and `GET /me/player/devices`. */
    commands(): RecordedCommand[] {
      return requests
        .filter((r) => r.method !== 'GET')
        .map((r) => ({
          method: r.method,
          path: r.url.pathname.replace(/^\/v1/, ''),
          query: Object.fromEntries(r.url.searchParams),
          body: r.body,
        }));
    },
    polls(): number {
      return requests.filter((r) => r.method === 'GET' && r.url.pathname === '/v1/me/player').length;
    },
  };
}

export type FakeSpotifyWebApi = ReturnType<typeof stubSpotifyWebApi>;

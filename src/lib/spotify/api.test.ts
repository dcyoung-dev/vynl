import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, refreshAccessToken } from '../auth/session';
import { stubFetch } from '../../test/fakes/fetch';
import {
  getAlbum,
  getDevices,
  getMe,
  getPlaybackState,
  getSavedAlbums,
  next,
  pause,
  play,
  previous,
  searchAlbums,
  setRepeatOff,
  transferPlayback,
} from './api';
import { AuthLostError, NotAllowlistedError, PremiumRequiredError, QuotaExceededError, SpotifyApiError } from './errors';

vi.mock('../auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/session')>()),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

const API = 'https://api.spotify.com/v1';

function track(n: number) {
  return {
    id: `t${n}`,
    uri: `spotify:track:t${n}`,
    name: `Track ${n}`,
    duration_ms: 1000 * n,
    disc_number: 1,
    track_number: n,
    artists: [{ id: 'a1', name: 'Artist', uri: 'spotify:artist:a1' }],
  };
}

function tracksPage(albumId: string, start: number, count: number, total: number, limit = 50) {
  const end = start + count;
  return {
    href: `${API}/albums/${albumId}/tracks?offset=${start}&limit=${limit}`,
    items: Array.from({ length: count }, (_, i) => track(start + i + 1)),
    limit,
    next: end < total ? `${API}/albums/${albumId}/tracks?offset=${end}&limit=${limit}` : null,
    offset: start,
    previous: null,
    total,
  };
}

function simplifiedAlbum(id: string) {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: `Album ${id}`,
    album_type: 'album',
    total_tracks: 2,
    images: [{ url: `https://i.scdn.co/${id}-640`, height: 640, width: 640 }],
    artists: [
      { id: 'a1', name: 'First', uri: 'spotify:artist:a1' },
      { id: 'a2', name: 'Second', uri: 'spotify:artist:a2' },
    ],
  };
}

function album(id: string, trackCount: number) {
  return { ...simplifiedAlbum(id), total_tracks: trackCount, tracks: tracksPage(id, 0, Math.min(trackCount, 50), trackCount) };
}

function paging<T>(items: T[], { offset = 0, limit = items.length, total = items.length } = {}) {
  return { href: '', items, limit, offset, previous: null, total, next: offset + limit < total ? 'more' : null };
}

beforeEach(() => {
  vi.mocked(getAccessToken).mockResolvedValue('token-1');
  vi.mocked(refreshAccessToken).mockResolvedValue('token-2');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('auth', () => {
  it('sends the current access token as a bearer token', async () => {
    const { requests } = stubFetch({ body: { id: 'me', uri: 'spotify:user:me' } });

    await getMe();

    expect(requests[0].url.href).toBe(`${API}/me`);
    expect(requests[0].headers.get('authorization')).toBe('Bearer token-1');
  });

  it('refreshes once and retries once after a 401, and the retry succeeds', async () => {
    const { requests } = stubFetch({ status: 401, body: { error: { status: 401, message: 'expired' } } }, { body: { id: 'me', uri: 'spotify:user:me' } });

    const me = await getMe();

    expect(me.id).toBe('me');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(requests.map((r) => r.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('raises AuthLost on a second 401 without refreshing again', async () => {
    const { requests } = stubFetch({ status: 401, body: {} }, { status: 401, body: {} });

    await expect(getDevices()).rejects.toBeInstanceOf(AuthLostError);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
  });

  it('passes on AuthLost from a failed refresh', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(new AuthLostError());
    const { requests } = stubFetch({ status: 401, body: {} });

    await expect(getDevices()).rejects.toBeInstanceOf(AuthLostError);
    expect(requests).toHaveLength(1);
  });
});

describe('rate limits', () => {
  it('waits for Retry-After on a 429, then retries once', async () => {
    vi.useFakeTimers();
    const { requests } = stubFetch(
      { status: 429, headers: { 'Retry-After': '2' }, body: { error: { status: 429, message: 'API rate limit exceeded' } } },
      { body: { devices: [] } },
    );

    const result = getDevices();
    await vi.advanceTimersByTimeAsync(1999);
    expect(requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('raises a SpotifyApiError when the retry is rate limited too', async () => {
    vi.useFakeTimers();
    const { requests } = stubFetch(
      { status: 429, headers: { 'Retry-After': '1' }, body: {} },
      { status: 429, headers: { 'Retry-After': '1' }, body: {} },
    );

    const result = getDevices();
    const assertion = expect(result).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(requests).toHaveLength(2);
  });

  it('raises the quota error without retrying when the reason is QUOTA_EXCEEDED', async () => {
    vi.useFakeTimers();
    const { requests } = stubFetch({
      status: 429,
      headers: { 'Retry-After': '2' },
      body: { error: { status: 429, message: 'Quota exceeded', reason: 'QUOTA_EXCEEDED' } },
    });

    const result = searchAlbums('blue');
    const assertion = expect(result).rejects.toBeInstanceOf(QuotaExceededError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(requests).toHaveLength(1);
  });

  it('raises instead of waiting when Retry-After is longer than 30s', async () => {
    const { requests } = stubFetch({ status: 429, headers: { 'Retry-After': '3600' }, body: {} });

    await expect(getDevices()).rejects.toMatchObject({ status: 429 });
    expect(requests).toHaveLength(1);
  });

  it('recognises QUOTA_EXCEEDED as a top-level reason too', async () => {
    stubFetch({ status: 429, body: { reason: 'QUOTA_EXCEEDED' } });

    await expect(getDevices()).rejects.toBeInstanceOf(QuotaExceededError);
  });
});

describe('getMe', () => {
  it('returns the profile when fields removed in February 2026 are missing', async () => {
    stubFetch({ body: { id: 'me', uri: 'spotify:user:me', display_name: 'Me' } });

    await expect(getMe()).resolves.toEqual({ id: 'me', uri: 'spotify:user:me', display_name: 'Me' });
  });

  it('raises NotAllowlisted on a 403', async () => {
    stubFetch({ status: 403, body: { error: { status: 403, message: 'User not registered in the Developer Dashboard' } } });

    await expect(getMe()).rejects.toBeInstanceOf(NotAllowlistedError);
  });
});

describe('getPlaybackState', () => {
  it('returns null on a 204', async () => {
    const { requests } = stubFetch({ status: 204 });

    await expect(getPlaybackState()).resolves.toBeNull();
    expect(requests[0].url.pathname).toBe('/v1/me/player');
  });

  it('returns the state when something is playing', async () => {
    const state = { is_playing: true, progress_ms: 1234, context: { type: 'album', uri: 'spotify:album:x' } };
    stubFetch({ body: state });

    await expect(getPlaybackState()).resolves.toEqual(state);
  });
});

describe('searchAlbums', () => {
  it('always sends type=album and a limit of 10 or less', async () => {
    const { requests } = stubFetch({ body: { albums: paging([simplifiedAlbum('x')]) } }, { body: { albums: paging([]) } });

    await searchAlbums('kind of blue');
    await searchAlbums('kind of blue', 10);

    for (const { url } of requests) {
      expect(url.pathname).toBe('/v1/search');
      expect(url.searchParams.get('q')).toBe('kind of blue');
      expect(url.searchParams.get('type')).toBe('album');
      expect(Number(url.searchParams.get('limit'))).toBeGreaterThan(0);
      expect(Number(url.searchParams.get('limit'))).toBeLessThanOrEqual(10);
    }
    expect(requests[1].url.searchParams.get('offset')).toBe('10');
  });

  it('maps results into album summaries with the next offset', async () => {
    stubFetch({ body: { albums: paging([simplifiedAlbum('x')], { offset: 0, limit: 10, total: 25 }) } });

    await expect(searchAlbums('x')).resolves.toEqual({
      items: [
        {
          id: 'x',
          uri: 'spotify:album:x',
          name: 'Album x',
          artists: ['First', 'Second'],
          imageUrl: 'https://i.scdn.co/x-640',
          totalTracks: 2,
        },
      ],
      total: 25,
      nextOffset: 10,
    });
  });
});

describe('getSavedAlbums', () => {
  it('loads 50 at a time from the given offset', async () => {
    const saved = { added_at: '2026-01-01T00:00:00Z', album: album('s', 2) };
    const { requests } = stubFetch({ body: paging([saved], { offset: 50, limit: 50, total: 51 }) });

    const page = await getSavedAlbums(50);

    expect(requests[0].url.pathname).toBe('/v1/me/albums');
    expect(requests[0].url.searchParams.get('limit')).toBe('50');
    expect(requests[0].url.searchParams.get('offset')).toBe('50');
    expect(page.items.map((a) => a.id)).toEqual(['s']);
    expect(page.nextOffset).toBeNull();
  });
});

describe('getAlbum', () => {
  it('pages through /albums/{id}/tracks and returns all 60 tracks in order', async () => {
    const { requests } = stubFetch({ body: album('big', 60) }, { body: tracksPage('big', 50, 10, 60) });

    const result = await getAlbum('big');

    expect(requests.map((r) => r.url.pathname)).toEqual(['/v1/albums/big', '/v1/albums/big/tracks']);
    expect(requests[1].url.searchParams.get('offset')).toBe('50');
    expect(result.tracks).toHaveLength(60);
    expect(result.tracks.map((t) => t.name)).toEqual(Array.from({ length: 60 }, (_, i) => `Track ${i + 1}`));
  });

  it('parses an album without popularity or label into the app Album', async () => {
    const { requests } = stubFetch({ body: album('lean', 2) });

    await expect(getAlbum('lean')).resolves.toEqual({
      id: 'lean',
      uri: 'spotify:album:lean',
      name: 'Album lean',
      artists: ['First', 'Second'],
      imageUrl: 'https://i.scdn.co/lean-640',
      tracks: [
        { uri: 'spotify:track:t1', name: 'Track 1', durationMs: 1000 },
        { uri: 'spotify:track:t2', name: 'Track 2', durationMs: 2000 },
      ],
    });
    expect(requests).toHaveLength(1);
  });

  it('uses null for the cover when the album has no images', async () => {
    stubFetch({ body: { ...album('bare', 1), images: [] } });

    await expect(getAlbum('bare')).resolves.toMatchObject({ imageUrl: null });
  });
});

describe('getDevices', () => {
  it('returns the device list', async () => {
    const device = { id: 'd1', name: 'Phone', type: 'Smartphone', is_active: false };
    stubFetch({ body: { devices: [device] } });

    await expect(getDevices()).resolves.toEqual([device]);
  });
});

describe('player commands', () => {
  it('play starts a context at a track and position on a device', async () => {
    const { requests } = stubFetch({ status: 204 });

    await play({ deviceId: 'dev 1', contextUri: 'spotify:album:a', offsetUri: 'spotify:track:t3', positionMs: 4200 });

    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url.pathname).toBe('/v1/me/player/play');
    expect(requests[0].url.searchParams.get('device_id')).toBe('dev 1');
    expect(requests[0].headers.get('content-type')).toBe('application/json');
    expect(requests[0].body).toEqual({ context_uri: 'spotify:album:a', offset: { uri: 'spotify:track:t3' }, position_ms: 4200 });
  });

  it('play with no options resumes on the active device', async () => {
    const { requests } = stubFetch({ status: 204 });

    await play();

    expect(requests[0].url.search).toBe('');
    expect(requests[0].body).toBeUndefined();
  });

  it('play raises PremiumRequired on a Premium 403', async () => {
    stubFetch({ status: 403, body: { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } } });

    await expect(play({ contextUri: 'spotify:album:a' })).rejects.toBeInstanceOf(PremiumRequiredError);
  });

  it('any other failure raises SpotifyApiError with its status and reason', async () => {
    stubFetch({ status: 404, body: { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } } });

    const error = await pause().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SpotifyApiError);
    expect(error).toMatchObject({ status: 404, reason: 'NO_ACTIVE_DEVICE', message: 'Player command failed: No active device found' });
  });

  it('pause, next and previous hit their endpoints and accept an empty 200', async () => {
    const { requests } = stubFetch({ status: 200 }, { status: 204 }, { status: 204 });

    await pause('d1');
    await next('d1');
    await previous();

    expect(requests.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`)).toEqual([
      'PUT /v1/me/player/pause?device_id=d1',
      'POST /v1/me/player/next?device_id=d1',
      'POST /v1/me/player/previous',
    ]);
  });

  it('transferPlayback moves playback to a device', async () => {
    const { requests } = stubFetch({ status: 204 });

    await transferPlayback('d2', { play: true });

    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url.pathname).toBe('/v1/me/player');
    expect(requests[0].body).toEqual({ device_ids: ['d2'], play: true });
  });

  it('setRepeatOff turns repeat off', async () => {
    const { requests } = stubFetch({ status: 204 });

    await setRepeatOff('d1');

    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url.pathname).toBe('/v1/me/player/repeat');
    expect(requests[0].url.searchParams.get('state')).toBe('off');
    expect(requests[0].url.searchParams.get('device_id')).toBe('d1');
  });
});

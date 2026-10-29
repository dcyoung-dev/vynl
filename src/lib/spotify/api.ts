import { AuthLostError, getAccessToken, refreshAccessToken } from '../auth/session';
import type { Album, Track } from '../store/queue';
import { NotAllowlistedError, PremiumRequiredError, QuotaExceededError, SpotifyApiError } from './errors';
import type {
  SpotifyAlbum,
  SpotifyDevice,
  SpotifyDevicesResponse,
  SpotifyErrorBody,
  SpotifyPaging,
  SpotifyPlaybackState,
  SpotifySavedAlbum,
  SpotifySearchResponse,
  SpotifySimplifiedAlbum,
  SpotifyTrack,
  SpotifyUser,
} from './types';

const API_BASE = 'https://api.spotify.com/v1';
// KTD15: lean pages to respect the shared development-mode quota.
const SEARCH_LIMIT = 10;
const SAVED_ALBUMS_LIMIT = 50;
const ALBUM_TRACKS_LIMIT = 50;
const DEFAULT_RETRY_AFTER_MS = 1000;
// A longer wait than this would leave the UI hanging, so it is reported as an error instead.
const MAX_RETRY_AFTER_MS = 30_000;

/** An album as listed in search results or the library, before its tracks are fetched. */
export type AlbumSummary = Omit<Album, 'tracks'> & { totalTracks: number };

export interface AlbumPage {
  items: AlbumSummary[];
  total: number;
  /** The offset of the next page for "load more", or `null` on the last page. */
  nextOffset: number | null;
}

export interface PlayOptions {
  deviceId?: string;
  contextUri?: string;
  offsetUri?: string;
  positionMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'PUT' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** `GET /me` only: a `403` means the account isn't allowlisted (KTD16). */
  forbiddenIsNotAllowlisted?: boolean;
}

function buildUrl(path: string, query: RequestOptions['query'] = {}): string {
  const url = new URL(path.startsWith('https://') ? path : `${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorDetails(body: unknown): { message?: string; reason?: string } {
  const parsed = (body ?? {}) as SpotifyErrorBody;
  if (typeof parsed.error === 'object' && parsed.error !== null) {
    return { message: parsed.error.message, reason: parsed.error.reason ?? parsed.reason };
  }
  return { message: typeof parsed.error === 'string' ? parsed.error : undefined, reason: parsed.reason };
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds >= 0 && response.headers.has('Retry-After')
    ? seconds * 1000
    : DEFAULT_RETRY_AFTER_MS;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The one wrapper around `fetch` for the Web API (KTD3): one refresh-and-retry on `401`,
 * one `Retry-After` wait on `429`, `null` for empty responses, and typed errors for the rest.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
  const { method = 'GET', query, body, forbiddenIsNotAllowlisted = false } = options;
  const url = buildUrl(path, query);
  let token = await getAccessToken();
  let refreshed = false;
  let rateLimited = false;

  for (;;) {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      return response.status === 204 ? null : ((await readJson(response)) as T | null);
    }

    const { message = `Spotify request failed (${response.status})`, reason } = errorDetails(await readJson(response));

    if (response.status === 401) {
      if (refreshed) throw new AuthLostError();
      refreshed = true;
      token = await refreshAccessToken();
      continue;
    }

    if (response.status === 429) {
      if (reason === 'QUOTA_EXCEEDED') throw new QuotaExceededError();
      const wait = retryAfterMs(response);
      if (rateLimited || wait > MAX_RETRY_AFTER_MS) throw new SpotifyApiError(429, message, reason);
      rateLimited = true;
      await sleep(wait);
      continue;
    }

    if (response.status === 403) {
      if (forbiddenIsNotAllowlisted) throw new NotAllowlistedError(message);
      if (reason === 'PREMIUM_REQUIRED') throw new PremiumRequiredError(message);
    }

    throw new SpotifyApiError(response.status, message, reason);
  }
}

async function requestBody<T>(path: string, options?: RequestOptions): Promise<T> {
  const result = await request<T>(path, options);
  if (result === null) throw new SpotifyApiError(502, `Spotify returned an empty response for ${path}`);
  return result;
}

function toTrack(track: SpotifyTrack): Track {
  return { uri: track.uri, name: track.name, durationMs: track.duration_ms };
}

function toSummary(album: SpotifySimplifiedAlbum): AlbumSummary {
  return {
    id: album.id,
    uri: album.uri,
    name: album.name,
    artists: album.artists.map((artist) => artist.name),
    // Spotify lists images largest first.
    imageUrl: album.images[0]?.url ?? null,
    totalTracks: album.total_tracks,
  };
}

function toPage<T>(paging: SpotifyPaging<T>, map: (item: T) => AlbumSummary): AlbumPage {
  // Spotify can return fewer items than `limit`, so the next page starts at `offset + limit`.
  const nextOffset = paging.offset + paging.limit;
  return {
    items: paging.items.map(map),
    total: paging.total,
    nextOffset: paging.next !== null && nextOffset < paging.total ? nextOffset : null,
  };
}

export async function getMe(): Promise<SpotifyUser> {
  return requestBody<SpotifyUser>('/me', { forbiddenIsNotAllowlisted: true });
}

export async function getSavedAlbums(offset = 0): Promise<AlbumPage> {
  const paging = await requestBody<SpotifyPaging<SpotifySavedAlbum>>('/me/albums', {
    query: { limit: SAVED_ALBUMS_LIMIT, offset },
  });
  return toPage(paging, (saved) => toSummary(saved.album));
}

export async function searchAlbums(query: string, offset = 0): Promise<AlbumPage> {
  const result = await requestBody<SpotifySearchResponse>('/search', {
    query: { q: query, type: 'album', limit: SEARCH_LIMIT, offset },
  });
  return toPage(result.albums, toSummary);
}

/** One album with its full track list, paging `/albums/{id}/tracks` past the first 50 (KTD15). */
export async function getAlbum(id: string): Promise<Album> {
  const album = await requestBody<SpotifyAlbum>(`/albums/${encodeURIComponent(id)}`);
  const tracks = [...album.tracks.items];
  let page = album.tracks;
  while (page.next !== null && tracks.length < page.total) {
    page = await requestBody<SpotifyPaging<SpotifyTrack>>(`/albums/${encodeURIComponent(id)}/tracks`, {
      query: { limit: ALBUM_TRACKS_LIMIT, offset: tracks.length },
    });
    if (page.items.length === 0) break;
    tracks.push(...page.items);
  }
  const { totalTracks: _, ...summary } = toSummary(album);
  return { ...summary, tracks: tracks.map(toTrack) };
}

/** `null` when nothing is playing on any device (`204`). */
export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  return request<SpotifyPlaybackState>('/me/player');
}

export async function getDevices(): Promise<SpotifyDevice[]> {
  const result = await requestBody<SpotifyDevicesResponse>('/me/player/devices');
  return result.devices;
}

/** Starts `contextUri` at `offsetUri`, or resumes the current context when no context is given (KTD4). */
export async function play({ deviceId, contextUri, offsetUri, positionMs }: PlayOptions = {}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (contextUri !== undefined) body.context_uri = contextUri;
  if (offsetUri !== undefined) body.offset = { uri: offsetUri };
  if (positionMs !== undefined) body.position_ms = positionMs;
  await request('/me/player/play', {
    method: 'PUT',
    query: { device_id: deviceId },
    body: Object.keys(body).length > 0 ? body : undefined,
  });
}

export async function pause(deviceId?: string): Promise<void> {
  await request('/me/player/pause', { method: 'PUT', query: { device_id: deviceId } });
}

export async function next(deviceId?: string): Promise<void> {
  await request('/me/player/next', { method: 'POST', query: { device_id: deviceId } });
}

export async function previous(deviceId?: string): Promise<void> {
  await request('/me/player/previous', { method: 'POST', query: { device_id: deviceId } });
}

export async function transferPlayback(deviceId: string, { play = false }: { play?: boolean } = {}): Promise<void> {
  await request('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } });
}

/** Vynl plays one album context at a time, so repeat is turned off before each album (KTD4). */
export async function setRepeatOff(deviceId?: string): Promise<void> {
  await request('/me/player/repeat', { method: 'PUT', query: { state: 'off', device_id: deviceId } });
}

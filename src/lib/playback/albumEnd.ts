import type { Album } from '../store/queue';

/**
 * How long a just-started album may be reported as something else (stale SDK or poll
 * states from before the play request took effect) before that counts as other playback.
 */
export const START_CONFIRM_MS = 10_000;

/** One playback of one album. Every play request Vynl sends starts a new instance. */
export interface AlbumInstance {
  id: number;
  album: Album;
  /** The device that was playing it; `null` until known. */
  deviceId: string | null;
  startedAt: number;
  /** Last-track start plus its duration, from the latest observation of the album (KTD5). */
  expectedEndAt: number | null;
  /** The album has been seen playing since the play request. */
  confirmed: boolean;
  /** The end signal has advanced the queue; later signals are ignored. */
  advanced: boolean;
  /** Other playback took over (R21); this instance can no longer end. */
  lost: boolean;
}

/** A playback state from the SDK or `GET /me/player`, flattened. */
export interface Observation {
  deviceId: string | null;
  deviceName: string;
  isVynl: boolean;
  contextUri: string | null;
  trackUri: string | null;
  /** The current track's album. `null` when Spotify didn't say. */
  trackAlbumUri: string | null;
  paused: boolean;
  positionMs: number;
  at: number;
}

export type Verdict =
  /** The started album; `trackIndex` is -1 when the track isn't in Vynl's track list. */
  | { kind: 'album'; trackIndex: number; positionMs: number }
  /** The album has ended. `autoplayStarted` means Spotify is already playing something after it. */
  | { kind: 'ended'; autoplayStarted: boolean }
  | { kind: 'elsewhere' }
  | { kind: 'ignore' };

export function createInstance(id: number, album: Album, deviceId: string | null, now: number): AlbumInstance {
  return { id, album, deviceId, startedAt: now, expectedEndAt: null, confirmed: false, advanced: false, lost: false };
}

export function endWindowOpen(instance: AlbumInstance, now: number, graceMs: number): boolean {
  return instance.expectedEndAt !== null && Math.abs(now - instance.expectedEndAt) <= graceMs;
}

/**
 * The KTD5 decision, as corrected by the U6 spike (docs/spikes/playback-spike.md).
 *
 * Inside the grace window, on the device that was playing, the album has ended when the
 * current track is no longer its last track (autoplay, or a loop back to an earlier track),
 * when the last track is paused at 0, or when the context changes. Anything other than
 * the started album on a different device, or outside the window, is other playback.
 */
export function classify(instance: AlbumInstance, obs: Observation, now: number, graceMs: number): Verdict {
  if (instance.advanced) return { kind: 'ignore' };

  const { album } = instance;
  const trackIndex = album.tracks.findIndex((track) => track.uri === obs.trackUri);
  const trackAlbumUri = obs.trackAlbumUri ?? (trackIndex >= 0 ? album.uri : null);
  const contextMatches = obs.contextUri === album.uri;
  const onAlbum = contextMatches && trackAlbumUri === album.uri;
  const albumVerdict: Verdict = { kind: 'album', trackIndex, positionMs: obs.positionMs };

  if (!instance.confirmed && !onAlbum) {
    return now - instance.startedAt < START_CONFIRM_MS ? { kind: 'ignore' } : { kind: 'elsewhere' };
  }
  if (instance.lost) return onAlbum ? albumVerdict : { kind: 'elsewhere' };

  const sameDevice = instance.deviceId === null || obs.deviceId === instance.deviceId;
  if (sameDevice && endWindowOpen(instance, now, graceMs)) {
    const last = album.tracks.length - 1;
    if (!onAlbum) return { kind: 'ended', autoplayStarted: !obs.paused };
    if (trackIndex >= 0 && trackIndex < last) return { kind: 'ended', autoplayStarted: !obs.paused };
    if (trackIndex === last && obs.paused && obs.positionMs === 0) return { kind: 'ended', autoplayStarted: false };
  }

  return onAlbum ? albumVerdict : { kind: 'elsewhere' };
}

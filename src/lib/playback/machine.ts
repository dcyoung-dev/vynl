import type { PlaybackStatus } from '../store/queue';

export type MachineEvent =
  /** KTD17: the one `GET /me/player` read after the SDK is ready (or has failed to load). */
  | { type: 'startup'; live: 'album-remote' | 'none'; hasSaved: boolean }
  | { type: 'failure'; status: 'SdkUnavailable' | 'PremiumRequired' | 'AuthLost' }
  /** The started album is playing or paused; `ending` means its last track is nearly over. */
  | { type: 'album'; remote: boolean; paused: boolean; ending: boolean }
  /** Something other than the started album is playing (R21). */
  | { type: 'elsewhere' }
  /** Nothing is playing on any device. */
  | { type: 'stopped' }
  /** The album ended (KTD5). */
  | { type: 'ended'; hasNext: boolean }
  | { type: 'autoplayFailed' };

/** States the controller can't play its way out of; only signing in again (U11) leaves them. */
const BLOCKED: ReadonlySet<PlaybackStatus> = new Set([
  'SignedOut',
  'Follower',
  'NotAllowlisted',
  'PremiumRequired',
  'AuthLost',
]);

/** States with a record on the turntable. */
const RECORD_ON: ReadonlySet<PlaybackStatus> = new Set(['Playing', 'Paused', 'Mirroring', 'AlbumEnding']);

/** The pure transition function over the High-Level Technical Design states. */
export function transition(status: PlaybackStatus, event: MachineEvent): PlaybackStatus {
  if (event.type === 'failure') {
    if (event.status === 'SdkUnavailable' && BLOCKED.has(status)) return status;
    return event.status;
  }
  if (BLOCKED.has(status)) return status;

  if (status === 'Starting') {
    if (event.type !== 'startup') return status;
    if (event.live === 'album-remote') return 'Mirroring';
    return event.hasSaved ? 'ReadyToResume' : 'Resting';
  }

  if (status === 'SdkUnavailable') {
    const remoteAlbum =
      (event.type === 'startup' && event.live === 'album-remote') || (event.type === 'album' && event.remote);
    return remoteAlbum ? 'Mirroring' : status;
  }

  switch (event.type) {
    case 'startup':
      return status;
    case 'album':
      if (event.paused) return 'Paused';
      if (event.ending) return 'AlbumEnding';
      return event.remote ? 'Mirroring' : 'Playing';
    case 'elsewhere':
      return RECORD_ON.has(status) ? 'PlayingElsewhere' : status;
    case 'stopped':
      return status === 'Playing' || status === 'Mirroring' || status === 'AlbumEnding' ? 'Paused' : status;
    case 'ended':
      return event.hasNext ? 'AlbumEnding' : 'Resting';
    case 'autoplayFailed':
      return status === 'Playing' || status === 'AlbumEnding' ? 'Paused' : status;
  }
}

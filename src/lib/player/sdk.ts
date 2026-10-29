import { AuthLostError, getAccessToken, refreshAccessToken } from '../auth/session';

export interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}

export interface WebPlaybackTrack {
  uri: string;
  id: string | null;
  name: string;
  duration_ms: number;
}

export interface WebPlaybackState {
  context: { uri: string | null };
  paused: boolean;
  position: number;
  duration: number;
  timestamp: number;
  track_window: { current_track: WebPlaybackTrack | null };
}

export interface SpotifyPlayerEvents {
  ready: { device_id: string };
  not_ready: { device_id: string };
  player_state_changed: WebPlaybackState | null;
  autoplay_failed: void;
  account_error: { message: string };
  authentication_error: { message: string };
  initialization_error: { message: string };
  playback_error: { message: string };
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  addListener<E extends keyof SpotifyPlayerEvents>(event: E, callback: (payload: SpotifyPlayerEvents[E]) => void): boolean;
}

declare global {
  interface Window {
    Spotify?: { Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export type PlayerFailure = 'SdkUnavailable' | 'PremiumRequired' | 'AuthLost';

export type PlayerSignal =
  | { type: 'ready'; deviceId: string }
  | { type: 'not_ready'; deviceId: string }
  | { type: 'state'; state: WebPlaybackState | null }
  | { type: 'autoplay_failed' }
  | { type: 'failure'; status: PlayerFailure }
  | { type: 'error'; kind: 'initialization_error' | 'playback_error'; message: string };

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Vynl';
export const READY_TIMEOUT_MS = 10_000;

/** The SDK script or its `ready` event didn't arrive, usually because an ad blocker stopped it. */
export class SdkUnavailableError extends Error {
  constructor(message = 'The Spotify player could not be loaded') {
    super(message);
    this.name = 'SdkUnavailable';
  }
}

const listeners = new Set<(signal: PlayerSignal) => void>();
let scriptLoad: Promise<void> | null = null;
let playerLoad: Promise<SpotifyPlayer> | null = null;
let player: SpotifyPlayer | null = null;
let deviceId: string | null = null;
let readyTimer: ReturnType<typeof setTimeout> | null = null;
// Bumped by disconnect() so a load that finishes after sign-out doesn't create a player.
let generation = 0;

function emit(signal: PlayerSignal): void {
  for (const listener of [...listeners]) listener(signal);
}

function clearReadyTimer(): void {
  if (readyTimer !== null) clearTimeout(readyTimer);
  readyTimer = null;
}

function fail(status: PlayerFailure): void {
  clearReadyTimer();
  emit({ type: 'failure', status });
}

function loadScript(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (!scriptLoad) {
    const script = document.createElement('script');
    scriptLoad = new Promise<void>((resolve, reject) => {
      // The SDK calls this global once it has run, so it must exist before the script does.
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      script.addEventListener('error', () => reject(new SdkUnavailableError()));
    }).catch((error: unknown) => {
      scriptLoad = null;
      script.remove();
      throw error;
    });
    script.src = SDK_URL;
    script.async = true;
    document.head.appendChild(script);
  }
  return scriptLoad;
}

function createPlayer(SpotifyPlayerClass: NonNullable<Window['Spotify']>['Player']): SpotifyPlayer {
  const instance = new SpotifyPlayerClass({
    name: PLAYER_NAME,
    getOAuthToken: (callback) => {
      getAccessToken().then(callback, (error: unknown) => {
        if (error instanceof AuthLostError && player === instance) fail('AuthLost');
      });
    },
  });
  const current = () => player === instance;
  const connect = () => {
    instance.connect().catch(() => {});
  };

  instance.addListener('ready', ({ device_id }) => {
    if (!current()) return;
    clearReadyTimer();
    deviceId = device_id;
    emit({ type: 'ready', deviceId: device_id });
  });
  instance.addListener('not_ready', ({ device_id }) => {
    if (!current()) return;
    if (deviceId === device_id) deviceId = null;
    emit({ type: 'not_ready', deviceId: device_id });
  });
  instance.addListener('player_state_changed', (state) => {
    if (current()) emit({ type: 'state', state });
  });
  instance.addListener('autoplay_failed', () => {
    if (current()) emit({ type: 'autoplay_failed' });
  });
  instance.addListener('account_error', () => {
    if (current()) fail('PremiumRequired');
  });
  instance.addListener('authentication_error', () => {
    if (!current()) return;
    refreshAccessToken().then(
      () => {
        if (current()) connect();
      },
      () => {
        if (current()) fail('AuthLost');
      },
    );
  });
  instance.addListener('initialization_error', ({ message }) => {
    if (current()) emit({ type: 'error', kind: 'initialization_error', message });
  });
  instance.addListener('playback_error', ({ message }) => {
    if (current()) emit({ type: 'error', kind: 'playback_error', message });
  });

  player = instance;
  window.addEventListener('pagehide', disconnect);
  connect();
  return instance;
}

function start(): Promise<SpotifyPlayer> {
  const started = generation;
  return new Promise<SpotifyPlayer>((resolve, reject) => {
    readyTimer = setTimeout(() => {
      readyTimer = null;
      emit({ type: 'failure', status: 'SdkUnavailable' });
      reject(new SdkUnavailableError());
    }, READY_TIMEOUT_MS);

    loadScript().then(
      () => {
        if (started !== generation) {
          reject(new DOMException('The player was disconnected while loading', 'AbortError'));
        } else if (!window.Spotify) {
          fail('SdkUnavailable');
          reject(new SdkUnavailableError());
        } else {
          resolve(createPlayer(window.Spotify.Player));
        }
      },
      (error: unknown) => {
        if (started === generation) fail('SdkUnavailable');
        reject(error);
      },
    );
  });
}

/**
 * Loads the SDK once and connects the single "Vynl" player. Concurrent and repeat calls
 * share the same player until `disconnect()`. Rejects with `SdkUnavailableError` if the
 * script fails or doesn't run within 10s; a missing `ready` is reported as a signal.
 */
export function load(): Promise<SpotifyPlayer> {
  if (!playerLoad) {
    const loading = start();
    playerLoad = loading;
    loading.catch(() => {
      if (playerLoad === loading) playerLoad = null;
    });
  }
  return playerLoad;
}

export function subscribe(listener: (signal: PlayerSignal) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The tab's Spotify Connect device ID while the SDK reports it ready. */
export function getDeviceId(): string | null {
  return deviceId;
}

/** Disconnects the player (on sign-out and `pagehide`); the next `load()` connects a new one. */
export function disconnect(): void {
  generation++;
  clearReadyTimer();
  window.removeEventListener('pagehide', disconnect);
  const previous = player;
  player = null;
  playerLoad = null;
  deviceId = null;
  previous?.disconnect();
}

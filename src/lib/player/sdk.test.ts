import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeSpotifySdk, SDK_SCRIPT_URL, type FakeSpotifySdk } from '../../test/fakes/spotifySdk';
import type { PlayerSignal, WebPlaybackState } from './sdk';

vi.mock('../auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/session')>()),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

let fake: FakeSpotifySdk;
let sdk: typeof import('./sdk');
let session: typeof import('../auth/session');
let signals: PlayerSignal[];

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function loadReadyPlayer() {
  const loading = sdk.load();
  fake.finishLoading();
  await loading;
  fake.player.emit('ready', { device_id: 'device-1' });
  return fake.player;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  fake = installFakeSpotifySdk();
  sdk = await import('./sdk');
  session = await import('../auth/session');
  vi.mocked(session.getAccessToken).mockResolvedValue('access-1');
  signals = [];
  sdk.subscribe((signal) => signals.push(signal));
});

afterEach(() => {
  sdk.disconnect();
  fake.uninstall();
  vi.useRealTimers();
});

describe('load', () => {
  it('injects the script once and returns the same player for two calls', async () => {
    const first = sdk.load();
    const second = sdk.load();

    expect(fake.scripts).toHaveLength(1);
    expect(fake.scripts[0].src).toBe(SDK_SCRIPT_URL);

    fake.finishLoading();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(fake.players).toHaveLength(1);
    expect(await sdk.load()).toBe(a);
    expect(fake.scripts).toHaveLength(1);
  });

  it('defines the ready hook before injecting the script', () => {
    sdk.load();
    expect(fake.scripts).toHaveLength(1);
    expect(typeof window.onSpotifyWebPlaybackSDKReady).toBe('function');
  });

  it('creates a connected player named Vynl', async () => {
    const loading = sdk.load();
    fake.finishLoading();
    await loading;

    expect(fake.player.options.name).toBe('Vynl');
    expect(fake.player.connect).toHaveBeenCalledTimes(1);
  });

  it('hands the SDK the session access token', async () => {
    const loading = sdk.load();
    fake.finishLoading();
    await loading;

    await expect(fake.player.requestToken()).resolves.toBe('access-1');
    expect(session.getAccessToken).toHaveBeenCalled();
  });

  it('reports AuthLost when the session has no token to give the SDK', async () => {
    vi.mocked(session.getAccessToken).mockRejectedValue(new session.AuthLostError());
    const loading = sdk.load();
    fake.finishLoading();
    await loading;

    fake.player.options.getOAuthToken(() => {});
    await flush();

    expect(signals).toContainEqual({ type: 'failure', status: 'AuthLost' });
  });
});

describe('SdkUnavailable', () => {
  it('is reported when ready has not arrived 10s after the script was injected', async () => {
    const loading = sdk.load();
    fake.finishLoading();
    await loading;

    vi.advanceTimersByTime(9_999);
    expect(signals).not.toContainEqual({ type: 'failure', status: 'SdkUnavailable' });

    vi.advanceTimersByTime(1);
    expect(signals).toContainEqual({ type: 'failure', status: 'SdkUnavailable' });
  });

  it('is reported, and load rejects, when the script never runs', async () => {
    const loading = sdk.load();
    const outcome = loading.then(
      () => 'resolved',
      (error: Error) => error.name,
    );

    vi.advanceTimersByTime(10_000);

    expect(signals).toContainEqual({ type: 'failure', status: 'SdkUnavailable' });
    await expect(outcome).resolves.toBe('SdkUnavailable');
  });

  it('is reported straight away when the script fails to load', async () => {
    const loading = sdk.load();
    const outcome = loading.catch((error: Error) => error.name);

    fake.failLoading();
    await flush();

    expect(signals).toContainEqual({ type: 'failure', status: 'SdkUnavailable' });
    await expect(outcome).resolves.toBe('SdkUnavailable');
  });

  it('is not reported when ready arrives in time', async () => {
    await loadReadyPlayer();

    vi.advanceTimersByTime(20_000);

    expect(signals).not.toContainEqual({ type: 'failure', status: 'SdkUnavailable' });
  });
});

describe('SDK events', () => {
  it('reports PremiumRequired on account_error', async () => {
    const loading = sdk.load();
    fake.finishLoading();
    await loading;

    fake.player.emit('account_error', { message: 'This functionality is restricted to premium users only' });
    vi.advanceTimersByTime(10_000);

    expect(signals).toContainEqual({ type: 'failure', status: 'PremiumRequired' });
    expect(signals).not.toContainEqual({ type: 'failure', status: 'SdkUnavailable' });
  });

  it('forces a token refresh on authentication_error', async () => {
    vi.mocked(session.refreshAccessToken).mockResolvedValue('access-2');
    const player = await loadReadyPlayer();

    player.emit('authentication_error', { message: 'Invalid token scopes.' });
    await flush();

    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(player.connect).toHaveBeenCalledTimes(2);
    expect(signals).not.toContainEqual({ type: 'failure', status: 'AuthLost' });
  });

  it('reports AuthLost when the forced refresh fails', async () => {
    vi.mocked(session.refreshAccessToken).mockRejectedValue(new session.AuthLostError());
    const player = await loadReadyPlayer();

    player.emit('authentication_error', { message: 'Authentication failed' });
    await flush();

    expect(signals).toContainEqual({ type: 'failure', status: 'AuthLost' });
  });

  it('exposes the device ID on ready and clears it on not_ready', async () => {
    const loading = sdk.load();
    fake.finishLoading();
    await loading;
    expect(sdk.getDeviceId()).toBeNull();

    fake.player.emit('ready', { device_id: 'device-1' });
    expect(sdk.getDeviceId()).toBe('device-1');
    expect(signals).toContainEqual({ type: 'ready', deviceId: 'device-1' });

    fake.player.emit('not_ready', { device_id: 'device-1' });
    expect(sdk.getDeviceId()).toBeNull();
    expect(signals).toContainEqual({ type: 'not_ready', deviceId: 'device-1' });
  });

  it('forwards player state, autoplay failures and errors', async () => {
    const player = await loadReadyPlayer();
    const state: WebPlaybackState = {
      context: { uri: 'spotify:album:1' },
      paused: false,
      position: 1_000,
      duration: 200_000,
      timestamp: 0,
      track_window: { current_track: { uri: 'spotify:track:1', id: '1', name: 'One', duration_ms: 200_000 } },
    };

    player.emit('player_state_changed', state);
    player.emit('autoplay_failed', undefined);
    player.emit('playback_error', { message: 'Failed to play' });
    player.emit('initialization_error', { message: 'No EME' });

    expect(signals).toEqual(
      expect.arrayContaining([
        { type: 'state', state },
        { type: 'autoplay_failed' },
        { type: 'error', kind: 'playback_error', message: 'Failed to play' },
        { type: 'error', kind: 'initialization_error', message: 'No EME' },
      ]),
    );
  });

  it('stops delivering signals after unsubscribe', async () => {
    const received: PlayerSignal[] = [];
    const unsubscribe = sdk.subscribe((signal) => received.push(signal));
    unsubscribe();

    await loadReadyPlayer();

    expect(received).toEqual([]);
    expect(signals).toContainEqual({ type: 'ready', deviceId: 'device-1' });
  });
});

describe('disconnect', () => {
  it('disconnects on sign-out and connects a fresh player on the next load', async () => {
    const player = await loadReadyPlayer();

    sdk.disconnect();

    expect(player.disconnect).toHaveBeenCalledTimes(1);
    expect(sdk.getDeviceId()).toBeNull();

    const loading = sdk.load();
    await loading;
    expect(fake.scripts).toHaveLength(1);
    expect(fake.players).toHaveLength(2);
    expect(await loading).toBe(fake.player);
  });

  it('disconnects on pagehide', async () => {
    const player = await loadReadyPlayer();

    window.dispatchEvent(new Event('pagehide'));

    expect(player.disconnect).toHaveBeenCalledTimes(1);
    expect(sdk.getDeviceId()).toBeNull();
  });
});

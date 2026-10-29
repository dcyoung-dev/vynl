import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebPlaybackState } from '../player/sdk';
import { initialQueueState, queueReducer, type Album, type QueueAction, type QueueState } from '../store/queue';
import { installFakeSpotifySdk, type FakeSpotifySdk } from '../../test/fakes/spotifySdk';
import { InlineSchedulerWorker } from '../../test/fakes/schedulerWorker';
import { stubSpotifyWebApi, type FakeLive, type FakeSpotifyWebApi } from '../../test/fakes/spotifyWebApi';
import {
  GRACE_MS_LOCAL,
  POLL_MS_IDLE,
  POLL_MS_REMOTE_HIDDEN,
  POLL_MS_REMOTE_VISIBLE,
  POLL_MS_SDK_VISIBLE,
  REMOTE_LEAD_MS,
  WORKER_GAP_MS,
  WORKER_TICK_MS,
} from './constants';
import type { PlaybackController } from './controller';

vi.mock('../auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/session')>()),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

const TRACK_MS = 180_000;

function album(id: string, count = 10): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: `Album ${id.toUpperCase()}`,
    artists: ['Artist'],
    imageUrl: null,
    tracks: Array.from({ length: count }, (_, i) => ({
      uri: `spotify:track:${id}${i + 1}`,
      name: `Track ${i + 1}`,
      durationMs: TRACK_MS,
    })),
  };
}

const A = album('a');
const B = album('b');
const C = album('c');

let fake: FakeSpotifySdk;
let sdk: typeof import('../player/sdk');
let session: typeof import('../auth/session');
let createController: typeof import('./controller').createController;
let web: FakeSpotifyWebApi;
let worker: InlineSchedulerWorker;
let controller: PlaybackController;
let store: ReturnType<typeof createStore>;
let visibility: ReturnType<typeof fakeVisibility>;

function createStore(initial: Partial<QueueState>) {
  let state: QueueState = { ...initialQueueState(), ...initial };
  return {
    getState: () => state,
    dispatch: (action: QueueAction) => {
      state = queueReducer(state, action);
    },
  };
}

function fakeVisibility() {
  let hidden = false;
  const listeners = new Set<() => void>();
  return {
    hidden: () => hidden,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: boolean) {
      hidden = next;
      for (const listener of listeners) listener();
    },
  };
}

async function settle() {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
}

async function start(initial: Partial<QueueState> = {}, live: FakeLive | null = null) {
  store = createStore(initial);
  web.setLive(live);
  controller = createController({
    store,
    createWorker: () => (worker = new InlineSchedulerWorker()),
    visibility,
  });
  controller.start();
  fake.finishLoading();
  await settle();
  fake.player.emit('ready', { device_id: 'vynl' });
  await settle();
}

function emitState(options: {
  contextUri: string | null;
  trackUri: string;
  albumUri: string;
  positionMs?: number;
  paused?: boolean;
}) {
  const state = {
    context: { uri: options.contextUri },
    paused: options.paused ?? false,
    position: options.positionMs ?? 0,
    duration: TRACK_MS,
    timestamp: Date.now(),
    track_window: {
      current_track: {
        uri: options.trackUri,
        id: options.trackUri,
        name: options.trackUri,
        duration_ms: TRACK_MS,
        album: { uri: options.albumUri },
      },
    },
  } as WebPlaybackState;
  fake.player.emit('player_state_changed', state);
}

/** The SDK reports `album` playing at `trackIndex` in the tab. */
function sdkTrack(a: Album, trackIndex: number, options: { positionMs?: number; paused?: boolean } = {}) {
  emitState({ contextUri: a.uri, trackUri: a.tracks[trackIndex].uri, albumUri: a.uri, ...options });
}

/** Spotify's autoplay: another album's track, while the context stays on the finished album. */
function sdkAutoplay(finished: Album) {
  emitState({ contextUri: finished.uri, trackUri: 'spotify:track:x1', albumUri: 'spotify:album:x' });
}

function plays() {
  return web.commands().filter((c) => c.path === '/me/player/play');
}

function playsOf(a: Album) {
  return plays().filter((c) => (c.body as { context_uri?: string } | undefined)?.context_uri === a.uri);
}

const phoneLive = (a: Album, trackIndex: number, progressMs = 0, isPlaying = true): FakeLive => ({
  deviceId: 'phone',
  deviceName: 'Phone',
  contextUri: a.uri,
  trackUri: a.tracks[trackIndex].uri,
  albumUri: a.uri,
  progressMs,
  isPlaying,
});

const playlistOnPhone: FakeLive = {
  deviceId: 'phone',
  deviceName: 'Phone',
  contextUri: 'spotify:playlist:p',
  trackUri: 'spotify:track:p1',
  albumUri: 'spotify:album:p',
  progressMs: 0,
  isPlaying: true,
};

/** Album `a` started in the tab and the SDK reports it at `trackIndex`. */
async function playingInTab(a: Album, trackIndex: number, positionMs = 0) {
  await controller.playAlbum(a);
  sdkTrack(a, trackIndex, { positionMs });
  await settle();
}

/** The tab stops being the active device and the next poll sees `live`. */
async function handOff(live: FakeLive | null) {
  web.setLive(live);
  fake.player.emit('player_state_changed', null);
  await settle();
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  vi.resetModules();
  fake = installFakeSpotifySdk();
  sdk = await import('../player/sdk');
  session = await import('../auth/session');
  vi.mocked(session.getAccessToken).mockResolvedValue('access-1');
  ({ createController } = await import('./controller'));
  web = stubSpotifyWebApi();
  visibility = fakeVisibility();
});

afterEach(() => {
  controller?.dispose();
  sdk.disconnect();
  fake.uninstall();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('starting up (KTD17)', () => {
  it('rests when nothing is saved or live', async () => {
    await start();
    expect(store.getState().status).toBe('Resting');
    expect(controller.getSnapshot().status).toBe('Resting');
  });

  it('is ReadyToResume after a reload with saved state and nothing live, and plays nothing (AE4)', async () => {
    await start({ current: A, position: { trackIndex: 4, positionMs: 60_000 } });
    expect(store.getState().status).toBe('ReadyToResume');
    expect(store.getState().position).toEqual({ trackIndex: 4, positionMs: 60_000 });
    expect(web.commands()).toEqual([]);
  });

  it('mirrors a reload while the same album is live', async () => {
    await start({ current: A, position: { trackIndex: 1, positionMs: 0 } }, phoneLive(A, 5, 30_000));
    expect(store.getState().status).toBe('Mirroring');
    expect(store.getState().position).toEqual({ trackIndex: 5, positionMs: 30_000 });
    expect(controller.getSnapshot().device).toEqual({ id: 'phone', name: 'Phone', isVynl: false });
    expect(web.commands()).toEqual([]);
  });

  it('reports PremiumRequired from the SDK', async () => {
    await start();
    fake.player.emit('account_error', { message: 'premium' });
    await settle();
    expect(store.getState().status).toBe('PremiumRequired');
  });
});

describe('playing an album', () => {
  it('turns repeat off, then sends context_uri and the first track to the SDK device', async () => {
    await start();
    await controller.playAlbum(A);

    expect(fake.player.activateElement).toHaveBeenCalled();
    expect(web.commands()).toEqual([
      { method: 'PUT', path: '/me/player/repeat', query: { state: 'off', device_id: 'vynl' }, body: undefined },
      {
        method: 'PUT',
        path: '/me/player/play',
        query: { device_id: 'vynl' },
        body: { context_uri: A.uri, offset: { uri: A.tracks[0].uri }, position_ms: 0 },
      },
    ]);
    expect(store.getState().current).toEqual(A);

    sdkTrack(A, 0);
    await settle();
    expect(store.getState().status).toBe('Playing');
  });

  it('moves the needle from track 3 to track 8 and progress jumps to match (AE2)', async () => {
    await start();
    await playingInTab(A, 2);

    await controller.moveNeedle(7);

    expect(plays().at(-1)).toMatchObject({
      query: { device_id: 'vynl' },
      body: { context_uri: A.uri, offset: { uri: A.tracks[7].uri }, position_ms: 0 },
    });
    expect(store.getState().position).toEqual({ trackIndex: 7, positionMs: 0 });
    expect(controller.getSnapshot().progress).toBeCloseTo(0.7);
  });

  it('pauses and resumes on the device that is playing', async () => {
    await start();
    await playingInTab(A, 2);

    await controller.playPause();
    expect(web.commands().at(-1)).toMatchObject({ path: '/me/player/pause', query: { device_id: 'vynl' } });
    sdkTrack(A, 2, { paused: true, positionMs: 1_000 });
    await settle();
    expect(store.getState().status).toBe('Paused');

    await controller.playPause();
    expect(web.commands().at(-1)).toEqual({
      method: 'PUT',
      path: '/me/player/play',
      query: { device_id: 'vynl' },
      body: undefined,
    });
  });

  it('drops the needle at the saved position from ReadyToResume', async () => {
    await start({ current: A, position: { trackIndex: 4, positionMs: 60_000 } });
    await controller.playPause();
    expect(fake.player.activateElement).toHaveBeenCalled();
    expect(plays().at(-1)).toMatchObject({
      query: { device_id: 'vynl' },
      body: { context_uri: A.uri, offset: { uri: A.tracks[4].uri }, position_ms: 60_000 },
    });
  });

  it('skips to the next and previous tracks within the album', async () => {
    await start();
    await playingInTab(A, 2, 10_000);

    await controller.next();
    expect(plays().at(-1)).toMatchObject({ body: { offset: { uri: A.tracks[3].uri }, position_ms: 0 } });
    sdkTrack(A, 3, { positionMs: 1_000 });
    await settle();

    await controller.previous();
    expect(plays().at(-1)).toMatchObject({ body: { offset: { uri: A.tracks[2].uri }, position_ms: 0 } });
  });

  it('starts the next queued album when skipping past the last track', async () => {
    await start({ queue: [B] });
    await playingInTab(A, 9);
    await controller.next();
    expect(playsOf(B)).toHaveLength(1);
    expect(store.getState().current).toEqual(B);
  });

  it('sends two commands back to back to the API in order', async () => {
    await start();
    await playingInTab(A, 2);
    const before = plays().length;

    let release!: (response: { status: number }) => void;
    web.respondOnce('PUT', '/me/player/play', new Promise((resolve) => (release = resolve)));
    const first = controller.moveNeedle(4);
    const second = controller.moveNeedle(6);
    await settle();
    expect(plays()).toHaveLength(before + 1);
    expect(plays().at(-1)).toMatchObject({ body: { offset: { uri: A.tracks[4].uri } } });

    release({ status: 204 });
    await settle();
    await Promise.all([first, second]);
    expect(plays()).toHaveLength(before + 2);
    expect(plays().at(-1)).toMatchObject({ body: { offset: { uri: A.tracks[6].uri } } });
  });

  it('reports AuthLost when the session is gone', async () => {
    await start();
    vi.mocked(session.getAccessToken).mockRejectedValue(new session.AuthLostError());
    await controller.playAlbum(A);
    expect(store.getState().status).toBe('AuthLost');
  });
});

describe('album end in the tab (KTD5 as corrected by the spike)', () => {
  async function onLastTrack(queue: Album[]) {
    await start({ queue });
    await playingInTab(A, 9);
  }

  it('advances exactly once when the end signal arrives twice', async () => {
    await onLastTrack([B]);
    await vi.advanceTimersByTimeAsync(TRACK_MS);

    sdkAutoplay(A);
    sdkAutoplay(A);
    await settle();

    expect(playsOf(B)).toHaveLength(1);
    expect(playsOf(B)[0]).toMatchObject({
      query: { device_id: 'vynl' },
      body: { offset: { uri: B.tracks[0].uri }, position_ms: 0 },
    });
    expect(store.getState().current).toEqual(B);
    expect(store.getState().queue).toEqual([]);

    // Autoplay is still reported before the next album takes over.
    sdkAutoplay(A);
    await settle();
    expect(store.getState().status).not.toBe('PlayingElsewhere');
    expect(playsOf(B)).toHaveLength(1);

    sdkTrack(B, 0);
    await settle();
    expect(store.getState().status).toBe('Playing');
  });

  it('counts an autoplay track (another album, same context) 5s after the expected end as the album ending', async () => {
    await onLastTrack([B]);
    await vi.advanceTimersByTimeAsync(TRACK_MS + 5_000);
    sdkAutoplay(A);
    await settle();

    expect(store.getState().status).not.toBe('PlayingElsewhere');
    expect(playsOf(B)).toHaveLength(1);
  });

  it('counts a loop back to track 1 of the same album at the expected end as the album ending', async () => {
    await onLastTrack([B]);
    await vi.advanceTimersByTimeAsync(TRACK_MS);
    sdkTrack(A, 0);
    await settle();

    expect(playsOf(B)).toHaveLength(1);
    expect(store.getState().current).toEqual(B);
  });

  it('counts the last track pausing at 0 near the expected end as the album ending', async () => {
    await onLastTrack([B]);
    await vi.advanceTimersByTimeAsync(TRACK_MS);
    sdkTrack(A, 9, { paused: true, positionMs: 0 });
    await settle();

    expect(playsOf(B)).toHaveLength(1);
    expect(web.commands().filter((c) => c.path === '/me/player/pause')).toEqual([]);
  });

  it('pauses autoplay and rests when the queue is empty (AE3)', async () => {
    await onLastTrack([]);
    await vi.advanceTimersByTimeAsync(TRACK_MS);
    sdkAutoplay(A);
    await settle();

    expect(web.commands().at(-1)).toMatchObject({ path: '/me/player/pause', query: { device_id: 'vynl' } });
    expect(store.getState().status).toBe('Resting');
    expect(store.getState().current).toBeNull();
  });

  it('is PlayingElsewhere when a different context starts on a different device inside the grace window', async () => {
    await onLastTrack([B]);
    await vi.advanceTimersByTimeAsync(TRACK_MS + 1_000);
    await handOff(playlistOnPhone);

    expect(store.getState().status).toBe('PlayingElsewhere');
    expect(store.getState().current).toEqual(A);
    expect(store.getState().queue).toEqual([B]);
    expect(playsOf(B)).toEqual([]);
  });

  it('skips an album whose play request is refused and plays the one after it', async () => {
    await onLastTrack([B, C]);
    await vi.advanceTimersByTimeAsync(TRACK_MS);
    web.respondOnce('PUT', '/me/player/play', {
      status: 403,
      body: { error: { status: 403, message: 'Player command failed: Restriction violated', reason: 'UNKNOWN' } },
    });
    sdkAutoplay(A);
    await settle();

    expect(controller.getSnapshot().notice?.message).toContain(B.name);
    expect(playsOf(C)).toHaveLength(1);
    expect(store.getState().current).toEqual(C);
    expect(store.getState().queue).toEqual([]);
  });

  it('does not treat a track change well before the end as the album ending', async () => {
    await onLastTrack([B]);
    await vi.advanceTimersByTimeAsync(TRACK_MS - GRACE_MS_LOCAL - 1_000);
    sdkTrack(A, 0);
    await settle();
    expect(playsOf(B)).toEqual([]);
    expect(store.getState().status).toBe('Playing');
  });
});

describe('other playback', () => {
  it('is PlayingElsewhere when a playlist starts on the phone mid-album, and the queue does not advance (AE7)', async () => {
    await start({ queue: [B] });
    await playingInTab(A, 2);
    await handOff(playlistOnPhone);

    expect(store.getState().status).toBe('PlayingElsewhere');
    expect(store.getState().current).toEqual(A);
    expect(store.getState().queue).toEqual([B]);

    await vi.advanceTimersByTimeAsync(10 * TRACK_MS);
    expect(store.getState().status).toBe('PlayingElsewhere');
    expect(playsOf(B)).toEqual([]);
  });

  it('is PlayingElsewhere when a playlist is sent to the tab mid-album', async () => {
    await start();
    await playingInTab(A, 2);
    emitState({ contextUri: 'spotify:playlist:p', trackUri: 'spotify:track:p1', albumUri: 'spotify:album:p' });
    await settle();
    expect(store.getState().status).toBe('PlayingElsewhere');
  });

  it('is PlayingElsewhere when the context matches but the track is from another album, outside the window', async () => {
    await start();
    await playingInTab(A, 2);
    sdkAutoplay(A);
    await settle();
    expect(store.getState().status).toBe('PlayingElsewhere');
  });

  it('brings the record back: activateElement first, then the saved album at the saved track on the SDK device', async () => {
    await start();
    await playingInTab(A, 2, 30_000);
    await handOff(playlistOnPhone);
    expect(store.getState().status).toBe('PlayingElsewhere');

    let commandsWhenActivated = -1;
    fake.player.activateElement.mockImplementation(async () => {
      commandsWhenActivated = web.commands().length;
    });
    const before = web.commands().length;
    await controller.bringItBack();

    expect(commandsWhenActivated).toBe(before);
    expect(web.commands().slice(before)).toEqual([
      { method: 'PUT', path: '/me/player/repeat', query: { state: 'off', device_id: 'vynl' }, body: undefined },
      {
        method: 'PUT',
        path: '/me/player/play',
        query: { device_id: 'vynl' },
        body: { context_uri: A.uri, offset: { uri: A.tracks[2].uri }, position_ms: 30_000 },
      },
    ]);

    sdkTrack(A, 2, { positionMs: 30_000 });
    await settle();
    expect(store.getState().status).toBe('Playing');
  });

  it('mirrors the same album on the phone, with progress from the poll (AE6)', async () => {
    await start();
    await playingInTab(A, 1);
    await handOff(phoneLive(A, 4, 60_000));

    expect(store.getState().status).toBe('Mirroring');
    expect(store.getState().position).toEqual({ trackIndex: 4, positionMs: 60_000 });
    expect(controller.getSnapshot().device).toEqual({ id: 'phone', name: 'Phone', isVynl: false });
    expect(controller.getSnapshot().progress).toBeCloseTo((4 * TRACK_MS + 60_000) / (10 * TRACK_MS));
  });

  it('polls straight away when the SDK state goes null', async () => {
    await start();
    await playingInTab(A, 1);
    const polls = web.polls();
    fake.player.emit('player_state_changed', null);
    await settle();
    expect(web.polls()).toBe(polls + 1);
  });
});

describe('remote devices', () => {
  it('sends the next album to the remote device at msRemaining − REMOTE_LEAD_MS (AE5)', async () => {
    await start({ current: A, queue: [B] }, phoneLive(A, 9, 0));
    expect(store.getState().status).toBe('Mirroring');

    await vi.advanceTimersByTimeAsync(TRACK_MS - REMOTE_LEAD_MS - 1);
    expect(playsOf(B)).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(playsOf(B)).toHaveLength(1);
    expect(playsOf(B)[0]).toMatchObject({ query: { device_id: 'phone' } });
    // The phone is the active device, so repeat-off may target it before the play request.
    const commands = web.commands();
    const playIndex = commands.findIndex(
      (c) => c.path === '/me/player/play' && (c.body as { context_uri?: string } | undefined)?.context_uri === B.uri,
    );
    expect(commands[playIndex - 1]).toMatchObject({ path: '/me/player/repeat', query: { device_id: 'phone' } });
    expect(store.getState().current).toEqual(B);

    web.setLive(phoneLive(B, 0, 0));
    await vi.advanceTimersByTimeAsync(POLL_MS_REMOTE_VISIBLE);
    expect(store.getState().status).toBe('Mirroring');
    expect(playsOf(B)).toHaveLength(1);
  });

  it('pauses and rests when the remote device loops back to track 1 with nothing queued', async () => {
    await start({ current: A }, phoneLive(A, 9, 0));
    await vi.advanceTimersByTimeAsync(TRACK_MS);
    web.setLive(phoneLive(A, 0, 0));
    await vi.advanceTimersByTimeAsync(POLL_MS_REMOTE_VISIBLE);
    await settle();

    expect(web.commands().at(-1)).toMatchObject({ path: '/me/player/pause', query: { device_id: 'phone' } });
    expect(store.getState().status).toBe('Resting');
  });

  it('never turns repeat off on an inactive remote device, and re-lists devices before sending the record', async () => {
    await start({ current: A, position: { trackIndex: 3, positionMs: 0 } });
    web.setDevices([{ id: 'speaker', name: 'Kitchen' }]);
    await controller.transferTo('speaker');

    const commands = web.commands();
    const playIndex = commands.findIndex((c) => c.path === '/me/player/play');
    expect(commands[playIndex]).toMatchObject({
      query: { device_id: 'speaker' },
      body: { context_uri: A.uri, offset: { uri: A.tracks[3].uri }, position_ms: 0 },
    });
    expect(commands.slice(0, playIndex).filter((c) => c.path === '/me/player/repeat')).toEqual([]);
    const devicesIndex = web.requests.findIndex((r) => r.url.pathname === '/v1/me/player/devices');
    const playRequestIndex = web.requests.findIndex((r) => r.url.pathname === '/v1/me/player/play');
    expect(devicesIndex).toBeGreaterThanOrEqual(0);
    expect(devicesIndex).toBeLessThan(playRequestIndex);
  });

  it('transfers a record that is playing in the tab', async () => {
    await start();
    await playingInTab(A, 2);
    web.setDevices([{ id: 'speaker', name: 'Kitchen' }]);
    const before = web.commands().length;
    await controller.transferTo('speaker');

    expect(web.commands().slice(before)).toEqual([
      { method: 'PUT', path: '/me/player', query: {}, body: { device_ids: ['speaker'], play: true } },
    ]);
  });

  it('shows a notice instead of sending the record to a device that has gone', async () => {
    await start({ current: A });
    web.setDevices([]);
    await controller.transferTo('speaker');
    expect(plays()).toEqual([]);
    expect(controller.getSnapshot().notice).not.toBeNull();
  });
});

describe('polling (KTD6)', () => {
  async function expectNextPollAfter(ms: number) {
    const polls = web.polls();
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(web.polls()).toBe(polls);
    await vi.advanceTimersByTimeAsync(1);
    expect(web.polls()).toBe(polls + 1);
  }

  it('polls every POLL_MS_IDLE while resting', async () => {
    await start();
    await expectNextPollAfter(POLL_MS_IDLE);
    await expectNextPollAfter(POLL_MS_IDLE);
  });

  it('polls every POLL_MS_SDK_VISIBLE while the tab plays', async () => {
    await start();
    await playingInTab(A, 0);
    await expectNextPollAfter(POLL_MS_SDK_VISIBLE);
    expect(store.getState().status).toBe('Playing');
  });

  it('polls every POLL_MS_REMOTE_VISIBLE, or POLL_MS_REMOTE_HIDDEN when hidden, while a remote device plays', async () => {
    await start({ current: A }, phoneLive(A, 0));
    await expectNextPollAfter(POLL_MS_REMOTE_VISIBLE);
    visibility.set(true);
    await expectNextPollAfter(POLL_MS_REMOTE_HIDDEN);
  });

  it('polls every POLL_MS_IDLE while playing elsewhere', async () => {
    await start();
    await playingInTab(A, 2);
    await handOff(playlistOnPhone);
    await expectNextPollAfter(POLL_MS_IDLE);
  });

  it('polls straight away after a worker tick gap', async () => {
    await start();
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS);
    const polls = web.polls();
    worker.suspend();
    await vi.advanceTimersByTimeAsync(WORKER_GAP_MS + WORKER_TICK_MS);
    worker.resume();
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS);
    await settle();
    expect(web.polls()).toBe(polls + 1);
  });
});

describe('subscribe', () => {
  it('notifies listeners of new snapshots and stops after dispose', async () => {
    await start();
    const listener = vi.fn();
    controller.subscribe(listener);
    await playingInTab(A, 0);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'Playing' }));

    controller.dispose();
    listener.mockClear();
    sdkTrack(A, 1);
    await settle();
    expect(listener).not.toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
  });
});

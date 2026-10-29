import * as spotifyApi from '../spotify/api';
import * as playerSdk from '../player/sdk';
import type { PlayerSignal, SpotifyPlayer, WebPlaybackState } from '../player/sdk';
import { AuthLostError, PremiumRequiredError, QuotaExceededError, SpotifyApiError } from '../spotify/errors';
import type { SpotifyPlaybackState } from '../spotify/types';
import type { Album, PlaybackStatus, Position, QueueAction, QueueState } from '../store/queue';
import { classify, createInstance, type AlbumInstance, type Observation } from './albumEnd';
import {
  GRACE_MS_LOCAL,
  GRACE_MS_REMOTE,
  POLL_MS_IDLE,
  POLL_MS_REMOTE_HIDDEN,
  POLL_MS_REMOTE_VISIBLE,
  POLL_MS_SDK_VISIBLE,
  REMOTE_LEAD_MS,
} from './constants';
import { transition, type MachineEvent } from './machine';
import { createPoller, type Poller } from './poller';
import { albumProgress, positionAt, remainingMs, type PositionAnchor } from './progress';
import { createScheduler, type Scheduler, type WorkerLike } from './scheduler';

/** The store the controller reads and writes. `getState` must already include its own dispatches. */
export interface PlaybackStore {
  getState(): QueueState;
  dispatch(action: QueueAction): void;
}

export type PlaybackApi = Pick<
  typeof spotifyApi,
  'getPlaybackState' | 'getDevices' | 'play' | 'pause' | 'transferPlayback' | 'setRepeatOff'
>;
export type PlaybackSdk = Pick<typeof playerSdk, 'load' | 'subscribe' | 'getDeviceId'>;

export interface Visibility {
  hidden(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface PlaybackDevice {
  id: string;
  name: string;
  isVynl: boolean;
}

export interface PlaybackNotice {
  id: number;
  message: string;
}

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  /** The device playing (or last playing) the record. */
  device: PlaybackDevice | null;
  notice: PlaybackNotice | null;
  /** 0–1 through the current album (KTD19). */
  progress: number;
}

export interface ControllerOptions {
  store: PlaybackStore;
  api?: PlaybackApi;
  sdk?: PlaybackSdk;
  createWorker?: () => WorkerLike;
  visibility?: Visibility;
  now?: () => number;
}

/**
 * Every action returns a promise that settles once its Spotify commands have been sent and
 * never rejects: failures become a status (AuthLost, PremiumRequired) or a notice.
 * Call actions straight from the click handler, because they unlock audio in the tab first.
 */
export interface PlaybackController {
  /** Loads the SDK, then reads `GET /me/player` once to pick the starting state (KTD17). */
  start(): void;
  /** Unlocks audio in the tab; call synchronously from a click before any awaited work. */
  activate(): void;
  /** Plays `album` from the start, dropping the current one (KTD14). */
  playAlbum(album: Album): Promise<void>;
  /** Drops the needle at the start of `trackIndex` of the current album. */
  moveNeedle(trackIndex: number): Promise<void>;
  playPause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  /** Takes over from other playback: the saved album at the saved position, in the tab (R21). */
  bringItBack(): Promise<void>;
  /** Sends the record to another Spotify Connect device. */
  transferTo(deviceId: string): Promise<void>;
  dismissNotice(): void;
  getSnapshot(): PlaybackSnapshot;
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void;
  dispose(): void;
}

const START: Position = { trackIndex: 0, positionMs: 0 };
const SOUNDING: ReadonlySet<PlaybackStatus> = new Set(['Playing', 'Mirroring', 'AlbumEnding']);
const WITH_RECORD: ReadonlySet<PlaybackStatus> = new Set(['Playing', 'Paused', 'Mirroring', 'AlbumEnding']);
/** How often the needle's interpolated position is written back to the store between observations. */
const POSITION_WRITE_MS = 5_000;
/** `previous` restarts the track when it is further in than this, as Spotify does. */
const RESTART_TRACK_MS = 3_000;

function documentVisibility(): Visibility {
  return {
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    subscribe(listener) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}

/** A play request Spotify refused for this album only (KTD18): skip it rather than stop. */
function refusedAlbum(error: unknown): boolean {
  return (
    error instanceof SpotifyApiError &&
    !(error instanceof PremiumRequiredError) &&
    (error.status === 403 || error.status === 404)
  );
}

export function createController({
  store,
  api = spotifyApi,
  sdk = playerSdk,
  createWorker,
  visibility = documentVisibility(),
  now = Date.now,
}: ControllerOptions): PlaybackController {
  const listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
  const cleanups: Array<() => void> = [];
  let snapshot: PlaybackSnapshot = { status: store.getState().status, device: null, notice: null, progress: 0 };
  let player: SpotifyPlayer | null = null;
  let sdkDeviceId: string | null = null;
  /** The tab was the active device at the last SDK state. */
  let sdkActive = false;
  let startedUp = false;
  let disposed = false;
  let instance: AlbumInstance | null = null;
  let instanceIds = 0;
  let device: PlaybackDevice | null = null;
  let activeDeviceId: string | null = null;
  let notice: PlaybackNotice | null = null;
  let noticeIds = 0;
  let anchor: PositionAnchor | null = null;
  let positionWrittenAt = 0;
  let commands: Promise<void> = Promise.resolve();
  let scheduler: Scheduler | null = null;

  const state = () => store.getState();

  const poller: Poller = createPoller({
    fetchState: () => api.getPlaybackState(),
    interval: pollInterval,
    onState: onPoll,
    onError: handleError,
    now,
  });

  function pollInterval(): number {
    if (!instance || instance.lost || !WITH_RECORD.has(state().status)) return POLL_MS_IDLE;
    if (instance.deviceId === null || instance.deviceId === sdkDeviceId) return POLL_MS_SDK_VISIBLE;
    return visibility.hidden() ? POLL_MS_REMOTE_HIDDEN : POLL_MS_REMOTE_VISIBLE;
  }

  function update() {
    if (disposed) return;
    const { status, current, position } = state();
    const next: PlaybackSnapshot = { status, device, notice, progress: albumProgress(current, position) };
    const changed =
      next.status !== snapshot.status ||
      next.device !== snapshot.device ||
      next.notice !== snapshot.notice ||
      next.progress !== snapshot.progress;
    if (!changed) return;
    const statusChanged = next.status !== snapshot.status;
    snapshot = next;
    if (statusChanged && startedUp) poller.refresh();
    for (const listener of listeners) listener(snapshot);
  }

  function apply(event: MachineEvent) {
    const status = state().status;
    const next = transition(status, event);
    if (next !== status) store.dispatch({ type: 'setStatus', status: next });
    scheduleRemoteAdvance();
    update();
  }

  function setPosition(position: Position, playing: boolean) {
    store.dispatch({ type: 'setPosition', position });
    anchor = { position, at: now(), playing };
    positionWrittenAt = now();
  }

  function showNotice(message: string) {
    notice = { id: ++noticeIds, message };
    update();
  }

  function setDevice(next: PlaybackDevice | null) {
    if (next?.id === device?.id && next?.name === device?.name) return;
    device = next;
  }

  function handleError(error: unknown) {
    if (disposed) return;
    if (error instanceof AuthLostError) apply({ type: 'failure', status: 'AuthLost' });
    else if (error instanceof PremiumRequiredError) apply({ type: 'failure', status: 'PremiumRequired' });
    else if (error instanceof QuotaExceededError) showNotice(error.message);
    else if (error instanceof SpotifyApiError) showNotice(`Spotify couldn't do that: ${error.message}`);
    else showNotice('Something went wrong talking to Spotify');
  }

  /** Runs Spotify commands one after another, in the order they were asked for. */
  function enqueue(command: () => Promise<void>): Promise<void> {
    const run = commands.then(async () => {
      if (disposed) return;
      try {
        await command();
      } catch (error) {
        handleError(error);
      }
    });
    commands = run;
    return run;
  }

  /** Unlocks audio in the tab. Must run synchronously inside the user's gesture. */
  function activate() {
    try {
      void Promise.resolve(player?.activateElement()).catch(() => {});
    } catch {
      // The SDK may not be ready yet; the play request is still worth sending.
    }
  }

  // ---- Commands ----

  async function turnRepeatOff(deviceId: string) {
    try {
      await api.setRepeatOff(deviceId);
    } catch (error) {
      if (error instanceof AuthLostError) throw error;
    }
  }

  /**
   * Starts `album` at `position` on `deviceId` as a new album instance. Repeat is turned off
   * first only where that can't move playback: the tab, or a remote device that's already
   * active (spike finding 3). An inactive remote device gets it once the play has landed.
   */
  async function startAlbum(album: Album, deviceId: string, position: Position) {
    const safeBeforePlay = deviceId === sdkDeviceId || deviceId === activeDeviceId;
    if (safeBeforePlay) await turnRepeatOff(deviceId);
    await playAt(album, deviceId, position);
    if (!safeBeforePlay) await turnRepeatOff(deviceId);
  }

  async function playAt(album: Album, deviceId: string, position: Position) {
    instance = createInstance(++instanceIds, album, deviceId, now());
    const track = album.tracks[position.trackIndex] ?? album.tracks[0];
    await api.play({ deviceId, contextUri: album.uri, offsetUri: track?.uri, positionMs: position.positionMs });
    scheduleRemoteAdvance();
  }

  /** Moves the queue on and plays the next album, skipping any Spotify refuses (KTD18). */
  async function startNext(deviceId: string) {
    for (;;) {
      const next = state().queue[0];
      store.dispatch({ type: 'advance' });
      anchor = null;
      if (!next) {
        instance = null;
        apply({ type: 'ended', hasNext: false });
        return;
      }
      update();
      try {
        await startAlbum(next, deviceId, START);
        return;
      } catch (error) {
        if (!refusedAlbum(error)) throw error;
        showNotice(`Spotify wouldn't play ${next.name}, so Vynl skipped it`);
      }
    }
  }

  function targetDevice(): string | null {
    if (instance && !instance.lost && instance.deviceId && WITH_RECORD.has(state().status)) return instance.deviceId;
    return sdkDeviceId ?? activeDeviceId;
  }

  function withDevice(command: (deviceId: string) => Promise<void>): Promise<void> {
    return enqueue(async () => {
      const deviceId = targetDevice();
      if (!deviceId) {
        showNotice('No Spotify player is available. Open Spotify on a device, or reload Vynl.');
        return;
      }
      await command(deviceId);
    });
  }

  function dropNeedle(position: Position): Promise<void> {
    const album = state().current;
    if (!album) return Promise.resolve();
    setPosition(position, true);
    update();
    const playing = instance && !instance.lost && WITH_RECORD.has(state().status);
    return withDevice((deviceId) => (playing ? playAt(album, deviceId, position) : startAlbum(album, deviceId, position)));
  }

  function skipToNextAlbum(): Promise<void> {
    if (state().queue.length === 0) return Promise.resolve();
    if (instance) instance.advanced = true;
    scheduler?.cancel();
    return withDevice((deviceId) => startNext(deviceId));
  }

  function currentPosition(): Position {
    const { current, position } = state();
    return current && anchor && SOUNDING.has(state().status) ? positionAt(current, anchor, now()) : position;
  }

  // ---- Observations ----

  function fromSdk(sdkState: WebPlaybackState): Observation {
    const track = sdkState.track_window.current_track as (WebPlaybackState['track_window']['current_track'] & {
      album?: { uri?: string };
    }) | null;
    return {
      deviceId: sdkDeviceId,
      deviceName: 'Vynl',
      isVynl: true,
      contextUri: sdkState.context?.uri ?? null,
      trackUri: track?.uri ?? null,
      trackAlbumUri: track?.album?.uri ?? null,
      paused: sdkState.paused,
      positionMs: sdkState.position,
      at: now(),
    };
  }

  function fromPoll(poll: SpotifyPlaybackState): Observation {
    const item = poll.item as { uri?: string; album?: { uri?: string } } | null;
    const deviceId = poll.device?.id ?? null;
    return {
      deviceId,
      deviceName: poll.device?.name ?? 'Spotify',
      isVynl: deviceId !== null && deviceId === sdkDeviceId,
      contextUri: poll.context?.uri ?? null,
      trackUri: item?.uri ?? null,
      trackAlbumUri: item?.album?.uri ?? null,
      paused: !poll.is_playing,
      positionMs: poll.progress_ms ?? 0,
      at: now(),
    };
  }

  function onAlbum(album: Album, obs: Observation): boolean {
    return obs.contextUri === album.uri && (obs.trackAlbumUri ?? album.uri) === album.uri;
  }

  function observe(obs: Observation) {
    if (obs.deviceId) activeDeviceId = obs.deviceId;
    const inst = instance;
    if (!inst) return;
    const grace = inst.deviceId === sdkDeviceId ? GRACE_MS_LOCAL : GRACE_MS_REMOTE;
    const verdict = classify(inst, obs, now(), grace);
    switch (verdict.kind) {
      case 'album':
        applyAlbum(inst, obs, verdict.trackIndex);
        break;
      case 'ended':
        albumEnded(inst, verdict.autoplayStarted);
        break;
      case 'elsewhere':
        inst.lost = true;
        setDevice({ id: obs.deviceId ?? '', name: obs.deviceName, isVynl: obs.isVynl });
        apply({ type: 'elsewhere' });
        break;
      case 'ignore':
        break;
    }
  }

  function applyAlbum(inst: AlbumInstance, obs: Observation, trackIndex: number) {
    inst.confirmed = true;
    inst.lost = false;
    inst.deviceId = obs.deviceId;
    setDevice(obs.deviceId ? { id: obs.deviceId, name: obs.deviceName, isVynl: obs.isVynl } : null);
    let ending = false;
    if (trackIndex >= 0) {
      const position = { trackIndex, positionMs: obs.positionMs };
      setPosition(position, !obs.paused);
      const remaining = remainingMs(inst.album, position);
      inst.expectedEndAt = obs.at + remaining;
      ending = trackIndex === inst.album.tracks.length - 1 && !obs.paused && remaining <= GRACE_MS_LOCAL;
    }
    apply({ type: 'album', remote: !obs.isVynl, paused: obs.paused, ending });
  }

  /** The KTD5 end signal: advance exactly once per album instance. */
  function albumEnded(inst: AlbumInstance, autoplayStarted: boolean) {
    if (inst.advanced) return;
    inst.advanced = true;
    scheduler?.cancel();
    const deviceId = inst.deviceId ?? sdkDeviceId;
    const hasNext = state().queue.length > 0;
    apply({ type: 'ended', hasNext });
    if (hasNext && deviceId) {
      void enqueue(() => startNext(deviceId));
      return;
    }
    store.dispatch({ type: 'advance' });
    instance = null;
    anchor = null;
    update();
    // AE3: Spotify has started something else after the album; stop it.
    if (autoplayStarted && deviceId) void enqueue(() => api.pause(deviceId));
  }

  /** AE5: a remote device gets the next album REMOTE_LEAD_MS before the current one ends. */
  function scheduleRemoteAdvance() {
    if (!scheduler) return;
    const due = remoteAdvanceDue();
    if (due === null) scheduler.cancel();
    else scheduler.scheduleAt(due);
  }

  function remoteAdvanceDue(): number | null {
    const inst = instance;
    if (!inst || !inst.confirmed || inst.advanced || inst.lost || inst.expectedEndAt === null) return null;
    if (!inst.deviceId || inst.deviceId === sdkDeviceId) return null;
    if (!SOUNDING.has(state().status) || state().queue.length === 0) return null;
    return inst.expectedEndAt - REMOTE_LEAD_MS;
  }

  function onRemoteDue() {
    const due = remoteAdvanceDue();
    if (due !== null && now() >= due && instance) albumEnded(instance, false);
  }

  function onPoll(poll: SpotifyPlaybackState | null) {
    if (!poll) {
      // The SDK reports for itself while the tab is the active device.
      if (sdkActive) return;
      if (instance?.confirmed && !instance.advanced && !instance.lost) apply({ type: 'stopped' });
      return;
    }
    observe(fromPoll(poll));
  }

  function onTick({ gap }: { gap: boolean }) {
    if (gap) void poller.pollNow();
    else poller.pollIfDue();
    onRemoteDue();
    const { current, status } = state();
    if (current && anchor?.playing && SOUNDING.has(status) && now() - positionWrittenAt >= POSITION_WRITE_MS) {
      store.dispatch({ type: 'setPosition', position: positionAt(current, anchor, now()) });
      positionWrittenAt = now();
      update();
    }
  }

  // ---- Start-up ----

  async function startup() {
    if (startedUp || disposed) return;
    startedUp = true;
    let poll: SpotifyPlaybackState | null = null;
    try {
      poll = await api.getPlaybackState();
    } catch (error) {
      if (error instanceof AuthLostError) handleError(error);
    }
    if (disposed) return;
    const { current } = state();
    const obs = poll ? fromPoll(poll) : null;
    if (obs?.deviceId) activeDeviceId = obs.deviceId;
    const live = current && obs && onAlbum(current, obs) && !obs.isVynl ? 'album-remote' : 'none';
    apply({ type: 'startup', live, hasSaved: current !== null });
    if (live === 'album-remote' && current && obs) {
      const inst = createInstance(++instanceIds, current, obs.deviceId, now());
      instance = inst;
      applyAlbum(inst, obs, current.tracks.findIndex((track) => track.uri === obs.trackUri));
    }
    poller.start();
    scheduleRemoteAdvance();
  }

  function onSignal(signal: PlayerSignal) {
    if (disposed) return;
    switch (signal.type) {
      case 'ready':
        sdkDeviceId = signal.deviceId;
        void startup();
        break;
      case 'not_ready':
        sdkActive = false;
        void poller.pollNow();
        break;
      case 'state':
        if (signal.state === null) {
          // Spike finding 4: the tab is no longer the active device; find out what is playing.
          sdkActive = false;
          if (startedUp) void poller.pollNow();
        } else {
          sdkActive = true;
          observe(fromSdk(signal.state));
        }
        break;
      case 'autoplay_failed':
        apply({ type: 'autoplayFailed' });
        showNotice('Your browser blocked playback. Press play to start the record.');
        break;
      case 'failure':
        apply({ type: 'failure', status: signal.status });
        if (signal.status === 'SdkUnavailable') void startup();
        break;
      case 'error':
        if (signal.kind === 'playback_error') showNotice(`Spotify couldn't play that: ${signal.message}`);
        break;
    }
  }

  return {
    start() {
      if (disposed || scheduler) return;
      scheduler = createScheduler({ createWorker, onTick, onDue: onRemoteDue, now });
      cleanups.push(sdk.subscribe(onSignal));
      cleanups.push(
        visibility.subscribe(() => {
          if (startedUp) poller.refresh();
        }),
      );
      sdk
        .load()
        .then((loaded) => {
          player = loaded;
          sdkDeviceId ??= sdk.getDeviceId();
        })
        .catch(() => {
          // A failure signal reports why.
        });
    },

    activate,

    playAlbum(album) {
      activate();
      store.dispatch({ type: 'playNow', album });
      if (instance) instance.advanced = true;
      setPosition(START, true);
      update();
      return withDevice((deviceId) => startAlbum(album, deviceId, START));
    },

    moveNeedle(trackIndex) {
      activate();
      return dropNeedle({ trackIndex, positionMs: 0 });
    },

    playPause() {
      activate();
      const { status, current, position } = state();
      if (status === 'PlayingElsewhere') return this.bringItBack();
      if (SOUNDING.has(status)) {
        return withDevice((deviceId) => api.pause(deviceId));
      }
      if (status === 'Paused' && instance && !instance.lost && instance.deviceId) {
        const deviceId = instance.deviceId;
        return enqueue(() => api.play({ deviceId }));
      }
      if (current && (status === 'Paused' || status === 'ReadyToResume' || status === 'SdkUnavailable')) {
        return withDevice((deviceId) => startAlbum(current, deviceId, position));
      }
      return Promise.resolve();
    },

    next() {
      activate();
      const { current } = state();
      if (!current) return Promise.resolve();
      const { trackIndex } = currentPosition();
      if (trackIndex >= current.tracks.length - 1) return skipToNextAlbum();
      return dropNeedle({ trackIndex: trackIndex + 1, positionMs: 0 });
    },

    previous() {
      activate();
      if (!state().current) return Promise.resolve();
      const { trackIndex, positionMs } = currentPosition();
      const target = positionMs > RESTART_TRACK_MS ? trackIndex : Math.max(0, trackIndex - 1);
      return dropNeedle({ trackIndex: target, positionMs: 0 });
    },

    bringItBack() {
      activate();
      const { current, position } = state();
      if (!current) return Promise.resolve();
      return enqueue(async () => {
        if (!sdkDeviceId) {
          showNotice('The Vynl player in this tab isn’t ready yet.');
          return;
        }
        await startAlbum(current, sdkDeviceId, position);
      });
    },

    transferTo(deviceId) {
      if (deviceId === sdkDeviceId) activate();
      return enqueue(async () => {
        const devices = await api.getDevices();
        const target = devices.find((d) => d.id === deviceId);
        if (deviceId !== sdkDeviceId && (!target || target.is_restricted)) {
          showNotice(target ? `${target.name} can't be controlled from Vynl` : 'That device is no longer available');
          return;
        }
        const { current, position, status } = state();
        if (instance && !instance.lost && WITH_RECORD.has(status)) {
          await api.transferPlayback(deviceId, { play: true });
          void poller.pollNow();
          return;
        }
        if (current) await startAlbum(current, deviceId, position);
      });
    },

    dismissNotice() {
      notice = null;
      update();
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      poller.stop();
      scheduler?.dispose();
      listeners.clear();
    },
  };
}

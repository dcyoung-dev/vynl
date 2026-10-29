import type { SpotifyPlaybackState } from '../spotify/types';
import { SpotifyApiError } from '../spotify/errors';

/**
 * The API client already waits out a `Retry-After` of up to 30s and retries once, so a
 * `429` that still reaches the poller means Spotify wants a longer break than that.
 */
export const RATE_LIMIT_BACKOFF_MS = 60_000;

export interface PollerOptions {
  fetchState: () => Promise<SpotifyPlaybackState | null>;
  /** The KTD6 interval for the current situation, read each time a poll is scheduled. */
  interval: () => number;
  onState: (state: SpotifyPlaybackState | null) => void;
  onError: (error: unknown) => void;
  now?: () => number;
}

export interface Poller {
  /** Schedules the first poll one interval from now. */
  start(): void;
  stop(): void;
  /** Polls straight away, sharing a poll that is already in flight. */
  pollNow(): Promise<void>;
  /** Re-times the next poll after the situation (and so the interval) changed. */
  refresh(): void;
  /** Polls if the next poll is overdue, for when a hidden tab's timers were throttled. */
  pollIfDue(): void;
}

/** Adaptive `GET /me/player` polling (KTD6). Polls never overlap. */
export function createPoller({ fetchState, interval, onState, onError, now = Date.now }: PollerOptions): Poller {
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let lastPollAt = 0;
  let backoffUntil = 0;

  function dueAt(): number {
    return Math.max(lastPollAt + interval(), backoffUntil);
  }

  function schedule() {
    clearTimeout(timer);
    if (!running || inFlight) return;
    timer = setTimeout(() => void pollNow(), Math.max(0, dueAt() - now()));
  }

  function pollNow(): Promise<void> {
    if (inFlight) return inFlight;
    clearTimeout(timer);
    inFlight = (async () => {
      try {
        const state = await fetchState();
        if (running) onState(state);
      } catch (error) {
        if (error instanceof SpotifyApiError && error.status === 429) backoffUntil = now() + RATE_LIMIT_BACKOFF_MS;
        if (running) onError(error);
      } finally {
        lastPollAt = now();
        inFlight = null;
        schedule();
      }
    })();
    return inFlight;
  }

  return {
    start() {
      running = true;
      lastPollAt = now();
      schedule();
    },
    stop() {
      running = false;
      clearTimeout(timer);
    },
    pollNow,
    refresh: schedule,
    pollIfDue() {
      if (running && !inFlight && now() >= dueAt()) void pollNow();
    },
  };
}

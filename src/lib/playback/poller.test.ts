import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '../auth/session';
import { getPlaybackState } from '../spotify/api';
import { stubFetch } from '../../test/fakes/fetch';
import { createPoller, RATE_LIMIT_BACKOFF_MS } from './poller';

vi.mock('../auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/session')>()),
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

const LIVE = { device: { id: 'phone' }, context: null, item: null, is_playing: true, progress_ms: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getAccessToken).mockResolvedValue('access-1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(interval: () => number, ...responses: Parameters<typeof stubFetch>) {
  const fake = stubFetch(...responses);
  const onState = vi.fn();
  const onError = vi.fn();
  const poller = createPoller({ fetchState: getPlaybackState, interval, onState, onError });
  return { fake, poller, onState, onError };
}

describe('createPoller', () => {
  it('polls on the current interval after start', async () => {
    const { fake, poller, onState } = setup(() => 5_000, { body: LIVE }, { status: 204 });
    poller.start();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(fake.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.requests).toHaveLength(1);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ device: { id: 'phone' } }));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fake.requests).toHaveLength(2);
    expect(onState).toHaveBeenLastCalledWith(null);
    poller.stop();
  });

  it('picks up a new interval when refreshed', async () => {
    let interval = 30_000;
    const { fake, poller } = setup(() => interval, { status: 204 });
    poller.start();
    await vi.advanceTimersByTimeAsync(10_000);

    interval = 5_000;
    poller.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.requests).toHaveLength(1);
    poller.stop();
  });

  it('polls now on request and coalesces overlapping requests', async () => {
    const { fake, poller } = setup(() => 30_000, { status: 204 });
    poller.start();
    void poller.pollNow();
    void poller.pollNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(fake.requests).toHaveLength(1);
    poller.stop();
  });

  it('polls when overdue, for timers a hidden tab throttled', async () => {
    let now = 0;
    vi.setSystemTime(0);
    const fake = stubFetch({ status: 204 });
    const poller = createPoller({
      fetchState: getPlaybackState,
      interval: () => 20_000,
      onState: () => {},
      onError: () => {},
      now: () => now,
    });
    poller.start();
    now = 19_000;
    poller.pollIfDue();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.requests).toHaveLength(0);
    now = 20_000;
    poller.pollIfDue();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.requests).toHaveLength(1);
    poller.stop();
  });

  it('stretches to Retry-After after a 429', async () => {
    const { fake, poller, onState } = setup(
      () => 5_000,
      { status: 429, headers: { 'Retry-After': '10' }, body: { error: { status: 429, message: 'slow down' } } },
      { status: 204 },
      { status: 204 },
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fake.requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fake.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.requests).toHaveLength(2);
    expect(onState).toHaveBeenCalledWith(null);

    // The next interval starts after the Retry-After wait, not from the original poll.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fake.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.requests).toHaveLength(3);
    poller.stop();
  });

  it('backs off when Spotify keeps rate limiting', async () => {
    const limited = { status: 429, headers: { 'Retry-After': '1' }, body: { error: { status: 429, message: 'slow' } } };
    const { fake, poller, onError } = setup(() => 5_000, limited, limited, { status: 204 });
    poller.start();
    await vi.advanceTimersByTimeAsync(5_000 + 1_000);
    expect(fake.requests).toHaveLength(2);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_BACKOFF_MS - 1);
    expect(fake.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.requests).toHaveLength(3);
    poller.stop();
  });

  it('stops polling when stopped', async () => {
    const { fake, poller } = setup(() => 5_000, { status: 204 });
    poller.start();
    poller.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.requests).toHaveLength(0);
  });
});

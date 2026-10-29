import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerRuntime, type WorkerMessage } from './scheduler.worker';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduler worker runtime', () => {
  it('posts a tick on every interval after start, until stopped', () => {
    const posted: WorkerMessage[] = [];
    const runtime = createWorkerRuntime((message) => posted.push(message));
    runtime.handle({ type: 'start', tickMs: 1_000 });

    vi.advanceTimersByTime(3_000);
    expect(posted).toEqual([
      { type: 'tick', at: 1_000 },
      { type: 'tick', at: 2_000 },
      { type: 'tick', at: 3_000 },
    ]);

    runtime.handle({ type: 'stop' });
    vi.advanceTimersByTime(3_000);
    expect(posted).toHaveLength(3);
  });

  it('posts due at the scheduled time, and only for the latest schedule', () => {
    const posted: WorkerMessage[] = [];
    const runtime = createWorkerRuntime((message) => posted.push(message));
    runtime.handle({ type: 'schedule', at: 5_000 });
    runtime.handle({ type: 'schedule', at: 7_000 });

    vi.advanceTimersByTime(6_999);
    expect(posted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(posted).toEqual([{ type: 'due', at: 7_000 }]);
  });

  it('cancels a schedule', () => {
    const posted: WorkerMessage[] = [];
    const runtime = createWorkerRuntime((message) => posted.push(message));
    runtime.handle({ type: 'schedule', at: 5_000 });
    runtime.handle({ type: 'cancel' });
    vi.advanceTimersByTime(10_000);
    expect(posted).toEqual([]);
  });
});

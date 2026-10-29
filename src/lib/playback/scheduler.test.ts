import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineSchedulerWorker } from '../../test/fakes/schedulerWorker';
import { WORKER_GAP_MS, WORKER_TICK_MS } from './constants';
import { createScheduler } from './scheduler';

let worker: InlineSchedulerWorker;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const onTick = vi.fn();
  const onDue = vi.fn();
  const scheduler = createScheduler({
    createWorker: () => (worker = new InlineSchedulerWorker()),
    onTick,
    onDue,
  });
  return { scheduler, onTick, onDue };
}

describe('createScheduler', () => {
  it('starts the worker ticking every WORKER_TICK_MS', () => {
    const { onTick } = setup();
    expect(worker.received).toContainEqual({ type: 'start', tickMs: WORKER_TICK_MS });
    vi.advanceTimersByTime(WORKER_TICK_MS * 2);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenLastCalledWith({ gap: false });
  });

  it('reports a gap when ticks stop arriving for longer than WORKER_GAP_MS', () => {
    const { onTick } = setup();
    vi.advanceTimersByTime(WORKER_TICK_MS);
    worker.suspend();
    vi.advanceTimersByTime(WORKER_GAP_MS + WORKER_TICK_MS);
    worker.resume();
    vi.advanceTimersByTime(WORKER_TICK_MS);
    expect(onTick).toHaveBeenLastCalledWith({ gap: true });
    vi.advanceTimersByTime(WORKER_TICK_MS);
    expect(onTick).toHaveBeenLastCalledWith({ gap: false });
  });

  it('calls onDue at the scheduled time', () => {
    const { scheduler, onDue } = setup();
    scheduler.scheduleAt(4_500);
    vi.advanceTimersByTime(4_499);
    expect(onDue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDue).toHaveBeenCalledTimes(1);
  });

  it('does not reschedule the same time twice, and cancels', () => {
    const { scheduler, onDue } = setup();
    scheduler.scheduleAt(4_500);
    scheduler.scheduleAt(4_500);
    expect(worker.received.filter((m) => m.type === 'schedule')).toHaveLength(1);
    scheduler.cancel();
    vi.advanceTimersByTime(10_000);
    expect(onDue).not.toHaveBeenCalled();
  });

  it('terminates the worker on dispose', () => {
    const { scheduler, onTick } = setup();
    scheduler.dispose();
    expect(worker.terminated).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(onTick).not.toHaveBeenCalled();
  });
});

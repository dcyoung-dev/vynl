import { WORKER_GAP_MS, WORKER_TICK_MS } from './constants';
import type { SchedulerCommand, WorkerMessage } from './scheduler.worker';

/** The part of `Worker` the scheduler uses, so tests can inject an inline fake. */
export interface WorkerLike {
  onmessage: ((event: { data: WorkerMessage }) => void) | null;
  postMessage(message: SchedulerCommand): void;
  terminate(): void;
}

export interface SchedulerOptions {
  createWorker?: () => WorkerLike;
  /** Every worker tick. `gap` means ticks stopped for longer than WORKER_GAP_MS: the tab was frozen. */
  onTick: (info: { gap: boolean }) => void;
  /** The time passed to `scheduleAt` has come. */
  onDue: () => void;
  now?: () => number;
}

export interface Scheduler {
  scheduleAt(at: number): void;
  cancel(): void;
  dispose(): void;
}

export function createSchedulerWorker(): WorkerLike {
  return new Worker(new URL('./scheduler.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/** Wraps the scheduler worker (KTD6): a 1s tick with gap detection, plus one scheduled time. */
export function createScheduler({
  createWorker = createSchedulerWorker,
  onTick,
  onDue,
  now = Date.now,
}: SchedulerOptions): Scheduler {
  const worker = createWorker();
  let lastTick = now();
  let scheduled: number | null = null;
  let disposed = false;

  worker.onmessage = ({ data }) => {
    if (disposed) return;
    if (data.type === 'tick') {
      const at = now();
      const gap = at - lastTick > WORKER_GAP_MS;
      lastTick = at;
      onTick({ gap });
    } else if (data.at === scheduled) {
      scheduled = null;
      onDue();
    }
  };
  worker.postMessage({ type: 'start', tickMs: WORKER_TICK_MS });

  return {
    scheduleAt(at) {
      if (disposed || at === scheduled) return;
      scheduled = at;
      worker.postMessage({ type: 'schedule', at });
    },
    cancel() {
      if (scheduled === null) return;
      scheduled = null;
      worker.postMessage({ type: 'cancel' });
    },
    dispose() {
      disposed = true;
      worker.terminate();
    },
  };
}

import type { SchedulerCommand, WorkerMessage } from '../../lib/playback/scheduler.worker';
import { createWorkerRuntime } from '../../lib/playback/scheduler.worker';
import type { WorkerLike } from '../../lib/playback/scheduler';

/**
 * Runs the real scheduler worker logic on the test's (fake) timers instead of a thread.
 * `suspend()` drops its messages, like a frozen tab, until `resume()`.
 */
export class InlineSchedulerWorker implements WorkerLike {
  onmessage: ((event: { data: WorkerMessage }) => void) | null = null;
  readonly received: SchedulerCommand[] = [];
  terminated = false;
  private suspended = false;
  private readonly runtime = createWorkerRuntime((message) => {
    if (!this.suspended && !this.terminated) this.onmessage?.({ data: message });
  });

  postMessage(message: SchedulerCommand): void {
    this.received.push(message);
    this.runtime.handle(message);
  }

  terminate(): void {
    this.terminated = true;
    this.runtime.handle({ type: 'stop' });
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }
}

/// <reference lib="webworker" />

/** Messages from the controller's scheduler to the worker. */
export type SchedulerCommand =
  | { type: 'start'; tickMs: number }
  | { type: 'schedule'; at: number }
  | { type: 'cancel' }
  | { type: 'stop' };

/** Messages from the worker. `at` is the worker's `Date.now()`. */
export type WorkerMessage = { type: 'tick'; at: number } | { type: 'due'; at: number };

/**
 * The worker's logic, kept separate from `self` so tests can run it inline.
 * A worker's timers escape most background-tab throttling (KTD6).
 */
export function createWorkerRuntime(post: (message: WorkerMessage) => void) {
  let ticker: ReturnType<typeof setInterval> | undefined;
  let due: ReturnType<typeof setTimeout> | undefined;

  return {
    handle(command: SchedulerCommand) {
      switch (command.type) {
        case 'start':
          clearInterval(ticker);
          ticker = setInterval(() => post({ type: 'tick', at: Date.now() }), command.tickMs);
          break;
        case 'schedule': {
          clearTimeout(due);
          const at = command.at;
          due = setTimeout(() => post({ type: 'due', at }), Math.max(0, at - Date.now()));
          break;
        }
        case 'cancel':
          clearTimeout(due);
          break;
        case 'stop':
          clearInterval(ticker);
          clearTimeout(due);
          break;
      }
    },
  };
}

declare const WorkerGlobalScope: { new (): unknown } | undefined;

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  const runtime = createWorkerRuntime((message) => scope.postMessage(message));
  scope.onmessage = (event: MessageEvent<SchedulerCommand>) => runtime.handle(event.data);
}

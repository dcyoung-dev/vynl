type LockCallback<T> = (lock: Lock | null) => T | Promise<T>;

interface Waiter {
  run: () => void;
}

interface Registry {
  held: Set<string>;
  queues: Map<string, Waiter[]>;
}

function createRegistry(): Registry {
  return { held: new Set(), queues: new Map() };
}

/**
 * An in-memory `navigator.locks` with exclusive locks and `ifAvailable`.
 * Managers that share a registry behave like tabs of the same origin.
 */
export function createFakeLockManager(registry: Registry = createRegistry()) {
  function release(name: string) {
    const next = registry.queues.get(name)?.shift();
    if (next) {
      next.run();
    } else {
      registry.held.delete(name);
    }
  }

  function request<T>(name: string, callback: LockCallback<T>): Promise<T>;
  function request<T>(name: string, options: LockOptions, callback: LockCallback<T>): Promise<T>;
  function request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockCallback<T>,
    maybeCallback?: LockCallback<T>,
  ): Promise<T> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback)!;

    if (options.ifAvailable && registry.held.has(name)) {
      return Promise.resolve().then(() => callback(null));
    }

    return new Promise<T>((resolve, reject) => {
      const run = () => {
        const lock = { name, mode: options.mode ?? 'exclusive' } as Lock;
        Promise.resolve()
          .then(() => callback(lock))
          .then(resolve, reject)
          .finally(() => release(name));
      };

      if (registry.held.has(name)) {
        const queue = registry.queues.get(name) ?? [];
        queue.push({ run });
        registry.queues.set(name, queue);
      } else {
        registry.held.add(name);
        run();
      }
    });
  }

  return { request } as Pick<LockManager, 'request'>;
}

createFakeLockManager.registry = createRegistry;

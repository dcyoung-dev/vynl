import { describe, expect, it } from 'vitest';
import { createFakeLockManager } from './locks';

describe('createFakeLockManager', () => {
  it('runs exclusive holders of the same lock one at a time', async () => {
    const locks = createFakeLockManager();
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = locks.request('a', () => {
      order.push('first:start');
      return new Promise<void>((resolve) => {
        releaseFirst = () => {
          order.push('first:end');
          resolve();
        };
      });
    });
    const second = locks.request('a', () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('passes null to an ifAvailable request while the lock is held', async () => {
    const locks = createFakeLockManager();
    let release!: () => void;
    void locks.request('leader', () => new Promise<void>((resolve) => (release = resolve)));

    const seen = await locks.request('leader', { ifAvailable: true }, (lock) => lock);
    expect(seen).toBeNull();
    release();
  });

  it('shares state between managers created from the same registry, like two tabs', async () => {
    const registry = createFakeLockManager.registry();
    const tabA = createFakeLockManager(registry);
    const tabB = createFakeLockManager(registry);
    let releaseA!: () => void;
    void tabA.request('leader', () => new Promise<void>((resolve) => (releaseA = resolve)));

    let bGotLock = false;
    const b = tabB.request('leader', () => {
      bGotLock = true;
    });
    await Promise.resolve();
    expect(bGotLock).toBe(false);
    releaseA();
    await b;
    expect(bGotLock).toBe(true);
  });
});

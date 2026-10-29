import { describe, expect, it } from 'vitest';
import { createFakeLockManager } from '../../test/fakes/locks';
import { claimLeadership, type LeaderRole } from './leader';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function tab(locks: Pick<LockManager, 'request'>) {
  const roles: LeaderRole[] = [];
  const release = claimLeadership((role) => roles.push(role), locks);
  return { roles, release };
}

describe('claimLeadership', () => {
  it('makes the only tab the leader', async () => {
    const first = tab(createFakeLockManager());
    await settle();

    expect(first.roles).toEqual(['leader']);
  });

  it('reports follower in a second tab, which leads once the first releases vynl-leader', async () => {
    const registry = createFakeLockManager.registry();
    const first = tab(createFakeLockManager(registry));
    await settle();
    const second = tab(createFakeLockManager(registry));
    await settle();

    expect(first.roles).toEqual(['leader']);
    expect(second.roles).toEqual(['follower']);

    first.release();
    await settle();

    expect(second.roles).toEqual(['follower', 'leader']);
  });

  it('a released follower does not become leader later', async () => {
    const registry = createFakeLockManager.registry();
    const first = tab(createFakeLockManager(registry));
    await settle();
    const stale = tab(createFakeLockManager(registry));
    await settle();
    stale.release();
    const second = tab(createFakeLockManager(registry));
    await settle();

    first.release();
    await settle();

    expect(stale.roles).toEqual(['follower']);
    expect(second.roles).toEqual(['follower', 'leader']);
  });
});

export type LeaderRole = 'leader' | 'follower';

const LOCK_NAME = 'vynl-leader';

/**
 * KTD8: only the tab holding `vynl-leader` controls playback. A follower waits in line
 * and becomes leader when the leading tab closes. Returns a function that gives up the
 * lock, or the place in line, for good.
 */
export function claimLeadership(
  onRole: (role: LeaderRole) => void,
  locks: Pick<LockManager, 'request'> = navigator.locks,
): () => void {
  let released = false;
  let releaseLock = () => {};
  const held = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  const lead = () => {
    // A released claim still in the queue must pass the lock straight on.
    if (released) return;
    onRole('leader');
    return held;
  };

  void locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
    if (lock) return lead();
    if (released) return;
    onRole('follower');
    void locks.request(LOCK_NAME, lead);
  });

  return () => {
    released = true;
    releaseLock();
  };
}

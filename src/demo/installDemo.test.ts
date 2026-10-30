import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { LAST_ACCOUNT_KEY } from '../lib/store/account';
import { loadState, saveState } from '../lib/store/persist';
import { DEMO_USER } from './catalogue';
import { uninstall } from './fakeSpotify';
import { installDemo } from './installDemo';

describe('installDemo', () => {
  beforeEach(() => localStorage.clear());
  afterEach(uninstall);

  it('seeds a loaded record and a queue for the demo account', () => {
    installDemo();
    const saved = loadState(DEMO_USER.id);
    expect(saved.current?.tracks.length).toBeGreaterThan(2);
    expect(saved.position.trackIndex).toBe(2);
    expect(saved.queue.length).toBeGreaterThan(0);
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe(DEMO_USER.id);
  });

  it('keeps the developer’s saved state on later installs', () => {
    installDemo();
    uninstall();
    saveState(DEMO_USER.id, { ...loadState(DEMO_USER.id), queue: [] });
    installDemo();
    expect(loadState(DEMO_USER.id).queue).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersister, loadState, saveState, storageKey, type SavedState } from './persist';
import { initialQueueState, queueReducer, type Album } from './queue';

function album(id: string): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: `Album ${id}`,
    artists: [`Artist ${id}`],
    imageUrl: null,
    tracks: [{ uri: `spotify:track:${id}-1`, name: 'One', durationMs: 180_000 }],
  };
}

const EMPTY: SavedState = { queue: [], current: null, position: { trackIndex: 0, positionMs: 0 } };

const saved: SavedState = {
  queue: [album('a'), album('b')],
  current: album('playing'),
  position: { trackIndex: 0, positionMs: 61_000 },
};

beforeEach(() => {
  localStorage.clear();
});

describe('loadState and saveState', () => {
  it('stores the state under vynl:v1:<account_id>', () => {
    saveState('alice', saved);

    expect(storageKey('alice')).toBe('vynl:v1:alice');
    expect(localStorage.getItem('vynl:v1:alice')).not.toBeNull();
  });

  it('round-trips the queue, current album and position', () => {
    saveState('alice', saved);

    expect(loadState('alice')).toEqual(saved);
  });

  it('keeps separate queues for two accounts', () => {
    saveState('alice', saved);
    saveState('bob', { ...EMPTY, queue: [album('z')] });

    expect(loadState('alice').queue.map((a) => a.id)).toEqual(['a', 'b']);
    expect(loadState('bob').queue.map((a) => a.id)).toEqual(['z']);
  });

  it('loads an empty state when nothing is stored', () => {
    expect(loadState('alice')).toEqual(EMPTY);
  });

  it('loads corrupt JSON as an empty state without throwing', () => {
    localStorage.setItem('vynl:v1:alice', '{"version":1,"queue":[');

    expect(loadState('alice')).toEqual(EMPTY);
  });

  it('resets a stored state with a different schema version', () => {
    localStorage.setItem(
      'vynl:v1:alice',
      JSON.stringify({ version: 2, queue: [album('a')], current: null, position: EMPTY.position }),
    );

    expect(loadState('alice')).toEqual(EMPTY);
  });
});

describe('createPersister', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the latest state once after a short debounce', () => {
    const persister = createPersister('alice');

    persister.schedule({ ...EMPTY, queue: [album('a')] });
    persister.schedule(saved);
    expect(localStorage.getItem('vynl:v1:alice')).toBeNull();

    vi.advanceTimersByTime(1_000);
    expect(loadState('alice')).toEqual(saved);
    persister.dispose();
  });

  it('writes a pending state immediately on pagehide', () => {
    const persister = createPersister('alice');

    persister.schedule(saved);
    window.dispatchEvent(new Event('pagehide'));

    expect(loadState('alice')).toEqual(saved);
    persister.dispose();
  });

  it('keeps working when storage rejects a write', () => {
    const persister = createPersister('alice');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    persister.schedule(saved);
    expect(() => persister.dispose()).not.toThrow();
    spy.mockRestore();
  });

  it('fills in a missing position from an older record', () => {
    localStorage.setItem(storageKey('alice'), JSON.stringify({ version: 1, queue: [], current: null }));

    expect(loadState('alice').position).toEqual({ trackIndex: 0, positionMs: 0 });
  });

  it('reloads an installed selection under the account and leaves other accounts alone', () => {
    saveState('bob', saved);
    const selected = queueReducer(
      { ...initialQueueState(), ...saved },
      { type: 'replaceSelection', albums: [album('a'), album('b'), album('c')] },
    );

    saveState('alice', selected);

    expect(loadState('alice')).toEqual({
      current: album('a'),
      queue: [album('b'), album('c')],
      position: { trackIndex: 0, positionMs: 0 },
    });
    expect(loadState('bob')).toEqual(saved);
  });
});

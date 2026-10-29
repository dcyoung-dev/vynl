import { describe, expect, it } from 'vitest';
import { type Album, type QueueState, initialQueueState, queueReducer } from './queue';

function album(id: string): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: `Album ${id}`,
    artists: [`Artist ${id}`],
    imageUrl: `https://i.scdn.co/image/${id}`,
    tracks: [
      { uri: `spotify:track:${id}-1`, name: 'One', durationMs: 180_000 },
      { uri: `spotify:track:${id}-2`, name: 'Two', durationMs: 200_000 },
    ],
  };
}

function stateWith(overrides: Partial<QueueState>): QueueState {
  return { ...initialQueueState(), ...overrides };
}

const ids = (state: QueueState) => state.queue.map((a) => a.id);

describe('queueReducer', () => {
  it('add appends to the end of the queue', () => {
    const state = stateWith({ queue: [album('a'), album('b')] });

    const next = queueReducer(state, { type: 'add', album: album('c') });

    expect(ids(next)).toEqual(['a', 'b', 'c']);
  });

  it('playNow with a record on replaces the current album and does not re-queue it', () => {
    const state = stateWith({
      current: album('playing'),
      position: { trackIndex: 1, positionMs: 42_000 },
      queue: [album('a')],
    });

    const next = queueReducer(state, { type: 'playNow', album: album('new') });

    expect(next.current?.id).toBe('new');
    expect(ids(next)).toEqual(['a']);
    expect(next.position).toEqual({ trackIndex: 0, positionMs: 0 });
  });

  it('remove drops the item at the given index', () => {
    const state = stateWith({ queue: [album('a'), album('b'), album('c')] });

    const next = queueReducer(state, { type: 'remove', index: 1 });

    expect(ids(next)).toEqual(['a', 'c']);
  });

  it('moveUp and moveDown swap an item with its neighbour', () => {
    const state = stateWith({ queue: [album('a'), album('b'), album('c')] });

    expect(ids(queueReducer(state, { type: 'moveUp', index: 2 }))).toEqual(['a', 'c', 'b']);
    expect(ids(queueReducer(state, { type: 'moveDown', index: 0 }))).toEqual(['b', 'a', 'c']);
  });

  it('moveUp on the first item and moveDown on the last do nothing', () => {
    const state = stateWith({ queue: [album('a'), album('b'), album('c')] });

    expect(ids(queueReducer(state, { type: 'moveUp', index: 0 }))).toEqual(['a', 'b', 'c']);
    expect(ids(queueReducer(state, { type: 'moveDown', index: 2 }))).toEqual(['a', 'b', 'c']);
  });

  it('advance with items moves the first one to current from its first track', () => {
    const state = stateWith({
      current: album('playing'),
      position: { trackIndex: 1, positionMs: 199_000 },
      queue: [album('a'), album('b')],
    });

    const next = queueReducer(state, { type: 'advance' });

    expect(next.current?.id).toBe('a');
    expect(ids(next)).toEqual(['b']);
    expect(next.position).toEqual({ trackIndex: 0, positionMs: 0 });
  });

  it('advance with an empty queue clears current', () => {
    const state = stateWith({ current: album('playing'), queue: [] });

    const next = queueReducer(state, { type: 'advance' });

    expect(next.current).toBeNull();
    expect(next.queue).toEqual([]);
  });

  it('setPosition records the track and position within the current album', () => {
    const state = stateWith({ current: album('playing') });

    const next = queueReducer(state, {
      type: 'setPosition',
      position: { trackIndex: 1, positionMs: 30_000 },
    });

    expect(next.position).toEqual({ trackIndex: 1, positionMs: 30_000 });
  });

  it('setStatus records the playback status', () => {
    const next = queueReducer(initialQueueState(), { type: 'setStatus', status: 'Playing' });

    expect(next.status).toBe('Playing');
  });
});

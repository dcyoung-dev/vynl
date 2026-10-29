import { describe, expect, it } from 'vitest';
import { albumProgress as tonearmProgress } from '../../components/turntable/Tonearm';
import type { Album } from '../store/queue';
import { albumProgress, positionAt, remainingMs } from './progress';

const MIN = 60_000;

function album(count: number, durationMs: number): Album {
  return {
    id: 'a',
    uri: 'spotify:album:a',
    name: 'A',
    artists: ['Artist'],
    imageUrl: null,
    tracks: Array.from({ length: count }, (_, i) => ({ uri: `spotify:track:a${i + 1}`, name: `T${i + 1}`, durationMs })),
  };
}

describe('albumProgress', () => {
  it('is 0.2 at the start of track 3 of 10 three-minute tracks', () => {
    expect(albumProgress(album(10, 3 * MIN), { trackIndex: 2, positionMs: 0 })).toBe(0.2);
  });

  it('matches the tonearm formula', () => {
    const a = album(7, 200_000);
    for (const position of [
      { trackIndex: 0, positionMs: 0 },
      { trackIndex: 3, positionMs: 12_345 },
      { trackIndex: 6, positionMs: 200_000 },
    ]) {
      expect(albumProgress(a, position)).toBe(tonearmProgress(a, position));
    }
    expect(albumProgress(null, { trackIndex: 0, positionMs: 0 })).toBe(0);
  });
});

describe('remainingMs', () => {
  it('is the rest of the current track plus every later track', () => {
    expect(remainingMs(album(10, 3 * MIN), { trackIndex: 8, positionMs: MIN })).toBe(5 * MIN);
  });
});

describe('positionAt', () => {
  const a = album(3, MIN);

  it('moves forward while playing and rolls into the next track', () => {
    const anchor = { position: { trackIndex: 0, positionMs: 50_000 }, at: 1_000, playing: true };
    expect(positionAt(a, anchor, 1_000 + 5_000)).toEqual({ trackIndex: 0, positionMs: 55_000 });
    expect(positionAt(a, anchor, 1_000 + 15_000)).toEqual({ trackIndex: 1, positionMs: 5_000 });
  });

  it('stays put while paused', () => {
    const anchor = { position: { trackIndex: 1, positionMs: 10_000 }, at: 0, playing: false };
    expect(positionAt(a, anchor, 99_000)).toEqual({ trackIndex: 1, positionMs: 10_000 });
  });

  it('stops at the end of the album', () => {
    const anchor = { position: { trackIndex: 2, positionMs: 59_000 }, at: 0, playing: true };
    expect(positionAt(a, anchor, 30_000)).toEqual({ trackIndex: 2, positionMs: MIN });
  });
});

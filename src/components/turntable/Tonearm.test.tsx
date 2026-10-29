import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Album, PlaybackStatus } from '../../lib/store/queue';
import Tonearm, { albumProgress } from './Tonearm';

const album: Album = {
  id: 'a1',
  uri: 'spotify:album:a1',
  name: 'Four Tracks',
  artists: ['Band'],
  imageUrl: null,
  tracks: [
    { uri: 't1', name: 'One', durationMs: 100_000 },
    { uri: 't2', name: 'Two', durationMs: 200_000 },
    { uri: 't3', name: 'Three', durationMs: 300_000 },
    { uri: 't4', name: 'Four', durationMs: 400_000 },
  ],
};

describe('Tonearm', () => {
  it('sets --tonearm-progress from the progress prop', () => {
    render(<Tonearm status="Playing" progress={0.5} />);
    const arm = screen.getByTestId('tonearm');
    expect(arm.style.getPropertyValue('--tonearm-progress')).toBe('0.5');
    expect(arm).not.toHaveAttribute('data-resting');
  });

  it('follows progress as it changes', () => {
    const { rerender } = render(<Tonearm status="Playing" progress={0.1} />);
    rerender(<Tonearm status="Playing" progress={0.8} />);
    expect(screen.getByTestId('tonearm').style.getPropertyValue('--tonearm-progress')).toBe('0.8');
  });

  it('lifts back to its rest angle when Resting (AE3)', () => {
    render(<Tonearm status="Resting" progress={1} />);
    expect(screen.getByTestId('tonearm')).toHaveAttribute('data-resting');
  });

  it.each<PlaybackStatus>(['Playing', 'Paused', 'AlbumEnding', 'Mirroring', 'ReadyToResume', 'PlayingElsewhere'])(
    'stays on the record while %s',
    (status) => {
      render(<Tonearm status={status} progress={0.3} />);
      expect(screen.getByTestId('tonearm')).not.toHaveAttribute('data-resting');
    },
  );

  it.each<PlaybackStatus>(['SignedOut', 'Starting', 'Follower'])('rests off the record while %s', (status) => {
    render(<Tonearm status={status} progress={0.3} />);
    expect(screen.getByTestId('tonearm')).toHaveAttribute('data-resting');
  });
});

describe('albumProgress', () => {
  it('is earlier track durations plus the position, over the album total', () => {
    // (100 + 200 + 150) / 1000
    expect(albumProgress(album, { trackIndex: 2, positionMs: 150_000 })).toBe(0.45);
  });

  it('is 0 at the start and without an album', () => {
    expect(albumProgress(album, { trackIndex: 0, positionMs: 0 })).toBe(0);
    expect(albumProgress(null, { trackIndex: 3, positionMs: 10 })).toBe(0);
    expect(albumProgress({ ...album, tracks: [] }, { trackIndex: 0, positionMs: 0 })).toBe(0);
  });

  it('never leaves the 0 to 1 range', () => {
    expect(albumProgress(album, { trackIndex: 3, positionMs: 999_999 })).toBe(1);
    expect(albumProgress(album, { trackIndex: 0, positionMs: -5 })).toBe(0);
  });
});

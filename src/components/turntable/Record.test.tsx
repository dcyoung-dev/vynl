import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Album, PlaybackStatus } from '../../lib/store/queue';
import Record from './Record';

const album: Album = {
  id: 'a1',
  uri: 'spotify:album:a1',
  name: 'Kind of Blue',
  artists: ['Miles Davis', 'John Coltrane'],
  imageUrl: 'https://i.scdn.co/image/kob',
  tracks: [{ uri: 'spotify:track:t1', name: 'So What', durationMs: 545_000 }],
};

describe('Record', () => {
  it.each<PlaybackStatus>(['Playing', 'Mirroring', 'AlbumEnding'])('spins while %s', (status) => {
    render(<Record album={album} status={status} />);
    const spinner = screen.getByTestId('record-spinner');
    expect(spinner).toHaveClass('animate-spin-record');
    expect(spinner).not.toHaveClass('animate-paused');
    expect(screen.getByTestId('record-wobble')).toHaveClass('animate-record-wobble');
  });

  it('keeps the spin animation but pauses it while Paused, so the record stops where it is', () => {
    render(<Record album={album} status="Paused" />);
    expect(screen.getByTestId('record-spinner')).toHaveClass('animate-spin-record', 'animate-paused');
    expect(screen.getByTestId('record-wobble')).toHaveClass('animate-record-wobble', 'animate-paused');
  });

  it.each<PlaybackStatus>(['Resting', 'ReadyToResume', 'PlayingElsewhere', 'SignedOut', 'Starting'])(
    'does not spin while %s',
    (status) => {
      render(<Record album={album} status={status} />);
      expect(screen.getByTestId('record-spinner')).not.toHaveClass('animate-spin-record');
      expect(screen.getByTestId('record-wobble')).not.toHaveClass('animate-record-wobble');
    },
  );

  it('removes the wobble and slows the spin when the listener prefers reduced motion', () => {
    render(<Record album={album} status="Playing" />);
    expect(screen.getByTestId('record-spinner')).toHaveClass('motion-reduce:animate-spin-record-slow');
    expect(screen.getByTestId('record-wobble')).toHaveClass('motion-reduce:animate-none');
  });

  it('prints the album and artist names on the label as text, and draws no image', () => {
    const { container } = render(<Record album={album} status="Playing" />);
    const label = screen.getByTestId('record-label');
    expect(label).toHaveTextContent('Kind of Blue');
    expect(label).toHaveTextContent('Miles Davis, John Coltrane');
    expect(label).toHaveClass('fill-vanilla-custard');
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows a blank label when no record is on', () => {
    render(<Record album={null} status="Resting" />);
    expect(screen.getByTestId('record-label')).toHaveTextContent('');
  });
});

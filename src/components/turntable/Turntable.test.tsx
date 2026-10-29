import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Album, PlaybackStatus, Position } from '../../lib/store/queue';
import Turntable, { type TurntableProps } from './Turntable';

const album: Album = {
  id: 'a1',
  uri: 'spotify:album:a1',
  name: 'Ten Songs',
  artists: ['The Band'],
  imageUrl: 'https://i.scdn.co/image/ten',
  tracks: Array.from({ length: 10 }, (_, i) => ({
    uri: `spotify:track:t${i + 1}`,
    name: `Song ${i + 1}`,
    durationMs: 100_000,
  })),
};

function setup(overrides: Partial<TurntableProps> = {}) {
  const props: TurntableProps = {
    album,
    position: { trackIndex: 2, positionMs: 50_000 },
    status: 'Playing',
    signedIn: true,
    isFollower: false,
    onMoveNeedle: vi.fn(),
    onPlayPause: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    ...overrides,
  };
  const utils = render(<Turntable {...props} />);
  return { props, ...utils };
}

describe('Turntable', () => {
  it('shows the cover above the spinning record, with the tonearm at the album progress', () => {
    setup();
    const cover = screen.getByRole('img', { name: 'Ten Songs by The Band' });
    const record = screen.getByTestId('record');
    expect(cover.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('record-spinner')).toHaveClass('animate-spin-record');
    // (2 tracks x 100s + 50s) / 1000s
    expect(screen.getByTestId('tonearm').style.getPropertyValue('--tonearm-progress')).toBe('0.25');
    expect(screen.getByText('Song 3', { selector: '[data-testid="now-playing"] *' })).toBeInTheDocument();
  });

  it('moves the needle to track 8 from the track list, and the arm jumps when the position follows (AE2)', () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Song 8/ }));
    expect(props.onMoveNeedle).toHaveBeenCalledWith(7);
    const moved: Position = { trackIndex: 7, positionMs: 0 };
    rerender(<Turntable {...props} position={moved} />);
    expect(screen.getByTestId('tonearm').style.getPropertyValue('--tonearm-progress')).toBe('0.7');
  });

  it('stops the record and rests the arm when the queue runs out (AE3)', () => {
    const { props, rerender } = setup({ status: 'AlbumEnding' });
    rerender(<Turntable {...props} status={'Resting' satisfies PlaybackStatus} />);
    expect(screen.getByTestId('record-spinner')).not.toHaveClass('animate-spin-record');
    expect(screen.getByTestId('tonearm')).toHaveAttribute('data-resting');
  });

  it('disables the controls and track list while signed out', () => {
    setup({ signedIn: false, status: 'SignedOut' });
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('renders no controls in a follower tab (KTD8)', () => {
    setup({ isFollower: true, status: 'Follower' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Song 8')).toBeInTheDocument();
  });

  it('shows an empty record with the arm at rest when nothing is on', () => {
    setup({ album: null, status: 'Resting', position: { trackIndex: 0, positionMs: 0 } });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('record')).toBeInTheDocument();
    expect(screen.getByTestId('tonearm')).toHaveAttribute('data-resting');
    expect(screen.queryByRole('list')).toBeNull();
  });
});

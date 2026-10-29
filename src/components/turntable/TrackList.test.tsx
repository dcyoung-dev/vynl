import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '../../lib/store/queue';
import TrackList from './TrackList';

const tracks: Track[] = Array.from({ length: 10 }, (_, i) => ({
  uri: `spotify:track:t${i + 1}`,
  name: `Song ${i + 1}`,
  durationMs: 180_000 + i * 1_000,
}));

describe('TrackList', () => {
  it('moves the needle to track 8 when it is clicked (AE2)', () => {
    const onMoveNeedle = vi.fn();
    render(<TrackList tracks={tracks} currentIndex={2} onMoveNeedle={onMoveNeedle} />);
    fireEvent.click(screen.getByRole('button', { name: /Song 8/ }));
    expect(onMoveNeedle).toHaveBeenCalledTimes(1);
    expect(onMoveNeedle).toHaveBeenCalledWith(7);
  });

  it('lists every track in order with its number and duration, marking the current one', () => {
    render(<TrackList tracks={tracks} currentIndex={2} onMoveNeedle={() => {}} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('Song 1');
    expect(items[0]).toHaveTextContent('3:00');
    expect(within(items[2]).getByRole('button')).toHaveAttribute('aria-current', 'true');
    expect(within(items[0]).getByRole('button')).not.toHaveAttribute('aria-current');
  });

  it('disables the track buttons when asked', () => {
    const onMoveNeedle = vi.fn();
    render(<TrackList tracks={tracks} currentIndex={0} onMoveNeedle={onMoveNeedle} disabled />);
    const button = screen.getByRole('button', { name: /Song 8/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onMoveNeedle).not.toHaveBeenCalled();
  });

  it('is a plain list with no buttons when the needle cannot be moved', () => {
    render(<TrackList tracks={tracks} currentIndex={0} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });
});

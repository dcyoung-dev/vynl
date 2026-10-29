import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlaybackStatus } from '../../lib/store/queue';
import Controls from './Controls';

function setup(status: PlaybackStatus, signedIn = true) {
  const handlers = { onPlayPause: vi.fn(), onNext: vi.fn(), onPrevious: vi.fn() };
  render(<Controls status={status} signedIn={signedIn} {...handlers} />);
  return handlers;
}

describe('Controls', () => {
  it('is disabled while signed out', () => {
    const handlers = setup('SignedOut', false);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(handlers.onPlayPause).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onPrevious).not.toHaveBeenCalled();
  });

  it.each<PlaybackStatus>(['Playing', 'Mirroring', 'AlbumEnding'])('offers Pause while %s', (status) => {
    const handlers = setup(status);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it.each<PlaybackStatus>(['Paused', 'ReadyToResume', 'Resting'])('offers Play while %s', (status) => {
    const handlers = setup(status);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('skips to the previous and next track', () => {
    const handlers = setup('Playing');
    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(handlers.onPrevious).toHaveBeenCalledTimes(1);
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
  });
});

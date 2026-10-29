import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlaybackStatus } from '../../lib/store/queue';
import StatusBanner, { type StatusBannerProps } from './StatusBanner';

function setup(status: PlaybackStatus, props: Partial<StatusBannerProps> = {}) {
  const handlers = {
    onPlayHere: vi.fn(),
    onBringItBack: vi.fn(),
    onSignInAgain: vi.fn(),
    onDismissNotice: vi.fn(),
  };
  render(<StatusBanner status={status} deviceName={null} notice={null} {...handlers} {...props} />);
  return handlers;
}

describe('StatusBanner', () => {
  it('says Connecting to Spotify… while starting', () => {
    setup('Starting');
    expect(screen.getByText('Connecting to Spotify…')).toBeInTheDocument();
  });

  it('shows the device and a Play here button while mirroring', () => {
    const { onPlayHere } = setup('Mirroring', { deviceName: 'Kitchen speaker' });
    expect(screen.getByText('Playing on Kitchen speaker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play here' }));
    expect(onPlayHere).toHaveBeenCalledTimes(1);
  });

  it('shows Playing elsewhere with Bring it back (AE7)', () => {
    const { onBringItBack } = setup('PlayingElsewhere');
    expect(screen.getByText(/Playing elsewhere/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bring it back' }));
    expect(onBringItBack).toHaveBeenCalledTimes(1);
  });

  it('asks to sign in again after the sign-in is lost', () => {
    const { onSignInAgain } = setup('AuthLost');
    expect(screen.getByText(/queue is still here/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(onSignInAgain).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['NotAllowlisted', /allowlist/i],
    ['PremiumRequired', /Premium/],
    ['SdkUnavailable', /ad blocker/i],
    ['Follower', /Vynl is open in another tab/],
  ] as const)('shows its own message for %s', (status, message) => {
    setup(status);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('has no banner when nothing needs saying', () => {
    setup('Playing');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a dismissable notice', () => {
    const { onDismissNotice } = setup('Playing', { notice: { id: 1, message: 'Skipped Blue' } });
    expect(screen.getByText('Skipped Blue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });
});

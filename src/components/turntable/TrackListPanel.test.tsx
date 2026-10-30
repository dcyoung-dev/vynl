import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '../../lib/store/queue';
import TrackListPanel from './TrackListPanel';

const tracks: Track[] = [
  { uri: 'spotify:track:one', name: 'First track', durationMs: 180_000 },
  { uri: 'spotify:track:two', name: 'Second track', durationMs: 210_000 },
];

describe('TrackListPanel', () => {
  it('keeps the desktop rail available while the mobile drawer starts closed', () => {
    render(<TrackListPanel tracks={tracks} currentIndex={0} />);

    expect(screen.getByRole('complementary', { name: 'Album tracks' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Track list drawer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tracks' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Tracks' })).toHaveClass('self-start', 'lg:hidden');
    expect(screen.getByRole('complementary', { name: 'Album tracks' })).toHaveClass('hidden', 'lg:block');
    expect(screen.getByRole('complementary', { name: 'Album tracks' }).className).not.toMatch(/\bmd:/);
  });

  it('opens the mobile drawer with the same ordered tracks and closes with Escape', () => {
    render(<TrackListPanel tracks={tracks} currentIndex={1} onMoveNeedle={() => {}} />);

    const opener = screen.getByRole('button', { name: 'Tracks' });
    fireEvent.click(opener);

    const drawer = screen.getByRole('complementary', { name: 'Track list drawer' });
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    expect(within(drawer).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('First track'),
      expect.stringContaining('Second track'),
    ]);
    expect(within(drawer).getByRole('button', { name: /Second track/ })).toHaveAttribute('aria-current', 'true');

    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Track list drawer' })).not.toBeInTheDocument();
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    expect(opener).toHaveFocus();
  });

  it('shows a backdrop only while the drawer is open, and clicking it closes and refocuses the opener', () => {
    render(<TrackListPanel tracks={tracks} currentIndex={0} />);
    expect(screen.queryByTestId('tracks-backdrop')).not.toBeInTheDocument();

    const opener = screen.getByRole('button', { name: 'Tracks' });
    fireEvent.click(opener);
    const backdrop = screen.getByTestId('tracks-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveClass('lg:hidden');

    fireEvent.click(backdrop);
    expect(screen.queryByRole('complementary', { name: 'Track list drawer' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tracks-backdrop')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('moves the needle when a track is selected without changing drawer state', () => {
    const onMoveNeedle = vi.fn();
    render(<TrackListPanel tracks={tracks} currentIndex={0} onMoveNeedle={onMoveNeedle} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Track list drawer' })).getByRole('button', { name: /Second track/ }));

    expect(onMoveNeedle).toHaveBeenCalledWith(1);
    expect(screen.getByRole('complementary', { name: 'Track list drawer' })).toBeInTheDocument();
  });

  it('closes from the close control and keeps read-only rows non-interactive', () => {
    render(<TrackListPanel tracks={tracks} currentIndex={0} disabled />);

    const opener = screen.getByRole('button', { name: 'Tracks' });
    fireEvent.click(opener);
    const drawer = screen.getByRole('complementary', { name: 'Track list drawer' });
    expect(within(drawer).queryByRole('button', { name: /First track/ })).not.toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close tracks' }));
    expect(screen.queryByRole('complementary', { name: 'Track list drawer' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('omits the panel and opener when there are no tracks', () => {
    render(<TrackListPanel tracks={[]} currentIndex={0} />);

    expect(screen.queryByRole('button', { name: 'Tracks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Album tracks' })).not.toBeInTheDocument();
  });
});

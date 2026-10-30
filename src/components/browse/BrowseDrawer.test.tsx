import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlbum, getSavedAlbums, type AlbumSummary } from '../../lib/spotify/api';
import { AppStateProvider } from '../../lib/store/AppState';
import { saveState } from '../../lib/store/persist';
import type { Album } from '../../lib/store/queue';
import BrowseDrawer, { useBrowseDrawer } from './BrowseDrawer';

vi.mock('../../lib/spotify/api', () => ({
  getAlbum: vi.fn(),
  getSavedAlbums: vi.fn(),
  searchAlbums: vi.fn(),
}));

const summary: AlbumSummary = {
  id: 'abc',
  uri: 'spotify:album:abc',
  name: 'Blue',
  artists: ['Joni Mitchell'],
  imageUrl: null,
  totalTracks: 1,
};

const full: Album = {
  id: 'abc',
  uri: 'spotify:album:abc',
  name: 'Blue',
  artists: ['Joni Mitchell'],
  imageUrl: null,
  tracks: [{ uri: 'spotify:track:1', name: 'One', durationMs: 1000 }],
};

/** How U11's header wires the toggle to the drawer. */
function Shell({ isFollower = false }: { isFollower?: boolean }) {
  const drawer = useBrowseDrawer();
  return (
    <>
      <button type="button" {...drawer.toggleProps}>
        Browse
      </button>
      <BrowseDrawer
        open={drawer.open}
        onOpenChange={drawer.onOpenChange}
        toggleRef={drawer.toggleRef}
        isFollower={isFollower}
      />
    </>
  );
}

function setup({ current = null as Album | null, isFollower = false } = {}) {
  saveState('test', { queue: [], current, position: { trackIndex: 0, positionMs: 0 } });
  render(
    <AppStateProvider accountId="test">
      <Shell isFollower={isFollower} />
    </AppStateProvider>,
  );
}

const drawer = () => screen.queryByRole('complementary', { name: 'Browse albums' });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getAlbum).mockReset();
  vi.mocked(getSavedAlbums).mockReset();
  vi.mocked(getSavedAlbums).mockResolvedValue({ items: [summary], total: 1, nextOffset: null });
});

describe('BrowseDrawer', () => {
  it('starts open when no record is on (F1)', async () => {
    setup();
    expect(drawer()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-expanded', 'true');
    await screen.findByText('Blue');
  });

  it('starts closed when a record is on', () => {
    setup({ current: full });
    expect(drawer()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-expanded', 'false');
    expect(getSavedAlbums).not.toHaveBeenCalled();
  });

  it('opening it from the toggle moves focus to the active tab', async () => {
    setup({ current: full });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(drawer()).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My albums' })).toHaveFocus();
    await screen.findByText('Blue');
  });

  it('Escape closes it and returns focus to the toggle', async () => {
    setup();
    await screen.findByText('Blue');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'My albums' }), { key: 'Escape' });
    expect(drawer()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveFocus();
  });

  it('shows a backdrop only while open, and clicking it closes the drawer and focuses the toggle', async () => {
    setup({ current: full });
    expect(screen.queryByTestId('browse-backdrop')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    const backdrop = screen.getByTestId('browse-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveClass('xl:hidden');
    await screen.findByText('Blue');

    fireEvent.click(backdrop);
    expect(drawer()).not.toBeInTheDocument();
    expect(screen.queryByTestId('browse-backdrop')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toHaveFocus();
  });

  it('Play now closes it', async () => {
    vi.mocked(getAlbum).mockResolvedValue(full);
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Play now' }));
    await act(async () => {});
    expect(drawer()).not.toBeInTheDocument();
  });

  it('switches between My albums and Search', async () => {
    setup();
    await screen.findByText('Blue');
    expect(screen.getByRole('tab', { name: 'My albums' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
    expect(screen.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search albums' })).toBeInTheDocument();
    expect(screen.getByText('Blue')).not.toBeVisible();
  });

  it('renders no Play now or Add to queue in a follower tab', async () => {
    setup({ isFollower: true });
    await screen.findByText('Blue');
    expect(screen.queryByRole('button', { name: 'Play now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to queue' })).not.toBeInTheDocument();
  });
});

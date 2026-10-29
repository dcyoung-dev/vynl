import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedAlbums, type AlbumPage, type AlbumSummary } from '../../lib/spotify/api';
import { QuotaExceededError, SpotifyApiError } from '../../lib/spotify/errors';
import { AppStateProvider } from '../../lib/store/AppState';
import SavedAlbums from './SavedAlbums';

vi.mock('../../lib/spotify/api', () => ({
  getAlbum: vi.fn(),
  getSavedAlbums: vi.fn(),
  searchAlbums: vi.fn(),
}));

function albums(from: number, count: number): AlbumSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `saved-${from + i}`,
    uri: `spotify:album:saved-${from + i}`,
    name: `Saved ${from + i}`,
    artists: ['Someone'],
    imageUrl: null,
    totalTracks: 10,
  }));
}

function page(from: number, count: number, total: number): AlbumPage {
  return { items: albums(from, count), total, nextOffset: from + count < total ? from + count : null };
}

function setup() {
  render(
    <AppStateProvider accountId="test">
      <SavedAlbums isFollower={false} onPlayNow={() => {}} />
    </AppStateProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getSavedAlbums).mockReset();
});

describe('SavedAlbums', () => {
  it('shows a loading state while My albums is loading', () => {
    vi.mocked(getSavedAlbums).mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your albums…');
  });

  it('shows the error and a Try again button that repeats the request', async () => {
    vi.mocked(getSavedAlbums)
      .mockRejectedValueOnce(new SpotifyApiError(500, 'boom'))
      .mockResolvedValueOnce(page(0, 2, 2));
    setup();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your albums.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Saved 1')).toBeInTheDocument();
    expect(getSavedAlbums).toHaveBeenCalledTimes(2);
    expect(getSavedAlbums).toHaveBeenLastCalledWith(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("shows Spotify's request limit message for the quota error", async () => {
    vi.mocked(getSavedAlbums).mockRejectedValue(new QuotaExceededError());
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Spotify's request limit for Vynl was reached — try again shortly",
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the first 50 albums, and Load more requests offset 50 and appends', async () => {
    vi.mocked(getSavedAlbums).mockResolvedValueOnce(page(0, 50, 60)).mockResolvedValueOnce(page(50, 10, 60));
    setup();

    const list = await screen.findByRole('list', { name: 'My albums' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(50);
    expect(getSavedAlbums).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Saved 59')).toBeInTheDocument();
    expect(getSavedAlbums).toHaveBeenLastCalledWith(50);
    expect(within(list).getAllByRole('listitem')).toHaveLength(60);
    expect(screen.getByText('Saved 0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says so when the library has no saved albums', async () => {
    vi.mocked(getSavedAlbums).mockResolvedValue(page(0, 0, 0));
    setup();
    expect(await screen.findByText('No saved albums yet.')).toBeInTheDocument();
  });
});

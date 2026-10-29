import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAlbums, type AlbumPage, type AlbumSummary } from '../../lib/spotify/api';
import { SpotifyApiError } from '../../lib/spotify/errors';
import { AppStateProvider } from '../../lib/store/AppState';
import AlbumSearch, { SEARCH_DEBOUNCE_MS } from './AlbumSearch';

vi.mock('../../lib/spotify/api', () => ({
  getAlbum: vi.fn(),
  getSavedAlbums: vi.fn(),
  searchAlbums: vi.fn(),
}));

function results(query: string, from: number, count: number, total: number): AlbumPage {
  const items: AlbumSummary[] = Array.from({ length: count }, (_, i) => ({
    id: `${query}-${from + i}`,
    uri: `spotify:album:${query}-${from + i}`,
    name: `${query} ${from + i}`,
    artists: ['Band'],
    imageUrl: null,
    totalTracks: 8,
  }));
  return { items, total, nextOffset: from + count < total ? from + count : null };
}

function setup() {
  render(
    <AppStateProvider accountId="test">
      <AlbumSearch isFollower={false} onPlayNow={() => {}} />
    </AppStateProvider>,
  );
  return screen.getByRole('searchbox', { name: 'Search albums' });
}

function type(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.change(input, { target: { value: text.slice(0, i) } });
  }
}

/** Fires the debounce and lets the mocked request resolve. */
async function settle(ms = SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(searchAlbums).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AlbumSearch', () => {
  it('shows a prompt for an empty search and sends no request', async () => {
    setup();
    expect(screen.getByText('Search Spotify for an album.')).toBeInTheDocument();
    await settle();
    expect(searchAlbums).not.toHaveBeenCalled();
  });

  it('sends one request after the debounce and shows up to 10 albums', async () => {
    vi.mocked(searchAlbums).mockResolvedValue(results('abba', 0, 10, 25));
    const input = setup();

    type(input, 'abba');
    await settle(SEARCH_DEBOUNCE_MS - 1);
    expect(searchAlbums).not.toHaveBeenCalled();

    await settle(1);
    expect(searchAlbums).toHaveBeenCalledTimes(1);
    expect(searchAlbums).toHaveBeenCalledWith('abba', 0);
    const list = screen.getByRole('list', { name: 'Search results' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
  });

  it('Load more appends the next 10', async () => {
    vi.mocked(searchAlbums)
      .mockResolvedValueOnce(results('abba', 0, 10, 25))
      .mockResolvedValueOnce(results('abba', 10, 10, 25));
    const input = setup();
    type(input, 'abba');
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await settle(0);

    expect(searchAlbums).toHaveBeenLastCalledWith('abba', 10);
    const list = screen.getByRole('list', { name: 'Search results' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByText('abba 0')).toBeInTheDocument();
    expect(screen.getByText('abba 19')).toBeInTheDocument();
  });

  it('shows only album results, each linking to an album on Spotify', async () => {
    vi.mocked(searchAlbums).mockResolvedValue(results('jazz', 0, 3, 3));
    const input = setup();
    type(input, 'jazz');
    await settle();

    const items = within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(within(item).getByRole('link', { name: 'Listen on Spotify' }).getAttribute('href')).toMatch(
        /^https:\/\/open\.spotify\.com\/album\//,
      );
    }
  });

  it('shows "No albums found" for a search with no results', async () => {
    vi.mocked(searchAlbums).mockResolvedValue(results('zzz', 0, 0, 0));
    const input = setup();
    type(input, 'zzz');
    await settle();
    expect(screen.getByText('No albums found')).toBeInTheDocument();
  });

  it('shows the error and Try again repeats the search', async () => {
    vi.mocked(searchAlbums)
      .mockRejectedValueOnce(new SpotifyApiError(500, 'boom'))
      .mockResolvedValueOnce(results('abba', 0, 2, 2));
    const input = setup();
    type(input, 'abba');
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't search Spotify.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle(0);

    expect(searchAlbums).toHaveBeenCalledTimes(2);
    expect(searchAlbums).toHaveBeenLastCalledWith('abba', 0);
    expect(screen.getByText('abba 1')).toBeInTheDocument();
  });

  it('ignores the results of an earlier query that arrive late', async () => {
    let resolveFirst!: (page: AlbumPage) => void;
    vi.mocked(searchAlbums)
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(results('beta', 0, 1, 1));
    const input = setup();
    type(input, 'alpha');
    await settle();
    fireEvent.change(input, { target: { value: 'beta' } });
    await settle();

    await act(async () => resolveFirst(results('alpha', 0, 1, 1)));
    expect(screen.getByText('beta 0')).toBeInTheDocument();
    expect(screen.queryByText('alpha 0')).not.toBeInTheDocument();
  });
});

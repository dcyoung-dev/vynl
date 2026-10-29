import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlbum, type AlbumSummary } from '../../lib/spotify/api';
import { QuotaExceededError } from '../../lib/spotify/errors';
import { AppStateProvider, useAppState } from '../../lib/store/AppState';
import type { Album } from '../../lib/store/queue';
import AlbumCard from './AlbumCard';
import { PlayNowProvider } from './PlayNow';

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
  imageUrl: 'https://i.scdn.co/image/blue',
  totalTracks: 2,
};

const full: Album = {
  id: 'abc',
  uri: 'spotify:album:abc',
  name: 'Blue',
  artists: ['Joni Mitchell'],
  imageUrl: 'https://i.scdn.co/image/blue',
  tracks: [
    { uri: 'spotify:track:1', name: 'All I Want', durationMs: 200_000 },
    { uri: 'spotify:track:2', name: 'My Old Man', durationMs: 210_000 },
  ],
};

function Probe() {
  const { state } = useAppState();
  return (
    <>
      <p>current: {state.current ? `${state.current.name} (${state.current.tracks.length} tracks)` : 'none'}</p>
      <p>queue: {state.queue.map((album) => album.name).join(', ') || 'empty'}</p>
    </>
  );
}

function setup({ isFollower = false } = {}) {
  const onPlayNow = vi.fn();
  render(
    <AppStateProvider accountId="test">
      <AlbumCard album={summary} isFollower={isFollower} onPlayNow={onPlayNow} />
      <Probe />
    </AppStateProvider>,
  );
  return { onPlayNow };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getAlbum).mockReset();
});

describe('AlbumCard', () => {
  it('shows the square cover, the album name and artists', () => {
    setup();
    const cover = screen.getByRole('img');
    expect(cover).toHaveAttribute('src', summary.imageUrl);
    expect(cover).toHaveClass('aspect-square', 'rounded-sm');
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Joni Mitchell')).toBeInTheDocument();
  });

  it("links to the album's Spotify URL with the text Listen on Spotify", () => {
    setup();
    expect(screen.getByRole('link', { name: 'Listen on Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/abc',
    );
  });

  it('Play now fetches the album and dispatches playNow with it', async () => {
    vi.mocked(getAlbum).mockResolvedValue(full);
    const { onPlayNow } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Play now' }));
    await screen.findByText('current: Blue (2 tracks)');

    expect(getAlbum).toHaveBeenCalledWith('abc');
    expect(onPlayNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('queue: empty')).toBeInTheDocument();
  });

  it('hands the album to a PlayNowProvider handler instead of dispatching playNow', async () => {
    vi.mocked(getAlbum).mockResolvedValue(full);
    const playAlbum = vi.fn();
    render(
      <AppStateProvider accountId="test">
        <PlayNowProvider value={playAlbum}>
          <AlbumCard album={summary} isFollower={false} />
        </PlayNowProvider>
        <Probe />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play now' }));
    await vi.waitFor(() => expect(playAlbum).toHaveBeenCalledWith(full));
    expect(screen.getByText('current: none')).toBeInTheDocument();
  });

  it('Add to queue fetches the album and dispatches add with it', async () => {
    vi.mocked(getAlbum).mockResolvedValue(full);
    const { onPlayNow } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
    await screen.findByText('queue: Blue');

    expect(screen.getByText('current: none')).toBeInTheDocument();
    expect(onPlayNow).not.toHaveBeenCalled();
  });

  it('disables both buttons while the album is being fetched', async () => {
    let resolve!: (album: Album) => void;
    vi.mocked(getAlbum).mockReturnValue(new Promise((r) => (resolve = r)));
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
    expect(screen.getByRole('button', { name: 'Play now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Adding/ })).toBeDisabled();

    await act(async () => resolve(full));
    expect(screen.getByRole('button', { name: 'Add to queue' })).toBeEnabled();
  });

  it('shows an inline error and dispatches nothing when the album fails to load', async () => {
    vi.mocked(getAlbum).mockRejectedValue(new QuotaExceededError());
    const { onPlayNow } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Play now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Spotify's request limit for Vynl was reached");
    expect(screen.getByText('current: none')).toBeInTheDocument();
    expect(onPlayNow).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play now' })).toBeEnabled();
  });

  it('renders no Play now or Add to queue in a follower tab', () => {
    setup({ isFollower: true });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Listen on Spotify' })).toBeInTheDocument();
  });
});

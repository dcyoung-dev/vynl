import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findPlaylist } from '../../lib/playlists/catalog';
import { getAlbum } from '../../lib/spotify/api';
import { QuotaExceededError } from '../../lib/spotify/errors';
import type { Album } from '../../lib/store/queue';
import PlaylistStart, { type PlaylistStartProps } from './PlaylistStart';

vi.mock('../../lib/spotify/api', () => ({ getAlbum: vi.fn() }));

const playlist = findPlaylist('album-rotation')!;

function full(id: string): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: id,
    artists: ['x'],
    imageUrl: null,
    tracks: [{ uri: `spotify:track:${id}`, name: 't', durationMs: 1000 }],
  };
}

let order: string[];
let controller: NonNullable<PlaylistStartProps['controller']>;
let session: { hasCurrent: boolean; queued: number };
let onStarted: ReturnType<typeof vi.fn>;

function props(patch: Partial<PlaylistStartProps> = {}): PlaylistStartProps {
  return {
    playlist,
    accountId: 'alice',
    verifiedAccountId: 'alice',
    controller,
    canStart: true,
    getSession: () => session,
    onStarted,
    ...patch,
  };
}

beforeEach(() => {
  order = [];
  session = { hasCurrent: false, queued: 0 };
  onStarted = vi.fn();
  controller = {
    activate: vi.fn(() => void order.push('activate')),
    startSelection: vi.fn(() => {
      order.push('start');
      return Promise.resolve(true);
    }),
  };
  vi.mocked(getAlbum).mockReset();
  vi.mocked(getAlbum).mockImplementation((id) => Promise.resolve(full(id)));
});

const startButton = () => screen.getByRole('button', { name: /Start playlist|Loading albums|Starting/ });

describe('PlaylistStart', () => {
  it('loads in order, then starts an empty session without asking', async () => {
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));

    const albums = vi.mocked(controller.startSelection).mock.calls[0][0];
    expect(albums.map((a) => a.id)).toEqual(playlist.albums.map((a) => a.id));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('activates the player synchronously in the click, before any await', () => {
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    expect(controller.activate).toHaveBeenCalledTimes(1);
    expect(controller.startSelection).not.toHaveBeenCalled();
  });

  it('ignores repeated clicks while working', async () => {
    render(<PlaylistStart {...props()} />);
    const button = startButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(controller.startSelection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getAlbum)).toHaveBeenCalledTimes(playlist.albums.length);
  });

  it.each([
    ['a current album', { hasCurrent: true, queued: 0 }],
    ['only queued albums', { hasCurrent: false, queued: 2 }],
  ])('asks before replacing %s, and cancelling changes nothing', async (_, populated) => {
    session = populated;
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());

    const dialog = await screen.findByRole('alertdialog', { name: /replace/i });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(controller.startSelection).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(controller.startSelection).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start playlist' })).toHaveFocus();
  });

  it('confirming activates the player again and replaces', async () => {
    session = { hasCurrent: true, queued: 3 };
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    await screen.findByRole('alertdialog');
    order.length = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Replace and start' }));
    expect(order).toEqual(['activate', 'start']);
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(controller.startSelection).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    session = { hasCurrent: true, queued: 0 };
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    const dialog = await screen.findByRole('alertdialog');
    const confirm = screen.getByRole('button', { name: 'Replace and start' });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('asks when the session became populated while the albums were loading', async () => {
    let release!: () => void;
    vi.mocked(getAlbum).mockImplementationOnce(
      (id) => new Promise((resolve) => (release = () => resolve(full(id)))),
    );
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    session = { hasCurrent: true, queued: 0 };
    await act(async () => release());

    await screen.findByRole('alertdialog');
    expect(controller.startSelection).not.toHaveBeenCalled();
  });

  it('shows a retryable error and never starts when a fetch fails', async () => {
    vi.mocked(getAlbum).mockRejectedValueOnce(new Error('nope'));
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Couldn't load ${playlist.albums[0].name}`);
    expect(alert).toHaveTextContent('unchanged');
    expect(controller.startSelection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(controller.startSelection).toHaveBeenCalledTimes(1);
  });

  it('says so when Spotify is rate limiting', async () => {
    vi.mocked(getAlbum).mockRejectedValueOnce(new QuotaExceededError());
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/request limit/);
  });

  it('keeps the selection and offers a retry when the controller declines', async () => {
    vi.mocked(controller.startSelection).mockResolvedValueOnce(false);
    render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't start/);
    expect(onStarted).not.toHaveBeenCalled();
  });

  it.each([
    ['not yet confirmed by /me', { verifiedAccountId: null }],
    ['confirmed as another account', { verifiedAccountId: 'bob' }],
    ['not able to play', { canStart: false }],
    ['not leading', { controller: null }],
  ])('cannot be submitted when %s', (_, patch) => {
    render(<PlaylistStart {...props(patch)} />);
    expect(startButton()).toBeDisabled();
    fireEvent.click(startButton());
    expect(vi.mocked(getAlbum)).not.toHaveBeenCalled();
  });

  it('drops an in-flight load when the account changes', async () => {
    let release!: () => void;
    vi.mocked(getAlbum).mockImplementationOnce(
      (id) => new Promise((resolve) => (release = () => resolve(full(id)))),
    );
    const view = render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    view.rerender(<PlaylistStart {...props({ accountId: 'bob', verifiedAccountId: 'bob' })} />);
    await act(async () => release());

    expect(controller.startSelection).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start playlist' })).toBeEnabled();
  });

  it('drops an in-flight load when leadership is lost', async () => {
    let release!: () => void;
    vi.mocked(getAlbum).mockImplementationOnce(
      (id) => new Promise((resolve) => (release = () => resolve(full(id)))),
    );
    const view = render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    view.rerender(<PlaylistStart {...props({ controller: null })} />);
    await act(async () => release());
    expect(controller.startSelection).not.toHaveBeenCalled();
  });

  it('does nothing after unmounting mid-load', async () => {
    let release!: () => void;
    vi.mocked(getAlbum).mockImplementationOnce(
      (id) => new Promise((resolve) => (release = () => resolve(full(id)))),
    );
    const view = render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    view.unmount();
    await act(async () => release());
    expect(controller.startSelection).not.toHaveBeenCalled();
    expect(vi.mocked(getAlbum)).toHaveBeenCalledTimes(1);
  });

  it('judges the newest status at commit: a blocked player never receives the selection', async () => {
    let release!: () => void;
    vi.mocked(getAlbum).mockImplementationOnce(
      (id) => new Promise((resolve) => (release = () => resolve(full(id)))),
    );
    const view = render(<PlaylistStart {...props()} />);
    fireEvent.click(startButton());
    view.rerender(<PlaylistStart {...props({ canStart: false })} />);
    await act(async () => release());
    await waitFor(() => expect(vi.mocked(getAlbum)).toHaveBeenCalledTimes(playlist.albums.length));
    expect(controller.startSelection).not.toHaveBeenCalled();
  });
});

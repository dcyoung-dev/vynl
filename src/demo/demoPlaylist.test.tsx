import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from '../components/Root';
import * as sdk from '../lib/player/sdk';
import { playlists } from '../lib/playlists/catalog';
import { loadState } from '../lib/store/persist';
import { DEMO_USER } from './catalogue';
import { uninstall } from './fakeSpotify';

const playlist = playlists[0];

class StubWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage() {}
  terminate() {}
}


describe('a playlist in the demo', () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('PUBLIC_VYNL_DEMO', 'true');
    vi.stubGlobal('Worker', StubWorker);
  });

  afterEach(() => {
    sdk.disconnect();
    uninstall();
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('keeps the playlist in the address, asks before replacing the seeded record, then plays the first album', async () => {
    window.history.replaceState(null, '', '/vynl/?playlist=album-rotation');
    render(<Root />);

    expect(await screen.findByRole('heading', { name: playlist.title }, { timeout: 5000 })).toBeInTheDocument();
    expect(window.location.search).toBe('?playlist=album-rotation');

    const start = await screen.findByRole('button', { name: 'Start playlist' }, { timeout: 5000 });
    await waitFor(() => expect(start).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(start);
    expect(await screen.findByText(/Replace what's on the turntable\?/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(loadState(DEMO_USER.id).current?.id).toBe('midnight-harbour');

    fireEvent.click(screen.getByRole('button', { name: /Replace and start/ }));
    await waitFor(() => expect(loadState(DEMO_USER.id).current?.id).toBe(playlist.albums[0].id), { timeout: 5000 });
    expect(loadState(DEMO_USER.id).queue.map((album) => album.id)).toEqual(playlist.albums.slice(1).map((album) => album.id));
    expect(await screen.findByRole('button', { name: 'Pause' }, { timeout: 5000 })).toBeInTheDocument();
  }, 20_000);

  it('shows no selected playlist panel without ?playlist= in the address', async () => {
    window.history.replaceState(null, '', '/vynl/');
    render(<Root />);
    expect(await screen.findByRole('button', { name: 'Browse albums' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: playlist.title })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start playlist' })).toBeNull();
  });
});

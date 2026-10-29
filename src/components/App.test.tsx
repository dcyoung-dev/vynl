import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthLostError, startSignIn, isSignedIn, signOut } from '../lib/auth/session';
import { disconnect, getDeviceId } from '../lib/player/sdk';
import type { PlaybackController, PlaybackSnapshot } from '../lib/playback/controller';
import { getAlbum, getDevices, getMe, getSavedAlbums } from '../lib/spotify/api';
import { NotAllowlistedError } from '../lib/spotify/errors';
import type { SpotifyDevice } from '../lib/spotify/types';
import { saveState } from '../lib/store/persist';
import type { Album, PlaybackStatus, QueueAction } from '../lib/store/queue';
import { createFakeLockManager } from '../test/fakes/locks';
import App, { type AppDeps } from './App';

vi.mock('../lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth/session')>()),
  isSignedIn: vi.fn(),
  startSignIn: vi.fn(),
  signOut: vi.fn(() => localStorage.removeItem('vynl:auth')),
}));
vi.mock('../lib/player/sdk', () => ({ disconnect: vi.fn(), getDeviceId: vi.fn(() => 'tab') }));
vi.mock('../lib/spotify/api', () => ({
  getMe: vi.fn(),
  getDevices: vi.fn(),
  getAlbum: vi.fn(),
  getSavedAlbums: vi.fn(),
  searchAlbums: vi.fn(),
}));

const blue: Album = {
  id: 'blue',
  uri: 'spotify:album:blue',
  name: 'Blue',
  artists: ['Joni Mitchell'],
  imageUrl: null,
  tracks: [
    { uri: 'spotify:track:1', name: 'All I Want', durationMs: 200_000 },
    { uri: 'spotify:track:2', name: 'My Old Man', durationMs: 210_000 },
  ],
};
const kind: Album = { ...blue, id: 'kind', uri: 'spotify:album:kind', name: 'Kind of Blue', artists: ['Miles Davis'] };

interface FakeController extends PlaybackController {
  emit(status: PlaybackStatus, patch?: Partial<PlaybackSnapshot>): void;
}

function fakeController(store: { dispatch(action: QueueAction): void }): FakeController {
  let snapshot: PlaybackSnapshot = { status: 'Starting', device: null, notice: null, progress: 0 };
  const listeners = new Set<(s: PlaybackSnapshot) => void>();
  const resolved = () => Promise.resolve();
  return {
    start: vi.fn(),
    activate: vi.fn(),
    playAlbum: vi.fn(resolved),
    moveNeedle: vi.fn(resolved),
    playPause: vi.fn(resolved),
    next: vi.fn(resolved),
    previous: vi.fn(resolved),
    bringItBack: vi.fn(resolved),
    transferTo: vi.fn(resolved),
    dismissNotice: vi.fn(),
    dispose: vi.fn(),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(status, patch = {}) {
      act(() => {
        store.dispatch({ type: 'setStatus', status });
        snapshot = { ...snapshot, ...patch, status };
        listeners.forEach((l) => l(snapshot));
      });
    },
  };
}

let controllers: FakeController[];
let deps: AppDeps;
let registry: ReturnType<typeof createFakeLockManager.registry>;

function device(id: string, name: string, extra: Partial<SpotifyDevice> = {}): SpotifyDevice {
  return { id, name, type: 'Speaker', is_active: false, is_private_session: false, is_restricted: false, volume_percent: 1, ...extra };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(isSignedIn).mockReturnValue(true);
  vi.mocked(startSignIn).mockReset();
  vi.mocked(signOut).mockClear();
  vi.mocked(disconnect).mockClear();
  vi.mocked(getDeviceId).mockReturnValue('tab');
  vi.mocked(getMe).mockResolvedValue({ id: 'alice' } as never);
  vi.mocked(getDevices).mockResolvedValue([]);
  vi.mocked(getSavedAlbums).mockResolvedValue({ items: [], total: 0, nextOffset: null });
  vi.mocked(getAlbum).mockReset();
  controllers = [];
  registry = createFakeLockManager.registry();
  deps = {
    locks: createFakeLockManager(registry),
    createController: ({ store }) => {
      const controller = fakeController(store);
      controllers.push(controller);
      return controller;
    },
  };
});

async function renderApp() {
  render(<App deps={deps} />);
  await waitFor(() => expect(controllers.length).toBe(1));
  return controllers[0];
}

function seed(accountId = 'alice', album: Album | null = blue, queue: Album[] = [kind]) {
  saveState(accountId, { queue, current: album, position: { trackIndex: 0, positionMs: 0 } });
}

describe('signed out', () => {
  beforeEach(() => vi.mocked(isSignedIn).mockReturnValue(false));

  it('shows a sign-in button, a description and no player', () => {
    render(<App deps={deps} />);
    expect(screen.getAllByRole('button', { name: 'Sign in with Spotify' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/pick a record/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Turntable' })).toBeNull();
    expect(controllers).toHaveLength(0);
  });
});

describe('signed in', () => {
  it('Starting shows Connecting to Spotify… and disabled controls', async () => {
    seed();
    await renderApp();
    expect(screen.getByText('Connecting to Spotify…')).toBeInTheDocument();
    for (const name of ['Play', 'Next track', 'Previous track']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('starts one controller from the leader tab after sign-in and disposes it on unmount', async () => {
    seed();
    const view = render(<App deps={deps} />);
    await waitFor(() => expect(controllers).toHaveLength(1));
    expect(controllers[0].start).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(controllers[0].dispose).toHaveBeenCalled();
  });

  it('loads the last account queue straight away, then records the account from getMe', async () => {
    localStorage.setItem('vynl:last-account', 'alice');
    seed('alice');
    vi.mocked(getMe).mockReturnValue(new Promise(() => {}));
    render(<App deps={deps} />);
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument();
    expect(screen.getAllByText('Kind of Blue').length).toBeGreaterThan(0);
  });

  it('saves vynl:last-account after the first sign-in and loads that account', async () => {
    seed('alice');
    render(<App deps={deps} />);
    expect(await screen.findByRole('region', { name: 'Turntable' })).toBeInTheDocument();
    expect(localStorage.getItem('vynl:last-account')).toBe('alice');
    expect(screen.getAllByText('Kind of Blue').length).toBeGreaterThan(0);
  });

  it('shows the controls once the controller is playing', async () => {
    seed();
    const controller = await renderApp();
    controller.emit('Playing');
    const controls = screen.getByRole('group', { name: 'Playback controls and devices' });
    fireEvent.click(within(controls).getByRole('button', { name: 'Pause' }));
    expect(controller.playPause).toHaveBeenCalled();
    fireEvent.click(within(controls).getByRole('button', { name: 'Next track' }));
    expect(controller.next).toHaveBeenCalled();
    expect(within(controls).getByRole('button', { name: 'Devices' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Track list drawer' })).getByRole('button', { name: /My Old Man/ }),
    );
    expect(controller.moveNeedle).toHaveBeenCalledWith(1);
  });

  it('routes Play now through controller.playAlbum', async () => {
    seed('alice', null, []);
    vi.mocked(getSavedAlbums).mockResolvedValue({
      items: [{ id: 'blue', uri: blue.uri, name: 'Blue', artists: ['Joni Mitchell'], imageUrl: null, totalTracks: 2 }],
      total: 1,
      nextOffset: null,
    });
    vi.mocked(getAlbum).mockResolvedValue(blue);
    const controller = await renderApp();
    controller.emit('Resting');
    fireEvent.click(await screen.findByRole('button', { name: 'Play now' }));
    await waitFor(() => expect(controller.playAlbum).toHaveBeenCalledWith(blue));
    expect(controller.activate).toHaveBeenCalled();
  });

  it('invites browsing when nothing is on the turntable (F1)', async () => {
    seed('alice', null, []);
    const controller = await renderApp();
    controller.emit('Resting');
    expect(screen.getByText(/nothing on the turntable/i)).toBeInTheDocument();
  });

  it('Mirroring shows the device and Play here transfers to this tab', async () => {
    seed();
    const controller = await renderApp();
    controller.emit('Mirroring', { device: { id: 'phone', name: 'Kitchen speaker', isVynl: false } });
    expect(screen.getByText('Playing on Kitchen speaker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play here' }));
    expect(controller.transferTo).toHaveBeenCalledWith('tab');
  });

  it('PlayingElsewhere shows Bring it back (AE7)', async () => {
    seed();
    const controller = await renderApp();
    controller.emit('PlayingElsewhere');
    fireEvent.click(screen.getByRole('button', { name: 'Bring it back' }));
    expect(controller.bringItBack).toHaveBeenCalled();
  });

  it('AuthLost asks to sign in again and keeps the queue', async () => {
    seed();
    const controller = await renderApp();
    controller.emit('AuthLost');
    expect(screen.getByText(/sign-in has expired/i)).toBeInTheDocument();
    expect(screen.getAllByText('Kind of Blue').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(startSignIn).toHaveBeenCalled();
  });

  it('AuthLost from GET /me also asks to sign in again, with the saved queue', async () => {
    localStorage.setItem('vynl:last-account', 'alice');
    seed();
    vi.mocked(getMe).mockRejectedValue(new AuthLostError());
    render(<App deps={deps} />);
    expect(await screen.findByText(/sign-in has expired/i)).toBeInTheDocument();
    expect(screen.getAllByText('Kind of Blue').length).toBeGreaterThan(0);
    expect(controllers).toHaveLength(0);
  });

  it('NotAllowlisted explains itself with no controls or device picker (AE1)', async () => {
    vi.mocked(getMe).mockRejectedValue(new NotAllowlistedError());
    render(<App deps={deps} />);
    expect(await screen.findByText(/allowlist/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devices' })).toBeNull();
    expect(controllers).toHaveLength(0);
  });

  it('PremiumRequired explains itself with no controls or device picker (AE1)', async () => {
    seed();
    const controller = await renderApp();
    controller.emit('PremiumRequired');
    expect(screen.getByText(/needs Spotify Premium/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devices' })).toBeNull();
  });

  it('SdkUnavailable explains the cause and still lets remote devices be chosen', async () => {
    seed();
    vi.mocked(getDeviceId).mockReturnValue(null);
    vi.mocked(getDevices).mockResolvedValue([device('phone', 'Phone'), device('locked', 'Locked', { is_restricted: true })]);
    const controller = await renderApp();
    controller.emit('SdkUnavailable');
    expect(screen.getByText(/ad blocker/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Phone' }));
    await waitFor(() => expect(controller.transferTo).toHaveBeenCalledWith('phone'));
    expect(screen.queryByRole('button', { name: 'Locked' })).toBeNull();
  });

  it('a follower tab shows Vynl is open in another tab, no controls and no controller', async () => {
    seed();
    void deps.locks!.request('vynl-leader', () => new Promise(() => {}));
    render(<App deps={deps} />);
    expect(await screen.findByText(/Vynl is open in another tab/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devices' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play now' })).toBeNull();
    const trackRail = screen.getByRole('complementary', { name: 'Album tracks' });
    expect(within(trackRail).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    const trackDrawer = screen.getByRole('complementary', { name: 'Track list drawer' });
    expect(within(trackDrawer).getAllByRole('listitem')).toHaveLength(2);
    expect(within(trackDrawer).queryByRole('button', { name: /All I Want/ })).toBeNull();
    expect(controllers).toHaveLength(0);
  });

  it('shows Listen on Spotify for the current album and never puts the logo inside the turntable', async () => {
    seed();
    const controller = await renderApp();
    controller.emit('Paused');
    const turntable = screen.getByRole('region', { name: 'Turntable' });
    expect(within(turntable).queryByRole('img', { name: 'Spotify' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Spotify' }).closest('header')).not.toBeNull();
    expect(screen.getAllByRole('link', { name: 'Listen on Spotify' })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('open.spotify.com/album/'),
    );
  });

  it('places the queue below the turntable in the main column and the tracks in a desktop rail', async () => {
    seed();
    await renderApp();
    const body = screen.getByTestId('app-body');
    const main = screen.getByRole('main');
    const turntable = screen.getByRole('region', { name: 'Turntable' });
    const queue = screen.getByRole('heading', { name: 'Up next' }).closest('section');
    const trackRail = screen.getByRole('complementary', { name: 'Album tracks' });

    expect(body.className).toMatch(/md:grid-cols-/);
    expect(queue?.parentElement?.parentElement).toBe(main);
    expect(turntable.compareDocumentPosition(queue!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trackRail.parentElement).toBe(body);
    expect(trackRail).toHaveClass('hidden', 'md:block');
  });
});

describe('sign-out and forgetting', () => {
  it('sign-out returns to the sign-in screen, and the queue is there after signing in again', async () => {
    seed();
    localStorage.setItem('vynl:auth', '{}');
    const controller = await renderApp();
    controller.emit('Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByRole('region', { name: 'Turntable' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Sign in with Spotify' }).length).toBeGreaterThan(0);
    expect(controller.dispose).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(localStorage.getItem('vynl:auth')).toBeNull();
    expect(localStorage.getItem('vynl:v1:alice')).not.toBeNull();

    vi.mocked(isSignedIn).mockReturnValue(true);
    registry = createFakeLockManager.registry();
    deps.locks = createFakeLockManager(registry);
    render(<App deps={deps} />);
    expect((await screen.findAllByText('Kind of Blue')).length).toBeGreaterThan(0);
  });

  it('Forget me removes this account and sign-in, leaves other accounts, and disconnects the SDK', async () => {
    seed();
    seed('bob', blue, []);
    localStorage.setItem('vynl:auth', '{}');
    localStorage.setItem('vynl:last-account', 'alice');
    const controller = await renderApp();
    controller.emit('Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Forget me on this browser' }));
    await waitFor(() => expect(localStorage.getItem('vynl:v1:alice')).toBeNull());
    expect(localStorage.getItem('vynl:auth')).toBeNull();
    expect(localStorage.getItem('vynl:last-account')).toBeNull();
    expect(localStorage.getItem('vynl:v1:bob')).not.toBeNull();
    expect(disconnect).toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Sign in with Spotify' }).length).toBeGreaterThan(0);
  });
});

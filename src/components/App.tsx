import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AuthLostError, isSignedIn, signOut, startSignIn } from '../lib/auth/session';
import {
  createController as createPlaybackController,
  type PlaybackController,
  type PlaybackSnapshot,
  type PlaybackStore,
} from '../lib/playback/controller';
import { disconnect, getDeviceId } from '../lib/player/sdk';
import { getMe } from '../lib/spotify/api';
import { NotAllowlistedError } from '../lib/spotify/errors';
import { AppStateProvider, useAppState } from '../lib/store/AppState';
import { forgetAccount, getLastAccount, setLastAccount } from '../lib/store/account';
import { claimLeadership, type LeaderRole } from '../lib/store/leader';
import { queueReducer, type PlaybackStatus } from '../lib/store/queue';
import SignIn from './auth/SignIn';
import BrowseDrawer, { useBrowseDrawer } from './browse/BrowseDrawer';
import { spotifyAlbumUrl } from '../lib/spotify/links';
import { primaryButton, spotifyLink } from './browse/AlbumCard';
import { PlayNowProvider } from './browse/PlayNow';
import DevicePicker from './devices/DevicePicker';
import Header from './Header';
import QueuePanel from './queue/QueuePanel';
import StatusBanner from './status/StatusBanner';
import Controls from './turntable/Controls';
import TrackListPanel from './turntable/TrackListPanel';
import Turntable from './turntable/Turntable';

export interface AppDeps {
  locks?: Pick<LockManager, 'request'>;
  createController?: (options: { store: PlaybackStore }) => PlaybackController;
}

/** States where the listener can't play, so no transport controls or "Play now" are shown. */
const NO_CONTROLS: ReadonlySet<PlaybackStatus> = new Set([
  'SignedOut',
  'Follower',
  'NotAllowlisted',
  'PremiumRequired',
  'AuthLost',
]);
/** States where sending the record to another device makes sense (SdkUnavailable included, KTD16). */
const CAN_PICK_DEVICE: ReadonlySet<PlaybackStatus> = new Set([
  'Resting',
  'ReadyToResume',
  'Playing',
  'Paused',
  'AlbumEnding',
  'Mirroring',
  'PlayingElsewhere',
  'SdkUnavailable',
]);

type MeProblem = 'NotAllowlisted' | 'AuthLost' | 'Failed';

const EMPTY_SNAPSHOT: PlaybackSnapshot = { status: 'Starting', device: null, notice: null, progress: 0 };
const noSubscription = () => () => {};

function useControllerSnapshot(controller: PlaybackController | null): PlaybackSnapshot {
  return useSyncExternalStore(
    controller ? (listener) => controller.subscribe(listener) : noSubscription,
    () => controller?.getSnapshot() ?? EMPTY_SNAPSHOT,
  );
}

/** KTD8: which tab leads. Without the Web Locks API this tab leads alone. */
function useRole(locks: AppDeps['locks']): LeaderRole | null {
  const [role, setRole] = useState<LeaderRole | null>(null);
  useEffect(() => {
    const manager = locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined);
    if (!manager) {
      setRole('leader');
      return;
    }
    return claimLeadership(setRole, manager);
  }, [locks]);
  return role;
}

export default function App({ deps = {} }: { deps?: AppDeps }) {
  const [signedIn, setSignedIn] = useState(isSignedIn);
  const [accountId, setAccountId] = useState<string | null>(getLastAccount);
  const [problem, setProblem] = useState<MeProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [forgetting, setForgetting] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    getMe().then(
      (me) => {
        if (!current) return;
        setLastAccount(me.id);
        setAccountId(me.id);
        setProblem(null);
      },
      (error: unknown) => {
        if (!current) return;
        if (error instanceof NotAllowlistedError) setProblem('NotAllowlisted');
        else if (error instanceof AuthLostError) setProblem('AuthLost');
        else setProblem('Failed');
      },
    );
    return () => {
      current = false;
    };
  }, [signedIn, attempt]);

  // Forgetting waits for the account's state to unmount, so its saver can't write the key back.
  useEffect(() => {
    if (forgetting === undefined) return;
    forgetAccount(forgetting);
    setForgetting(undefined);
  }, [forgetting]);

  function onSignOut() {
    signOut();
    disconnect();
    setSignedIn(false);
  }

  function onForget() {
    setSignedIn(false);
    setForgetting(accountId ?? getLastAccount());
    setAccountId(null);
  }

  const header = (
    <Header signedIn={signedIn} onSignIn={() => void startSignIn()} onSignOut={onSignOut} onForget={onForget} />
  );

  if (!signedIn) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
          <h2 className="font-display text-5xl text-honey-bronze">Spotify albums, played like records</h2>
          <p>
            Sign in with Spotify Premium, open your albums or search the catalogue, pick a record and play it now.
            The turntable spins while the music plays, and your queue is waiting next time.
          </p>
          <SignIn />
        </main>
      </div>
    );
  }

  const blockedWithoutQueue = problem === 'NotAllowlisted' || problem === 'Failed' || accountId === null;
  if (blockedWithoutQueue) {
    const status: PlaybackStatus = problem === 'NotAllowlisted' ? 'NotAllowlisted' : problem === 'AuthLost' ? 'AuthLost' : 'Starting';
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <main className="flex flex-1 flex-col items-center gap-4 p-8">
          <StatusBanner
            status={status}
            deviceName={null}
            notice={null}
            onPlayHere={() => {}}
            onBringItBack={() => {}}
            onSignInAgain={() => void startSignIn()}
            onDismissNotice={() => {}}
          />
          {problem === 'Failed' && (
            <>
              <p role="alert">Couldn't reach Spotify.</p>
              <button type="button" className={primaryButton} onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <AppStateProvider accountId={accountId}>
      <Shell
        locks={deps.locks}
        createController={deps.createController}
        authLost={problem === 'AuthLost'}
        onSignIn={() => void startSignIn()}
        onSignOut={onSignOut}
        onForget={onForget}
      />
    </AppStateProvider>
  );
}

interface ShellProps {
  locks: AppDeps['locks'];
  createController?: AppDeps['createController'];
  authLost: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onForget: () => void;
}

/** The chosen layout (R11): header, drawer, turntable in the centre, queue on the right; one column on small screens. */
function Shell({ locks, createController = createPlaybackController, authLost, onSignIn, onSignOut, onForget }: ShellProps) {
  const { state, dispatch } = useAppState();
  const role = useRole(locks);
  const drawer = useBrowseDrawer();
  const [controller, setController] = useState<PlaybackController | null>(null);
  const snapshot = useControllerSnapshot(controller);

  // The controller reads the store while its own dispatches are still in flight, so keep a ref ahead of React.
  const stateRef = useRef(state);
  stateRef.current = state;
  const createRef = useRef(createController);
  createRef.current = createController;

  const leading = role === 'leader' && !authLost;
  useEffect(() => {
    if (!leading) return;
    const created = createRef.current({
      store: {
        getState: () => stateRef.current,
        dispatch: (action) => {
          stateRef.current = queueReducer(stateRef.current, action);
          dispatch(action);
        },
      },
    });
    setController(created);
    created.start();
    return () => {
      created.dispose();
      setController(null);
    };
  }, [leading, dispatch]);

  const status: PlaybackStatus = authLost
    ? 'AuthLost'
    : role === 'follower'
      ? 'Follower'
      : controller
        ? snapshot.status
        : 'Starting';
  const noControls = NO_CONTROLS.has(status);
  const { current } = state;

  const playNow = useMemo(
    () =>
      Object.assign(
        (album: Parameters<PlaybackController['playAlbum']>[0]) => controller?.playAlbum(album),
        { activate: () => controller?.activate() },
      ),
    [controller],
  );

  function playHere() {
    const tab = getDeviceId();
    void (tab ? controller?.transferTo(tab) : controller?.bringItBack());
  }

  return (
    <PlayNowProvider value={playNow}>
      <div className="flex min-h-screen flex-col">
        <Header
          signedIn
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onForget={onForget}
          drawerToggle={drawer.toggleProps}
        />
        <div
          data-testid="app-body"
          className={`grid flex-1 grid-cols-1 content-start gap-8 p-4 md:grid-cols-[minmax(0,1fr)_20rem] ${drawer.open ? 'md:pl-100' : ''}`}
        >
          <TrackListPanel
            tracks={current?.tracks ?? []}
            currentIndex={state.position.trackIndex}
            onMoveNeedle={noControls ? undefined : (index) => void controller?.moveNeedle(index)}
            disabled={status === 'Starting'}
          />
          <main className="order-2 flex min-w-0 flex-col items-center gap-6 md:order-1">
            <StatusBanner
              status={status}
              deviceName={snapshot.device?.name ?? null}
              notice={snapshot.notice}
              onPlayHere={playHere}
              onBringItBack={() => void controller?.bringItBack()}
              onSignInAgain={onSignIn}
              onDismissNotice={() => controller?.dismissNotice()}
            />
            {!current && status === 'Resting' && (
              <p className="text-center">
                Nothing on the turntable yet.{' '}
                <button type="button" className="underline hover:text-honey-bronze" onClick={() => drawer.onOpenChange(true)}>
                  Pick a record
                </button>{' '}
                from your albums or search Spotify.
              </p>
            )}
            <Turntable
              album={current}
              position={state.position}
              status={status}
            />
            {(!noControls || CAN_PICK_DEVICE.has(status)) && (
              <div role="group" aria-label="Playback controls and devices" className="flex flex-wrap items-start justify-center gap-4">
                {!noControls && (
                  <Controls
                    status={status}
                    signedIn={status !== 'Starting'}
                    onPlayPause={() => void controller?.playPause()}
                    onNext={() => void controller?.next()}
                    onPrevious={() => void controller?.previous()}
                  />
                )}
                {CAN_PICK_DEVICE.has(status) && (
                  <div className="w-32">
                    <DevicePicker thisDeviceId={getDeviceId()} onTransfer={(id) => void controller?.transferTo(id)} />
                  </div>
                )}
              </div>
            )}
            {current && (
              <a href={spotifyAlbumUrl(current.id)} target="_blank" rel="noopener noreferrer" className={spotifyLink}>
                Listen on Spotify
              </a>
            )}
            <div className="w-full max-w-4xl">
              <QueuePanel isFollower={noControls} />
            </div>
          </main>
        </div>
        <BrowseDrawer
          open={drawer.open}
          onOpenChange={drawer.onOpenChange}
          toggleRef={drawer.toggleRef}
          isFollower={noControls}
        />
      </div>
    </PlayNowProvider>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { loadPlaylistAlbums, PlaylistLoadError } from '../../lib/playlists/load';
import type { Playlist } from '../../lib/playlists/catalog';
import type { PlaybackController } from '../../lib/playback/controller';
import type { Album } from '../../lib/store/queue';
import { loadErrorMessage, primaryButton, secondaryButton } from '../browse/AlbumCard';

export interface PlaylistStartProps {
  playlist: Playlist;
  /** The account the session belongs to. Only a /me-confirmed identity may receive a selection. */
  accountId: string;
  verifiedAccountId: string | null;
  /** Null while this tab does not lead, so nothing can be submitted. */
  controller: Pick<PlaybackController, 'activate' | 'startSelection'> | null;
  /** False in any status that cannot play (follower, starting, auth lost, not allowlisted, premium required). */
  canStart: boolean;
  /** The latest session, read at commit time rather than render time. */
  getSession: () => { hasCurrent: boolean; queued: number };
  /** Called once the selection is installed, so the page can drop the selection from the address. */
  onStarted: () => void;
}

type Phase =
  | { name: 'idle' }
  | { name: 'loading' }
  | { name: 'confirming'; albums: Album[] }
  | { name: 'starting' }
  | { name: 'failed'; message: string };

function failureMessage(error: unknown): string {
  if (error instanceof PlaylistLoadError) {
    return loadErrorMessage(error.cause, `${error.message} Your current record and queue are unchanged.`);
  }
  return loadErrorMessage(error, "Couldn't load the playlist. Your current record and queue are unchanged.");
}

/**
 * The selected-playlist panel on the root page. Loading happens before any confirmation and never touches the
 * session; the session is replaced only by an explicit click, after rechecking account, role and latest session.
 */
export default function PlaylistStart({
  playlist,
  accountId,
  verifiedAccountId,
  controller,
  canStart,
  getSession,
  onStarted,
}: PlaylistStartProps) {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const generation = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const titleId = useId();
  const verified = verifiedAccountId === accountId;
  const ready = verified && canStart && controller !== null;
  // Async steps must judge the newest props, not the ones from the render that began them.
  const latest = useRef({ verified, canStart, controller, getSession });
  latest.current = { verified, canStart, controller, getSession };

  // Anything in flight belongs to one account, selection and controller: a change invalidates it.
  useEffect(() => {
    const mine = generation;
    return () => {
      mine.current += 1;
      abort.current?.abort();
      abort.current = null;
      busy.current = false;
      setPhase({ name: 'idle' });
    };
  }, [playlist.slug, accountId, controller]);

  const stillValid = useCallback((token: number) => generation.current === token, []);

  const commit = useCallback(
    async (albums: Album[], confirmed: boolean, token: number) => {
      if (!stillValid(token)) return;
      const { verified, canStart, controller, getSession } = latest.current;
      const session = getSession();
      if (!verified || !canStart || !controller) {
        busy.current = false;
        setPhase({ name: 'idle' });
        return;
      }
      if (!confirmed && (session.hasCurrent || session.queued > 0)) {
        busy.current = false;
        setPhase({ name: 'confirming', albums });
        return;
      }
      setPhase({ name: 'starting' });
      const installed = await controller.startSelection(albums);
      if (!stillValid(token)) return;
      busy.current = false;
      if (installed) onStarted();
      else setPhase({ name: 'failed', message: "Couldn't start the playlist. Check the status above and try again." });
    },
    [onStarted, stillValid],
  );

  async function start() {
    if (busy.current || !controller || !ready) return;
    busy.current = true;
    controller.activate();
    const token = generation.current;
    const signal = new AbortController();
    abort.current = signal;
    setPhase({ name: 'loading' });
    try {
      const albums = await loadPlaylistAlbums(playlist, signal.signal);
      await commit(albums, false, token);
    } catch (error) {
      if (!stillValid(token)) return;
      busy.current = false;
      setPhase({ name: 'failed', message: failureMessage(error) });
    }
  }

  async function confirm() {
    if (phase.name !== 'confirming' || busy.current || !controller || !ready) return;
    busy.current = true;
    controller.activate();
    await commit(phase.albums, true, generation.current);
  }

  function cancel() {
    busy.current = false;
    restoreFocus.current = true;
    setPhase({ name: 'idle' });
  }

  // The start button is disabled behind the dialog, so focus can return only once it renders enabled again.
  useEffect(() => {
    if (phase.name === 'idle' && restoreFocus.current) {
      restoreFocus.current = false;
      startButton.current?.focus();
    }
  }, [phase]);

  const working = phase.name === 'loading' || phase.name === 'starting';

  return (
    <section aria-labelledby={`${titleId}-panel`} className="flex w-full max-w-xl flex-col gap-2 rounded-sm border border-muted-teal p-4 text-vanilla-custard">
      <h2 id={`${titleId}-panel`} className="font-display text-2xl text-honey-bronze">
        {playlist.title}
      </h2>
      <p>{playlist.description}</p>
      <p className="text-sm">{playlist.albums.length} albums, played in order from the start.</p>
      {!ready && (
        <p className="text-sm" role="status">
          {verified ? 'Playback is unavailable right now. Check the status above.' : 'Confirming your Spotify account…'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          ref={startButton}
          type="button"
          className={primaryButton}
          disabled={!ready || working || phase.name === 'confirming'}
          onClick={() => void start()}
        >
          {phase.name === 'loading' ? 'Loading albums…' : phase.name === 'starting' ? 'Starting…' : 'Start playlist'}
        </button>
      </div>
      {phase.name === 'failed' && (
        <div role="alert" className="flex flex-col gap-2">
          <p>{phase.message}</p>
          <div>
            <button type="button" className={secondaryButton} disabled={!ready} onClick={() => void start()}>
              Try again
            </button>
          </div>
        </div>
      )}
      {phase.name === 'confirming' && (
        <ConfirmDialog onConfirm={() => void confirm()} onCancel={cancel} disabled={!ready} />
      )}
    </section>
  );
}

function ConfirmDialog({ onConfirm, onCancel, disabled }: { onConfirm: () => void; onCancel: () => void; disabled: boolean }) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => cancelRef.current?.focus(), []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Tab') {
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-slate/80 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="flex max-w-sm flex-col gap-4 rounded-sm border border-muted-teal bg-dark-slate p-6 text-vanilla-custard"
      >
        <h3 id={titleId} className="font-display text-xl text-honey-bronze">
          Replace what's on the turntable?
        </h3>
        <p>
          Starting this playlist replaces your current record and your queue. The first album plays from the beginning.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" className={secondaryButton} onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className={primaryButton} disabled={disabled} onClick={onConfirm}>
            Replace and start
          </button>
        </div>
      </div>
    </div>
  );
}

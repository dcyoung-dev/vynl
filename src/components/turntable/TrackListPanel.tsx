import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Track } from '../../lib/store/queue';
import TrackList from './TrackList';

export interface TrackListPanelProps {
  tracks: Track[];
  currentIndex: number;
  onMoveNeedle?: (trackIndex: number) => void;
  disabled?: boolean;
}

export default function TrackListPanel({
  tracks,
  currentIndex,
  onMoveNeedle,
  disabled = false,
}: TrackListPanelProps) {
  const drawerId = `track-list-drawer-${useId()}`;
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (tracks.length === 0) return null;

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={drawerId}
        onClick={() => setOpen(true)}
        className="justify-self-start rounded-full border border-muted-teal px-3 py-1.5 text-vanilla-custard hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze md:hidden"
      >
        Tracks
      </button>
      <aside
        id={drawerId}
        aria-label="Track list drawer"
        hidden={!open}
        onKeyDown={onKeyDown}
        className="fixed inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-muted-teal bg-dark-slate p-4 text-vanilla-custard shadow-2xl shadow-neutral-950/60 transition-[translate] duration-300 starting:translate-x-full motion-reduce:transition-none md:hidden"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl">Tracks</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close tracks"
            onClick={close}
            className="grid size-9 place-items-center rounded-full text-vanilla-custard hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {open && <TrackList tracks={tracks} currentIndex={currentIndex} onMoveNeedle={onMoveNeedle} disabled={disabled} />}
      </aside>
      <aside aria-label="Album tracks" className="hidden min-w-0 md:order-2 md:block">
        <h2 className="mb-3 font-display text-xl">Tracks</h2>
        <TrackList tracks={tracks} currentIndex={currentIndex} onMoveNeedle={onMoveNeedle} disabled={disabled} />
      </aside>
    </>
  );
}

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useAppState } from "../../lib/store/AppState";
import AlbumSearch from "./AlbumSearch";
import SavedAlbums from "./SavedAlbums";

export const BROWSE_DRAWER_ID = "browse-drawer";

/**
 * Open state for the drawer and the props for the header button that toggles it (U11).
 * The drawer starts open when no record is on, so a first visit invites browsing (F1).
 */
export function useBrowseDrawer() {
  const { state } = useAppState();
  const [open, setOpen] = useState(() => state.current === null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  return {
    open,
    onOpenChange: setOpen,
    toggleRef,
    toggleProps: {
      ref: toggleRef,
      "aria-expanded": open,
      "aria-controls": BROWSE_DRAWER_ID,
      onClick: () => setOpen((current) => !current),
    },
  };
}

type Tab = "saved" | "search";

export interface BrowseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The header toggle. Focus returns to it when the drawer closes. */
  toggleRef: RefObject<HTMLElement | null>;
  /** KTD8: a follower tab can browse but shows no "Play now" or "Add to queue". */
  isFollower: boolean;
}

/** The slide-out panel with "My albums" and "Search" tabs (R5). */
export default function BrowseDrawer({
  open,
  onOpenChange,
  toggleRef,
  isFollower,
}: BrowseDrawerProps) {
  const baseId = useId();
  const [tab, setTab] = useState<Tab>("saved");
  // Panels mount on first view and stay mounted, so reopening the drawer or switching tabs doesn't refetch (KTD15).
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set());
  const tabRefs = {
    saved: useRef<HTMLButtonElement>(null),
    search: useRef<HTMLButtonElement>(null),
  };

  useEffect(() => {
    if (!open) return;
    setVisited((current) =>
      current.has(tab) ? current : new Set(current).add(tab),
    );
  }, [open, tab]);

  const activeTabRef = tabRefs[tab];
  useEffect(() => {
    if (open) activeTabRef.current?.focus();
    // Only when the drawer opens, not on every tab change.
  }, [open]);

  function close() {
    onOpenChange(false);
    toggleRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "saved", label: "My albums" },
    { id: "search", label: "Search" },
  ];

  return (
    <>
      {open && (
        <div
          data-testid="browse-backdrop"
          aria-hidden="true"
          onClick={close}
          className="fixed inset-0 z-10 bg-neutral-950/60 xl:hidden"
        />
      )}
      <aside
        id={BROWSE_DRAWER_ID}
        aria-label="Browse albums"
        hidden={!open}
        onKeyDown={onKeyDown}
        className="fixed inset-y-0 left-0 z-20 flex w-full flex-col gap-4 overflow-y-auto border-r border-muted-teal bg-dark-slate p-4 text-vanilla-custard shadow-2xl shadow-neutral-950/60 transition-[translate] duration-300 starting:-translate-x-full motion-reduce:transition-none md:w-96"
      >
        <div className="flex items-center justify-between gap-2">
          <div role="tablist" aria-label="Browse" className="flex gap-2">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                ref={tabRefs[id]}
                type="button"
                role="tab"
                id={`${baseId}-${id}-tab`}
                aria-selected={tab === id}
                aria-controls={`${baseId}-${id}-panel`}
                onClick={() => setTab(id)}
                className="rounded-full px-3 py-1.5 font-display text-lg aria-selected:bg-muted-teal aria-selected:text-night-bordeaux focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close browsing"
            onClick={close}
            className="grid size-9 place-items-center rounded-full text-vanilla-custard hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {tabs.map(({ id }) => (
          <div
            key={id}
            role="tabpanel"
            id={`${baseId}-${id}-panel`}
            aria-labelledby={`${baseId}-${id}-tab`}
            hidden={tab !== id}
          >
            {visited.has(id) &&
              (id === "saved" ? (
                <SavedAlbums
                  isFollower={isFollower}
                  onPlayNow={() => onOpenChange(false)}
                />
              ) : (
                <AlbumSearch
                  isFollower={isFollower}
                  onPlayNow={() => onOpenChange(false)}
                />
              ))}
          </div>
        ))}
      </aside>
    </>
  );
}

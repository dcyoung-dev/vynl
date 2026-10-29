import type { QueueState } from './queue';

export type SavedState = Pick<QueueState, 'queue' | 'current' | 'position'>;

const VERSION = 1;
const DEBOUNCE_MS = 500;

export function storageKey(accountId: string): string {
  return `vynl:v${VERSION}:${accountId}`;
}

function emptyState(): SavedState {
  return { queue: [], current: null, position: { trackIndex: 0, positionMs: 0 } };
}

/** KTD9: corrupt JSON or a different schema version loads as an empty state. */
export function loadState(accountId: string): SavedState {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (raw === null) return emptyState();
    const data = JSON.parse(raw);
    if (data?.version !== VERSION || !Array.isArray(data.queue)) return emptyState();
    return { queue: data.queue, current: data.current ?? null, position: data.position ?? emptyState().position };
  } catch {
    return emptyState();
  }
}

export function saveState(accountId: string, state: SavedState): void {
  const { queue, current, position } = state;
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify({ version: VERSION, queue, current, position }));
  } catch {
    // Quota or blocked storage: the queue keeps working in memory for this session.
  }
}

/** Saves the latest state shortly after it changes, and straight away when the page is hidden. */
export function createPersister(accountId: string) {
  let pending: SavedState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    clearTimeout(timer);
    if (pending) saveState(accountId, pending);
    pending = null;
  }

  window.addEventListener('pagehide', flush);

  return {
    schedule(state: SavedState) {
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
    dispose() {
      flush();
      window.removeEventListener('pagehide', flush);
    },
  };
}

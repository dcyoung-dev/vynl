import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { createPersister, loadState, storageKey } from './persist';
import { initialQueueState, queueReducer, type QueueAction, type QueueState } from './queue';

interface AppStateValue {
  state: QueueState;
  dispatch: Dispatch<QueueAction>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

interface Props {
  accountId: string;
  children: ReactNode;
}

/** Holds the queue and playback status for one account, saved under `vynl:v1:<account_id>`. */
export function AppStateProvider({ accountId, children }: Props) {
  // Keyed so a different account never saves into another account's namespace.
  return (
    <AccountState key={accountId} accountId={accountId}>
      {children}
    </AccountState>
  );
}

function AccountState({ accountId, children }: Props) {
  const [state, dispatch] = useReducer(queueReducer, accountId, (id) => ({
    ...initialQueueState(),
    ...loadState(id),
  }));
  const persister = useRef<ReturnType<typeof createPersister> | null>(null);

  useEffect(() => {
    const created = createPersister(accountId);
    persister.current = created;
    return () => created.dispose();
  }, [accountId]);

  // Another tab saved a newer queue: adopt it so a follower promoted to leader never resumes stale state.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(accountId)) dispatch({ type: 'hydrate', saved: loadState(accountId) });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [accountId]);

  useEffect(() => {
    persister.current?.schedule(state);
  }, [state]);

  return <AppStateContext.Provider value={{ state, dispatch }}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}

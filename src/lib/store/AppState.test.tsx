import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppStateProvider, useAppState } from './AppState';
import { loadState, saveState } from './persist';
import type { Album } from './queue';

function album(id: string): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: `Album ${id}`,
    artists: [`Artist ${id}`],
    imageUrl: null,
    tracks: [{ uri: `spotify:track:${id}-1`, name: 'One', durationMs: 180_000 }],
  };
}

function Probe() {
  const { state, dispatch } = useAppState();
  return (
    <>
      <p>current: {state.current?.name ?? 'none'}</p>
      <p>status: {state.status}</p>
      <button type="button" onClick={() => dispatch({ type: 'add', album: album('new') })}>
        add
      </button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('AppStateProvider', () => {
  it('starts from the saved state for the account', () => {
    saveState('alice', { queue: [], current: album('saved'), position: { trackIndex: 0, positionMs: 5_000 } });

    render(
      <AppStateProvider accountId="alice">
        <Probe />
      </AppStateProvider>,
    );

    expect(screen.getByText('current: Album saved')).toBeInTheDocument();
    expect(screen.getByText('status: Starting')).toBeInTheDocument();
  });

  it('saves changes to the account namespace', () => {
    render(
      <AppStateProvider accountId="alice">
        <Probe />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(loadState('alice').queue.map((a) => a.id)).toEqual(['new']);
  });

  it('loads the other account state when the account changes', () => {
    saveState('alice', { queue: [], current: album('alice'), position: { trackIndex: 0, positionMs: 0 } });
    saveState('bob', { queue: [], current: album('bob'), position: { trackIndex: 0, positionMs: 0 } });

    const { rerender } = render(
      <AppStateProvider accountId="alice">
        <Probe />
      </AppStateProvider>,
    );
    rerender(
      <AppStateProvider accountId="bob">
        <Probe />
      </AppStateProvider>,
    );

    expect(screen.getByText('current: Album bob')).toBeInTheDocument();
    expect(loadState('alice').current?.id).toBe('alice');
  });
});

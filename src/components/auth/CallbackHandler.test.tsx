import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubTokenEndpoint, tokenResponse } from '../../lib/auth/fakeTokenEndpoint';
import { AUTH_STORAGE_KEY } from '../../lib/auth/session';
import CallbackHandler from './CallbackHandler';

function arriveAtCallback(query: string, pendingState: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ pkce: { state: pendingState, verifier: 'verifier-1' } }));
  history.replaceState(null, '', `/vynl/callback/?${query}`);
}

let replace: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('PUBLIC_SPOTIFY_CLIENT_ID', 'client-123');
  replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

describe('CallbackHandler', () => {
  it('shows an error and makes no token request when state does not match', async () => {
    arriveAtCallback('code=cb-code-1&state=forged', 'expected');
    const endpoint = stubTokenEndpoint([tokenResponse()]);

    render(<CallbackHandler />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in didn.t complete/i);
    expect(screen.getByRole('link', { name: /back to vynl/i })).toHaveAttribute('href', '/vynl/');
    expect(endpoint.requests).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it('exchanges the code once under StrictMode, removes it from the URL and returns to the app', async () => {
    arriveAtCallback('code=cb-code-2&state=good', 'good');
    const endpoint = stubTokenEndpoint([tokenResponse(), tokenResponse()]);

    render(
      <StrictMode>
        <CallbackHandler />
      </StrictMode>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/vynl/'));
    expect(endpoint.requests).toHaveLength(1);
    expect(new URL(window.location.href).searchParams.has('code')).toBe(false);
    expect(window.location.href).not.toContain('cb-code-2');
  });

  it('returns to the root with the selected playlist after a successful sign-in', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ pkce: { state: 'sel', verifier: 'verifier-1', playlist: 'album-rotation' } }),
    );
    history.replaceState(null, '', '/vynl/callback/?code=cb-code-3&state=sel');
    stubTokenEndpoint([tokenResponse()]);

    render(<CallbackHandler />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/vynl/?playlist=album-rotation'));
  });

  it('does not select a playlist when the exchange fails', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ pkce: { state: 'sel', verifier: 'verifier-1', playlist: 'album-rotation' } }),
    );
    history.replaceState(null, '', '/vynl/callback/?error=access_denied&state=sel');
    stubTokenEndpoint([]);

    render(<CallbackHandler />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

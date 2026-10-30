import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeLockManager } from '../../test/fakes/locks';
import { stubTokenEndpoint, tokenResponse } from './fakeTokenEndpoint';
import { createCodeChallenge } from './pkce';
import {
  AUTH_STORAGE_KEY,
  AuthLostError,
  completeSignIn,
  getAccessToken,
  isSignedIn,
  signOut,
  startSignIn,
} from './session';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

function storedAuth() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

function storeTokens({ accessToken = 'access-old', refreshToken = 'refresh-old', expiresAt = Date.now() - 1000 } = {}) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken, refreshToken, expiresAt }));
}

function storePendingSignIn(state: string, verifier = 'verifier-123') {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ pkce: { state, verifier } }));
}

function setLocks(locks: Pick<LockManager, 'request'> | undefined) {
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('PUBLIC_SPOTIFY_CLIENT_ID', 'client-123');
  setLocks(createFakeLockManager());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (originalLocks) {
    Object.defineProperty(navigator, 'locks', originalLocks);
  } else {
    delete (navigator as { locks?: LockManager }).locks;
  }
});

describe('startSignIn', () => {
  it('stores state and verifier, then sends the browser to the authorize URL', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    await startSignIn();

    const pkce = storedAuth().pkce;
    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/vynl/callback/');
    expect(url.searchParams.get('state')).toBe(pkce.state);
    expect(url.searchParams.get('code_challenge')).toBe(await createCodeChallenge(pkce.verifier));
  });
});

describe('playlist selection through sign-in', () => {
  const callback = (code: string, state: string) => new URL(`http://localhost:3000/vynl/callback/?code=${code}&state=${state}`);

  it('stores only a known slug in the pending transaction', async () => {
    vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    await startSignIn({ playlist: 'album-rotation' });
    expect(storedAuth().pkce.playlist).toBe('album-rotation');
    await startSignIn({ playlist: 'https://evil.example/' });
    expect(storedAuth().pkce).not.toHaveProperty('playlist');
    await startSignIn();
    expect(storedAuth().pkce).not.toHaveProperty('playlist');
  });

  it('returns the selection after a successful exchange, to every caller, and keeps it out of storage', async () => {
    vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    await startSignIn({ playlist: 'album-rotation' });
    const { state } = storedAuth().pkce;
    stubTokenEndpoint([tokenResponse(), tokenResponse()]);
    const url = callback('code-sel-1', state);

    const results = await Promise.all([completeSignIn(url), completeSignIn(url)]);

    expect(results).toEqual([{ playlist: 'album-rotation' }, { playlist: 'album-rotation' }]);
    expect(await completeSignIn(url)).toEqual({ playlist: 'album-rotation' });
    expect(JSON.stringify(storedAuth())).not.toContain('album-rotation');
  });

  it('returns no selection for a normal sign-in or a tampered slug', async () => {
    storePendingSignIn('plain');
    stubTokenEndpoint([tokenResponse(), tokenResponse()]);
    expect(await completeSignIn(callback('code-sel-2', 'plain'))).toEqual({});

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ pkce: { state: 'tampered', verifier: 'v', playlist: '//evil.example' } }),
    );
    expect(await completeSignIn(callback('code-sel-3', 'tampered'))).toEqual({});
  });

  it('gives no selection on state mismatch, provider denial or token failure, and keeps no pending selection', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ pkce: { state: 's', verifier: 'v', playlist: 'album-rotation' } }));
    stubTokenEndpoint([]);
    await expect(completeSignIn(callback('code-sel-4', 'other'))).rejects.toThrow();
    await expect(completeSignIn(new URL('http://localhost:3000/vynl/callback/?error=access_denied&state=s'))).rejects.toThrow();

    stubTokenEndpoint([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(completeSignIn(callback('code-sel-5', 's'))).rejects.toThrow();
    expect(JSON.stringify(storedAuth())).not.toContain('album-rotation');
  });
});

describe('completeSignIn', () => {
  it('rejects a callback whose state does not match and makes no token request', async () => {
    storePendingSignIn('expected-state');
    const endpoint = stubTokenEndpoint([tokenResponse()]);

    await expect(
      completeSignIn(new URL('http://localhost:3000/vynl/callback/?code=code-mismatch&state=other-state')),
    ).rejects.toThrow();

    expect(endpoint.requests).toHaveLength(0);
    expect(isSignedIn()).toBe(false);
  });

  it('exchanges the code with the stored verifier and stores the tokens', async () => {
    storePendingSignIn('state-1', 'verifier-abc');
    const endpoint = stubTokenEndpoint([tokenResponse({ access_token: 'access-1', refresh_token: 'refresh-1' })]);

    await completeSignIn(new URL('http://localhost:3000/vynl/callback/?code=code-1&state=state-1'));

    expect(endpoint.requests).toHaveLength(1);
    const [request] = endpoint.requests;
    expect(request.url).toBe(TOKEN_URL);
    expect(request.method).toBe('POST');
    expect(request.contentType).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(request.body)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: 'http://localhost:3000/vynl/callback/',
      client_id: 'client-123',
      code_verifier: 'verifier-abc',
    });
    expect(storedAuth()).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: expect.any(Number),
    });
    expect(isSignedIn()).toBe(true);
  });

  it('makes exactly one token request when the same callback is handled twice', async () => {
    storePendingSignIn('state-2');
    const endpoint = stubTokenEndpoint([tokenResponse(), tokenResponse()]);
    const url = new URL('http://localhost:3000/vynl/callback/?code=code-2&state=state-2');

    await Promise.all([completeSignIn(url), completeSignIn(url)]);
    await completeSignIn(url);

    expect(endpoint.requests).toHaveLength(1);
  });
});

describe('getAccessToken', () => {
  it('returns the stored token without a request while it is fresh', async () => {
    storeTokens({ accessToken: 'access-fresh', expiresAt: Date.now() + 10 * 60_000 });
    const endpoint = stubTokenEndpoint([]);

    expect(await getAccessToken()).toBe('access-fresh');
    expect(endpoint.requests).toHaveLength(0);
  });

  it('refreshes a token within 60 seconds of expiry', async () => {
    storeTokens({ accessToken: 'access-old', refreshToken: 'refresh-old', expiresAt: Date.now() + 30_000 });
    const endpoint = stubTokenEndpoint([tokenResponse({ access_token: 'access-2' })]);

    expect(await getAccessToken()).toBe('access-2');
    expect(Object.fromEntries(endpoint.requests[0].body)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-old',
      client_id: 'client-123',
    });
  });

  it('makes one refresh request for two concurrent calls with an expired token', async () => {
    storeTokens();
    const endpoint = stubTokenEndpoint([tokenResponse({ access_token: 'access-3' }), tokenResponse()], { hold: true });

    const both = Promise.all([getAccessToken(), getAccessToken()]);
    await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
    endpoint.release();

    expect(await both).toEqual(['access-3', 'access-3']);
    expect(endpoint.requests).toHaveLength(1);
  });

  it('makes one refresh request for two concurrent calls when navigator.locks is missing', async () => {
    setLocks(undefined);
    storeTokens();
    const endpoint = stubTokenEndpoint([tokenResponse({ access_token: 'access-4' }), tokenResponse()], { hold: true });

    const both = Promise.all([getAccessToken(), getAccessToken()]);
    await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
    endpoint.release();

    expect(await both).toEqual(['access-4', 'access-4']);
    expect(endpoint.requests).toHaveLength(1);
  });

  it('makes one refresh request when two tabs refresh at once, and broadcasts the new token', async () => {
    storeTokens();
    const endpoint = stubTokenEndpoint([tokenResponse({ access_token: 'access-5' }), tokenResponse()], { hold: true });
    const received: unknown[] = [];
    const listener = new BroadcastChannel('vynl-auth');
    listener.onmessage = (event) => received.push(event.data);

    vi.resetModules();
    const otherTab = await import('./session');

    const both = Promise.all([getAccessToken(), otherTab.getAccessToken()]);
    await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
    endpoint.release();

    expect(await both).toEqual(['access-5', 'access-5']);
    expect(endpoint.requests).toHaveLength(1);
    await vi.waitFor(() =>
      expect(received).toContainEqual({ type: 'token-refreshed', accessToken: 'access-5', expiresAt: expect.any(Number) }),
    );
    listener.close();
  });

  it('keeps the stored refresh token when the response has none', async () => {
    storeTokens({ refreshToken: 'refresh-keep' });
    stubTokenEndpoint([tokenResponse({ access_token: 'access-6', refresh_token: undefined })]);

    await getAccessToken();

    expect(storedAuth()).toMatchObject({ accessToken: 'access-6', refreshToken: 'refresh-keep' });
  });

  it('stores a rotated refresh token', async () => {
    storeTokens({ refreshToken: 'refresh-old' });
    stubTokenEndpoint([tokenResponse({ refresh_token: 'refresh-rotated' })]);

    await getAccessToken();

    expect(storedAuth()).toMatchObject({ refreshToken: 'refresh-rotated' });
  });

  it('on invalid_grant clears vynl:auth, reports AuthLost and leaves account state untouched', async () => {
    storeTokens();
    localStorage.setItem('vynl:v1:account-1', '{"version":1,"queue":["a"]}');
    localStorage.setItem('vynl:last-account', 'account-1');
    stubTokenEndpoint([{ status: 400, body: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }]);

    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthLostError);

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('vynl:v1:account-1')).toBe('{"version":1,"queue":["a"]}');
    expect(localStorage.getItem('vynl:last-account')).toBe('account-1');
  });

  it('reports AuthLost when there is no session', async () => {
    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthLostError);
  });
});

describe('signOut', () => {
  it('removes vynl:auth only', () => {
    storeTokens();
    localStorage.setItem('vynl:v1:account-1', '{"version":1}');
    localStorage.setItem('vynl:last-account', 'account-1');

    signOut();

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('vynl:v1:account-1')).toBe('{"version":1}');
    expect(localStorage.getItem('vynl:last-account')).toBe('account-1');
    expect(isSignedIn()).toBe(false);
  });
});

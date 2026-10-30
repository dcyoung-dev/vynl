import { findPlaylist } from '../playlists/catalog';
import { redirectUri } from '../url';
import { buildAuthorizeUrl, createCodeChallenge, createCodeVerifier, randomString } from './pkce';

export const AUTH_STORAGE_KEY = 'vynl:auth';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REFRESH_LOCK = 'vynl-token-refresh';
const AUTH_CHANNEL = 'vynl-auth';
const REFRESH_MARGIN_MS = 60_000;

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface PendingSignIn {
  state: string;
  verifier: string;
  /** A known catalogue slug the listener had selected. Selection only; never a URL or an album payload. */
  playlist?: string;
}

export interface SignInResult {
  /** The known playlist slug to reselect after sign-in. Present only after a successful, state-validated exchange. */
  playlist?: string;
}

interface StoredAuth extends Partial<Tokens> {
  pkce?: PendingSignIn;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface TokenRefreshedMessage {
  type: 'token-refreshed';
  accessToken: string;
  expiresAt: number;
}

/** The Spotify session is gone (no tokens, or `invalid_grant`); the listener must sign in again. */
export class AuthLostError extends Error {
  constructor(message = 'Spotify sign-in was lost') {
    super(message);
    this.name = 'AuthLost';
  }
}

export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}

function clientId(): string {
  return import.meta.env.PUBLIC_SPOTIFY_CLIENT_ID;
}

function readAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as StoredAuth);
  } catch {
    return null;
  }
}

function readTokens(): Tokens | null {
  const auth = readAuth();
  if (!auth?.accessToken || !auth.refreshToken || typeof auth.expiresAt !== 'number') return null;
  return { accessToken: auth.accessToken, refreshToken: auth.refreshToken, expiresAt: auth.expiresAt };
}

function writeAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function expiresSoon(tokens: Tokens): boolean {
  return tokens.expiresAt - Date.now() <= REFRESH_MARGIN_MS;
}

async function requestTokens(params: Record<string, string>): Promise<Response> {
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: clientId() }),
  });
}

export function isSignedIn(): boolean {
  return readTokens() !== null;
}

export async function startSignIn(options: { playlist?: string | null } = {}): Promise<void> {
  const verifier = createCodeVerifier();
  const state = randomString(32);
  const playlist = findPlaylist(options.playlist)?.slug;
  writeAuth({ pkce: { state, verifier, ...(playlist && { playlist }) } });
  const url = buildAuthorizeUrl({
    clientId: clientId(),
    redirectUri: redirectUri(),
    state,
    codeChallenge: await createCodeChallenge(verifier),
  });
  window.location.assign(url);
}

// Keyed by code so StrictMode's double effect shares one exchange; codes are single-use.
const exchanges = new Map<string, Promise<SignInResult>>();

export function completeSignIn(url: URL): Promise<SignInResult> {
  const code = url.searchParams.get('code');
  if (!code) {
    return Promise.reject(new SignInError(url.searchParams.get('error') ?? 'missing_code'));
  }
  let exchange = exchanges.get(code);
  if (!exchange) {
    exchange = exchangeCode(code, url.searchParams.get('state'));
    exchanges.set(code, exchange);
  }
  return exchange;
}

async function exchangeCode(code: string, state: string | null): Promise<SignInResult> {
  const pending = readAuth()?.pkce;
  if (!pending || pending.state !== state) {
    throw new SignInError('state_mismatch');
  }
  // Consume the verifier first so a reload can't replay this code.
  localStorage.removeItem(AUTH_STORAGE_KEY);

  const response = await requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: pending.verifier,
  });
  if (!response.ok) {
    throw new SignInError(`token_exchange_failed_${response.status}`);
  }
  const body = (await response.json()) as TokenResponse;
  writeAuth({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  const playlist = findPlaylist(pending.playlist)?.slug;
  return playlist ? { playlist } : {};
}

let inFlightRefresh: Promise<string> | null = null;

/** Forces a refresh unless another tab already replaced the current token. */
export function refreshAccessToken(): Promise<string> {
  inFlightRefresh ??= refreshOnce().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

export async function getAccessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) throw new AuthLostError();
  if (!expiresSoon(tokens)) return tokens.accessToken;
  return refreshAccessToken();
}

function refreshOnce(): Promise<string> {
  const staleToken = readTokens()?.accessToken;
  const refresh = async () => {
    const tokens = readTokens();
    if (!tokens) throw new AuthLostError();
    if (tokens.accessToken !== staleToken && !expiresSoon(tokens)) return tokens.accessToken;
    return refreshTokens(tokens);
  };
  return navigator.locks ? navigator.locks.request(REFRESH_LOCK, refresh) : refresh();
}

async function refreshTokens(tokens: Tokens): Promise<string> {
  const response = await requestTokens({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
  const body = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };

  if (body.error === 'invalid_grant') {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    throw new AuthLostError();
  }
  if (!response.ok || !body.access_token || typeof body.expires_in !== 'number') {
    throw new Error(`Spotify token refresh failed (${response.status})`);
  }

  const next: Tokens = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  writeAuth(next);

  const channel = new BroadcastChannel(AUTH_CHANNEL);
  const message: TokenRefreshedMessage = { type: 'token-refreshed', accessToken: next.accessToken, expiresAt: next.expiresAt };
  channel.postMessage(message);
  channel.close();

  return next.accessToken;
}

export function signOut(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

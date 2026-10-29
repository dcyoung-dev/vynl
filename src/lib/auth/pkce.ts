const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
] as const;

export function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => UNRESERVED[byte % UNRESERVED.length]).join('');
}

export function createCodeVerifier(): string {
  return randomString(64);
}

function base64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export function buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge }: AuthorizeParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

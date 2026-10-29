import { describe, expect, it } from 'vitest';
import { SCOPES, buildAuthorizeUrl, createCodeChallenge, createCodeVerifier } from './pkce';

describe('createCodeChallenge', () => {
  it('is the base64url SHA-256 of the verifier, without padding (RFC 7636 appendix B)', async () => {
    const challenge = await createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('never contains padding or non-URL-safe characters', async () => {
    for (let i = 0; i < 20; i++) {
      expect(await createCodeChallenge(createCodeVerifier())).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});

describe('createCodeVerifier', () => {
  it('uses only unreserved characters within the allowed length', () => {
    const verifier = createCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(createCodeVerifier()).not.toBe(verifier);
  });
});

describe('buildAuthorizeUrl', () => {
  it('carries the client id, code response type, exact redirect URI, all scopes, state and S256', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:4321/vynl/callback/',
        state: 'state-abc',
        codeChallenge: 'challenge-xyz',
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4321/vynl/callback/');
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
      [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-library-read',
        'user-read-playback-state',
        'user-modify-playback-state',
      ].sort(),
    );
    expect(SCOPES).toHaveLength(6);
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

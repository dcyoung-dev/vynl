import { describe, expect, it } from 'vitest';
import { appPath, redirectUri, withBase } from './url';

describe('withBase', () => {
  it('joins the base path and a page path with a trailing slash', () => {
    expect(withBase('callback', '/vynl/')).toBe('/vynl/callback/');
  });

  it('accepts a base without a trailing slash and a path with a leading slash', () => {
    expect(withBase('/callback', '/vynl')).toBe('/vynl/callback/');
  });

  it('returns the base itself for the home page', () => {
    expect(withBase('', '/vynl/')).toBe('/vynl/');
  });
});

describe('appPath', () => {
  it('uses the configured /vynl/ base', () => {
    expect(appPath('callback')).toBe('/vynl/callback/');
  });
});

describe('redirectUri', () => {
  it('builds the Spotify redirect URI for the local origin', () => {
    expect(redirectUri('http://127.0.0.1:4321')).toBe('http://127.0.0.1:4321/vynl/callback/');
  });
});

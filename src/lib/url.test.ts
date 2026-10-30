import { describe, expect, it } from 'vitest';
import { appPath, playlistPath, playlistSelectionPath, playlistsPath, redirectUri, withBase } from './url';

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

describe('playlist paths', () => {
  it('builds catalogue and detail paths under the base', () => {
    expect(playlistsPath()).toBe('/vynl/playlists/');
    expect(playlistPath('album-rotation')).toBe('/vynl/playlists/album-rotation/');
  });

  it('honours other bases, with or without a trailing slash', () => {
    expect(playlistPath('a', '/')).toBe('/playlists/a/');
    expect(playlistPath('a', '/x/y')).toBe('/x/y/playlists/a/');
    expect(playlistsPath('/x/y/')).toBe('/x/y/playlists/');
  });

  it('builds a selection link to the root player carrying only the slug', () => {
    expect(playlistSelectionPath('album-rotation')).toBe('/vynl/?playlist=album-rotation');
    expect(playlistSelectionPath('a b', '/')).toBe('/?playlist=a%20b');
  });
});

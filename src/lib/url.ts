function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

export function withBase(path: string, base: string): string {
  const segments = [trimSlashes(base), trimSlashes(path)].filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

export function appPath(path = ''): string {
  return withBase(path, import.meta.env.BASE_URL);
}

export function redirectUri(origin: string = window.location.origin): string {
  return `${origin}${appPath('callback')}`;
}

export const PLAYLIST_PARAM = 'playlist';

export function playlistsPath(base: string = import.meta.env.BASE_URL): string {
  return withBase('playlists', base);
}

export function playlistPath(slug: string, base: string = import.meta.env.BASE_URL): string {
  return withBase(`playlists/${encodeURIComponent(slug)}`, base);
}

/** The root player with a playlist selected. It only selects: starting is always an explicit action there. */
export function playlistSelectionPath(slug: string, base: string = import.meta.env.BASE_URL): string {
  return `${withBase('', base)}?${PLAYLIST_PARAM}=${encodeURIComponent(slug)}`;
}

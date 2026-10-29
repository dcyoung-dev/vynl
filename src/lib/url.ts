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

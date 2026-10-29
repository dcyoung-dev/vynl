import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY } from '../../lib/auth/session';
import SignIn from './SignIn';

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('PUBLIC_SPOTIFY_CLIENT_ID', 'client-123');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SignIn', () => {
  it('sends the browser to Spotify with the stored state when clicked', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    render(<SignIn />);

    fireEvent.click(screen.getByRole('button', { name: /sign in with spotify/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://accounts.spotify.com');
    expect(url.searchParams.get('state')).toBe(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!).pkce.state);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { appPath } from '../lib/url';
import Header, { type HeaderProps } from './Header';

function setup(props: Partial<HeaderProps> = {}) {
  const handlers = { onSignIn: vi.fn(), onSignOut: vi.fn(), onForget: vi.fn() };
  render(<Header signedIn drawerToggle={{ onClick: vi.fn(), 'aria-expanded': false }} {...handlers} {...props} />);
  return handlers;
}

describe('Header', () => {
  it('shows the Spotify logo at least 70px wide, outside any artwork', () => {
    setup();
    const logo = screen.getByRole('img', { name: 'Spotify' });
    expect(logo).toHaveAttribute('src', expect.stringContaining('spotify/'));
    expect(logo.getAttribute('src')).toContain(appPath('spotify'));
    expect(Number(logo.getAttribute('width'))).toBeGreaterThanOrEqual(70);
    expect(logo.closest('header')).not.toBeNull();
    expect(logo.closest('[data-artwork]')).toBeNull();
  });

  it('links to the privacy page under the base path', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', appPath('privacy'));
  });

  it('offers sign out and Forget me on this browser when signed in', () => {
    const { onSignOut, onForget } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget me on this browser' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onForget).toHaveBeenCalledTimes(1);
  });

  it('offers sign in, and no sign-out, forget or drawer toggle when signed out', () => {
    const { onSignIn } = setup({ signedIn: false, drawerToggle: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Spotify' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forget me on this browser' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse albums' })).toBeNull();
  });

  it('has a toggle for the browse drawer', () => {
    const onClick = vi.fn();
    setup({ drawerToggle: { onClick, 'aria-expanded': false } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse albums' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

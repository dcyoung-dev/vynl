import type { RefObject } from 'react';
import { appPath, playlistsPath } from '../lib/url';

export interface HeaderProps {
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onForget: () => void;
  /** Props for the browse-drawer toggle (from `useBrowseDrawer`); omitted when there is nothing to browse. */
  drawerToggle?: {
    ref?: RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-controls'?: string;
  };
}

const quiet =
  'rounded-full px-3 py-1.5 text-sm text-vanilla-custard underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze';

/** Brand, drawer toggle, sign-in/out, "Forget me", privacy, and the Spotify logo (R3, R4). */
export default function Header({ signedIn, onSignIn, onSignOut, onForget, drawerToggle }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-muted-teal px-4 py-3">
      <div className="flex items-center gap-3">
        {drawerToggle && (
          <button
            type="button"
            {...drawerToggle}
            className="rounded-full bg-muted-teal px-3 py-1.5 text-sm font-semibold text-night-bordeaux focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
          >
            Browse albums
          </button>
        )}
        <h1 className="font-display text-3xl text-honey-bronze">Vynl</h1>
      </div>
      <nav aria-label="Account" className="flex flex-wrap items-center gap-1">
        <a href={playlistsPath()} className={quiet}>
          Playlists
        </a>
        <a href={appPath('privacy')} className={quiet}>
          Privacy
        </a>
        {signedIn ? (
          <>
            <button type="button" onClick={onForget} className={quiet}>
              Forget me on this browser
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-full border border-muted-teal px-3 py-1.5 text-sm text-vanilla-custard hover:bg-night-bordeaux/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-full bg-honey-bronze px-3 py-1.5 text-sm font-semibold text-night-bordeaux focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vanilla-custard"
          >
            Sign in with Spotify
          </button>
        )}
        <img src={`${appPath('spotify')}Spotify_Full_Logo.svg`} alt="Spotify" width={90} className="ml-2 h-auto" />
      </nav>
    </header>
  );
}

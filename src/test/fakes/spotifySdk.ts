import { vi } from 'vitest';
import type { SpotifyPlayer, SpotifyPlayerEvents, SpotifyPlayerOptions } from '../../lib/player/sdk';

export const SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js';

type Listener = (payload: never) => void;

/** A scripted stand-in for `window.Spotify.Player`; tests fire SDK events with `emit`. */
export class FakeSpotifyPlayer implements SpotifyPlayer {
  readonly listeners = new Map<string, Listener[]>();
  connect = vi.fn(async () => true);
  disconnect = vi.fn();
  activateElement = vi.fn(async () => {});

  constructor(readonly options: SpotifyPlayerOptions) {}

  addListener<E extends keyof SpotifyPlayerEvents>(event: E, callback: (payload: SpotifyPlayerEvents[E]) => void): boolean {
    const list = this.listeners.get(event) ?? [];
    list.push(callback as Listener);
    this.listeners.set(event, list);
    return true;
  }

  emit<E extends keyof SpotifyPlayerEvents>(event: E, payload: SpotifyPlayerEvents[E]): void {
    for (const callback of this.listeners.get(event) ?? []) (callback as (p: SpotifyPlayerEvents[E]) => void)(payload);
  }

  /** Resolves the token the SDK would receive from `getOAuthToken`. */
  requestToken(): Promise<string> {
    return new Promise((resolve) => this.options.getOAuthToken(resolve));
  }
}

/**
 * Intercepts the SDK `<script>` so nothing is fetched. `finishLoading()` plays the
 * part of the real script: it installs `window.Spotify` and calls the ready hook.
 */
export function installFakeSpotifySdk() {
  const players: FakeSpotifyPlayer[] = [];
  const scripts: HTMLScriptElement[] = [];
  const realAppend = document.head.appendChild.bind(document.head);

  const append = vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && node.src === SDK_SCRIPT_URL) {
      scripts.push(node);
      return node;
    }
    return realAppend(node);
  });

  return {
    players,
    scripts,
    get player(): FakeSpotifyPlayer {
      const latest = players.at(-1);
      if (!latest) throw new Error('No Spotify.Player has been created');
      return latest;
    },
    finishLoading() {
      window.Spotify = {
        Player: class extends FakeSpotifyPlayer {
          constructor(options: SpotifyPlayerOptions) {
            super(options);
            players.push(this);
          }
        },
      };
      window.onSpotifyWebPlaybackSDKReady?.();
    },
    failLoading() {
      scripts.at(-1)?.dispatchEvent(new Event('error'));
    },
    uninstall() {
      append.mockRestore();
      delete window.Spotify;
      delete window.onSpotifyWebPlaybackSDKReady;
    },
  };
}

export type FakeSpotifySdk = ReturnType<typeof installFakeSpotifySdk>;

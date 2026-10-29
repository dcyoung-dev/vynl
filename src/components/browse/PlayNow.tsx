import { createContext, useContext } from 'react';
import { useAppState } from '../../lib/store/AppState';
import type { Album } from '../../lib/store/queue';

type PlayNow = ((album: Album) => void | Promise<void>) & {
  /** Unlocks audio; AlbumCard calls it in the click turn, before it fetches the album. */
  activate?: () => void;
};

const PlayNowContext = createContext<PlayNow | null>(null);

/** Lets the app route "Play now" through the playback controller, which starts the album on Spotify (KTD14). */
export const PlayNowProvider = PlayNowContext.Provider;

/** Without a provider, "Play now" only puts the album on the turntable in the store. */
export function usePlayNow(): PlayNow {
  const handler = useContext(PlayNowContext);
  const { dispatch } = useAppState();
  return handler ?? ((album) => dispatch({ type: 'playNow', album }));
}

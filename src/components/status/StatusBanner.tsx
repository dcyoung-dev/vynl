import type { ReactNode } from 'react';
import type { PlaybackNotice } from '../../lib/playback/controller';
import type { PlaybackStatus } from '../../lib/store/queue';
import { primaryButton } from '../browse/AlbumCard';

export interface StatusBannerProps {
  status: PlaybackStatus;
  deviceName: string | null;
  notice: PlaybackNotice | null;
  onPlayHere: () => void;
  onBringItBack: () => void;
  onSignInAgain: () => void;
  onDismissNotice: () => void;
}

interface Message {
  text: string;
  /** Problems the listener can't fix from the player read as alerts; the rest are status updates. */
  alert: boolean;
  action?: ReactNode;
}

function Banner({ alert, children }: { alert: boolean; children: ReactNode }) {
  return (
    <div
      role={alert ? 'alert' : 'status'}
      className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-muted-teal bg-night-bordeaux/60 px-4 py-3 text-center text-vanilla-custard"
    >
      {children}
    </div>
  );
}

/** One message for each state that changes what the listener can do (KTD16, R2, R21). */
export default function StatusBanner({
  status,
  deviceName,
  notice,
  onPlayHere,
  onBringItBack,
  onSignInAgain,
  onDismissNotice,
}: StatusBannerProps) {
  const button = (label: string, onClick: () => void) => (
    <button type="button" className={primaryButton} onClick={onClick}>
      {label}
    </button>
  );

  let message: Message | null = null;
  switch (status) {
    case 'Starting':
      message = { text: 'Connecting to Spotify…', alert: false };
      break;
    case 'Mirroring':
      message = { text: `Playing on ${deviceName ?? 'another device'}`, alert: false, action: button('Play here', onPlayHere) };
      break;
    case 'PlayingElsewhere':
      message = {
        text: 'Playing elsewhere: Spotify is playing something else, so the queue is paused.',
        alert: false,
        action: button('Bring it back', onBringItBack),
      };
      break;
    case 'AuthLost':
      message = {
        text: 'Your Spotify sign-in has expired. Your queue is still here.',
        alert: true,
        action: button('Sign in again', onSignInAgain),
      };
      break;
    case 'NotAllowlisted':
      message = {
        text: "This Spotify account isn't on Vynl's allowlist yet. Ask the owner to add you, then sign in again.",
        alert: true,
      };
      break;
    case 'PremiumRequired':
      message = { text: 'Vynl needs Spotify Premium to play music. This account is on a free plan.', alert: true };
      break;
    case 'SdkUnavailable':
      message = {
        text: "Spotify's player couldn't load in this tab, usually because an ad blocker is stopping it. You can still send the record to another device.",
        alert: true,
      };
      break;
    case 'Follower':
      message = { text: 'Vynl is open in another tab. Switch to that tab to listen.', alert: false };
      break;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-2">
      {message && (
        <Banner alert={message.alert}>
          <p>{message.text}</p>
          {message.action}
        </Banner>
      )}
      {notice && (
        <Banner alert={false}>
          <p>{notice.message}</p>
          <button
            type="button"
            onClick={onDismissNotice}
            className="rounded-full px-3 py-1 text-sm underline hover:text-honey-bronze focus-visible:outline-2 focus-visible:outline-honey-bronze"
          >
            Dismiss
          </button>
        </Banner>
      )}
    </div>
  );
}

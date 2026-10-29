import type { Album, PlaybackStatus, Position } from '../../lib/store/queue';
import Controls from './Controls';
import CoverArt from './CoverArt';
import Plinth from './Plinth';
import Record from './Record';
import Tonearm, { albumProgress } from './Tonearm';
import TrackList from './TrackList';

export interface TurntableProps {
  album: Album | null;
  position: Position;
  status: PlaybackStatus;
  signedIn: boolean;
  /** KTD8: a follower tab shows the record but no controls. */
  isFollower: boolean;
  /** Zero-based index of the track to drop the needle on. */
  onMoveNeedle: (trackIndex: number) => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export default function Turntable({
  album,
  position,
  status,
  signedIn,
  isFollower,
  onMoveNeedle,
  onPlayPause,
  onNext,
  onPrevious,
}: TurntableProps) {
  const currentTrack = album?.tracks[position.trackIndex];

  return (
    <section aria-label="Turntable" className="flex w-full max-w-md flex-col items-center gap-6">
      {album && (
        <div className="w-3/5">
          <CoverArt album={album} />
        </div>
      )}
      {album && (
        <div data-testid="now-playing" className="text-center text-vanilla-custard">
          {currentTrack && <p className="font-display text-xl">{currentTrack.name}</p>}
          <p className="text-sm">
            {album.name} · {album.artists.join(', ')}
          </p>
        </div>
      )}
      <div className="relative aspect-[440/320] w-full">
        <Plinth playing={status === 'Playing' || status === 'Mirroring' || status === 'AlbumEnding'} />
        <Record album={album} status={status} />
        <Tonearm status={status} progress={albumProgress(album, position)} />
      </div>
      {!isFollower && (
        <Controls status={status} signedIn={signedIn} onPlayPause={onPlayPause} onNext={onNext} onPrevious={onPrevious} />
      )}
      {album && (
        <TrackList
          tracks={album.tracks}
          currentIndex={position.trackIndex}
          onMoveNeedle={isFollower ? undefined : onMoveNeedle}
          disabled={!signedIn}
        />
      )}
    </section>
  );
}

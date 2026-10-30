import type { Album, PlaybackStatus, Position } from '../../lib/store/queue';
import CoverArt from './CoverArt';
import Plinth from './Plinth';
import Record from './Record';
import Tonearm, { albumProgress } from './Tonearm';

export interface TurntableProps {
  album: Album | null;
  position: Position;
  status: PlaybackStatus;
}

export default function Turntable({ album, position, status }: TurntableProps) {
  const currentTrack = album?.tracks[position.trackIndex];

  return (
    <section aria-label="Turntable" className="flex w-full max-w-4xl flex-col items-center gap-6">
      {album && (
        <div className="flex w-full max-w-xl items-center gap-4">
          <div className="w-20 shrink-0">
            <CoverArt album={album} />
          </div>
          <div data-testid="now-playing" className="min-w-0 text-left text-vanilla-custard">
            {currentTrack && <p className="break-words font-display text-xl">{currentTrack.name}</p>}
            <p className="break-words text-sm">
              {album.name} · {album.artists.join(', ')}
            </p>
          </div>
        </div>
      )}
      <div className="relative aspect-[440/320] w-full">
        <Plinth playing={status === 'Playing' || status === 'Mirroring' || status === 'AlbumEnding'} />
        <Record album={album} status={status} />
        <Tonearm status={status} progress={albumProgress(album, position)} />
      </div>
    </section>
  );
}

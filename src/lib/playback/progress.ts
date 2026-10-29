import type { Album, Position } from '../store/queue';

const clamp = (n: number) => Math.min(1, Math.max(0, n));

const sum = (album: Album, from: number, to: number) =>
  album.tracks.slice(from, to).reduce((total, track) => total + track.durationMs, 0);

/**
 * (durations of earlier tracks + position in the current track) ÷ the album's total duration (KTD19).
 * Kept identical to the tonearm's `albumProgress`; a test checks they agree.
 */
export function albumProgress(album: Album | null, position: Position): number {
  if (!album) return 0;
  const total = sum(album, 0, album.tracks.length);
  if (total <= 0) return 0;
  return clamp((sum(album, 0, position.trackIndex) + position.positionMs) / total);
}

/** Milliseconds left in the album from `position`. */
export function remainingMs(album: Album, position: Position): number {
  const track = album.tracks[position.trackIndex];
  if (!track) return 0;
  return Math.max(0, track.durationMs - position.positionMs) + sum(album, position.trackIndex + 1, album.tracks.length);
}

export interface PositionAnchor {
  position: Position;
  /** When `position` was observed. */
  at: number;
  playing: boolean;
}

/** Where the needle is at `now`, moving on from the last observation while playing. */
export function positionAt(album: Album, anchor: PositionAnchor, now: number): Position {
  if (!anchor.playing) return anchor.position;
  let { trackIndex } = anchor.position;
  let positionMs = anchor.position.positionMs + Math.max(0, now - anchor.at);
  while (trackIndex < album.tracks.length - 1 && positionMs >= album.tracks[trackIndex].durationMs) {
    positionMs -= album.tracks[trackIndex].durationMs;
    trackIndex++;
  }
  const last = album.tracks[trackIndex];
  return { trackIndex, positionMs: last ? Math.min(positionMs, last.durationMs) : positionMs };
}

export interface Track {
  uri: string;
  name: string;
  durationMs: number;
}

/** What Vynl keeps about an album: enough to show it, play it and track progress without refetching (KTD15). */
export interface Album {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  imageUrl: string | null;
  tracks: Track[];
}

export interface Position {
  trackIndex: number;
  positionMs: number;
}

/** The playback states from the High-Level Technical Design state diagram. */
export type PlaybackStatus =
  | 'SignedOut'
  | 'Starting'
  | 'Follower'
  | 'NotAllowlisted'
  | 'PremiumRequired'
  | 'SdkUnavailable'
  | 'AuthLost'
  | 'Resting'
  | 'ReadyToResume'
  | 'Playing'
  | 'Paused'
  | 'AlbumEnding'
  | 'Mirroring'
  | 'PlayingElsewhere';

export interface QueueState {
  queue: Album[];
  current: Album | null;
  position: Position;
  status: PlaybackStatus;
}

export type QueueAction =
  | { type: 'add'; album: Album }
  | { type: 'playNow'; album: Album }
  | { type: 'remove'; index: number }
  | { type: 'moveUp'; index: number }
  | { type: 'moveDown'; index: number }
  | { type: 'advance' }
  | { type: 'setPosition'; position: Position }
  | { type: 'setStatus'; status: PlaybackStatus };

const START: Position = { trackIndex: 0, positionMs: 0 };

export function initialQueueState(): QueueState {
  return { queue: [], current: null, position: START, status: 'Starting' };
}

function swap(queue: Album[], i: number, j: number): Album[] {
  if (i < 0 || j < 0 || i >= queue.length || j >= queue.length) return queue;
  const next = [...queue];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'add':
      return { ...state, queue: [...state.queue, action.album] };
    case 'playNow':
      // KTD14: the interrupted album is dropped, never pushed back into the queue.
      return { ...state, current: action.album, position: START };
    case 'remove':
      return { ...state, queue: state.queue.filter((_, i) => i !== action.index) };
    case 'moveUp':
      return { ...state, queue: swap(state.queue, action.index, action.index - 1) };
    case 'moveDown':
      return { ...state, queue: swap(state.queue, action.index, action.index + 1) };
    case 'advance': {
      const [next = null, ...rest] = state.queue;
      return { ...state, current: next, queue: rest, position: START };
    }
    case 'setPosition':
      return { ...state, position: action.position };
    case 'setStatus':
      return { ...state, status: action.status };
  }
}

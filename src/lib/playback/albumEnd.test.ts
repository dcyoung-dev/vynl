import { describe, expect, it } from 'vitest';
import type { Album } from '../store/queue';
import { classify, createInstance, endWindowOpen, START_CONFIRM_MS, type AlbumInstance, type Observation } from './albumEnd';
import { GRACE_MS_LOCAL, GRACE_MS_REMOTE } from './constants';

const MIN = 60_000;
const A: Album = {
  id: 'a',
  uri: 'spotify:album:a',
  name: 'A',
  artists: ['Artist'],
  imageUrl: null,
  tracks: Array.from({ length: 10 }, (_, i) => ({ uri: `spotify:track:a${i + 1}`, name: `T${i + 1}`, durationMs: 3 * MIN })),
};
const LAST = 9;
const END = 1_000_000;

function instance(overrides: Partial<AlbumInstance> = {}): AlbumInstance {
  return { ...createInstance(1, A, 'tab', 0), confirmed: true, expectedEndAt: END, ...overrides };
}

function obs(overrides: Partial<Observation> = {}): Observation {
  return {
    deviceId: 'tab',
    deviceName: 'Vynl',
    isVynl: true,
    contextUri: A.uri,
    trackUri: A.tracks[LAST].uri,
    trackAlbumUri: A.uri,
    paused: false,
    positionMs: 1_000,
    at: END,
    ...overrides,
  };
}

const other = { trackUri: 'spotify:track:x1', trackAlbumUri: 'spotify:album:x' };

describe('endWindowOpen', () => {
  it('is open within the grace window around the expected end', () => {
    expect(endWindowOpen(instance(), END + GRACE_MS_LOCAL, GRACE_MS_LOCAL)).toBe(true);
    expect(endWindowOpen(instance(), END - GRACE_MS_LOCAL, GRACE_MS_LOCAL)).toBe(true);
    expect(endWindowOpen(instance(), END + GRACE_MS_LOCAL + 1, GRACE_MS_LOCAL)).toBe(false);
    expect(endWindowOpen(instance({ expectedEndAt: null }), END, GRACE_MS_LOCAL)).toBe(false);
  });
});

describe('classify', () => {
  it('reports the album and its track while it plays', () => {
    const verdict = classify(instance(), obs({ trackUri: A.tracks[2].uri, positionMs: 5_000 }), 0, GRACE_MS_LOCAL);
    expect(verdict).toEqual({ kind: 'album', trackIndex: 2, positionMs: 5_000 });
  });

  it('treats a track Spotify relinked to another release as the album (linked_from)', () => {
    const relinked = { trackUri: 'spotify:track:r1', trackAlbumUri: 'spotify:album:other', linkedFromUri: A.tracks[LAST].uri };
    expect(classify(instance({ confirmed: false }), obs(relinked), 10, GRACE_MS_LOCAL)).toEqual({
      kind: 'album',
      trackIndex: LAST,
      positionMs: 1_000,
    });
    expect(classify(instance(), obs({ ...relinked, paused: true, positionMs: 0 }), END, GRACE_MS_LOCAL)).toMatchObject({
      kind: 'ended',
    });
  });

  it('ends when autoplay plays another album in the same context inside the window', () => {
    expect(classify(instance(), obs(other), END + 5_000, GRACE_MS_LOCAL)).toEqual({ kind: 'ended', autoplayStarted: true });
  });

  it('ends when the device loops back to an earlier track of the album inside the window', () => {
    const verdict = classify(instance(), obs({ trackUri: A.tracks[0].uri }), END + 1_000, GRACE_MS_LOCAL);
    expect(verdict).toEqual({ kind: 'ended', autoplayStarted: true });
  });

  it('ends when the last track is paused at 0 inside the window', () => {
    const verdict = classify(instance(), obs({ paused: true, positionMs: 0 }), END, GRACE_MS_LOCAL);
    expect(verdict).toEqual({ kind: 'ended', autoplayStarted: false });
  });

  it('ends when the context changes on the same device inside the window', () => {
    const verdict = classify(instance(), obs({ contextUri: 'spotify:album:x', ...other }), END + 1_000, GRACE_MS_LOCAL);
    expect(verdict.kind).toBe('ended');
  });

  it('is elsewhere when a different context starts on a different device, even inside the window', () => {
    const phone = { deviceId: 'phone', deviceName: 'Phone', isVynl: false };
    const verdict = classify(instance(), obs({ ...phone, contextUri: 'spotify:playlist:p', ...other }), END, GRACE_MS_REMOTE);
    expect(verdict).toEqual({ kind: 'elsewhere' });
  });

  it('follows the same album onto another device', () => {
    const phone = { deviceId: 'phone', deviceName: 'Phone', isVynl: false };
    const verdict = classify(instance(), obs({ ...phone, trackUri: A.tracks[4].uri, positionMs: 60_000 }), 0, GRACE_MS_REMOTE);
    expect(verdict).toEqual({ kind: 'album', trackIndex: 4, positionMs: 60_000 });
  });

  it('is elsewhere when the context matches but the track belongs to another album, outside the window', () => {
    expect(classify(instance(), obs(other), 0, GRACE_MS_LOCAL)).toEqual({ kind: 'elsewhere' });
  });

  it('is elsewhere when the context changes outside the window (AE7)', () => {
    const verdict = classify(instance(), obs({ contextUri: 'spotify:playlist:p', ...other }), 0, GRACE_MS_LOCAL);
    expect(verdict).toEqual({ kind: 'elsewhere' });
  });

  it('ignores everything once the album instance has advanced', () => {
    expect(classify(instance({ advanced: true }), obs(other), END, GRACE_MS_LOCAL)).toEqual({ kind: 'ignore' });
  });

  it('ignores stale playback until a just-started album is confirmed', () => {
    const fresh = { ...createInstance(2, A, 'tab', END), expectedEndAt: null };
    const stale = obs({ contextUri: 'spotify:album:previous', ...other });
    expect(classify(fresh, stale, END + 1_000, GRACE_MS_LOCAL)).toEqual({ kind: 'ignore' });
    expect(classify(fresh, stale, END + START_CONFIRM_MS + 1, GRACE_MS_LOCAL)).toEqual({ kind: 'elsewhere' });
    expect(classify(fresh, obs({ trackUri: A.tracks[0].uri }), END + 1_000, GRACE_MS_LOCAL).kind).toBe('album');
  });

  it('never ends an album that was already lost to other playback', () => {
    const lost = instance({ lost: true });
    expect(classify(lost, obs(other), END, GRACE_MS_LOCAL)).toEqual({ kind: 'elsewhere' });
    expect(classify(lost, obs({ trackUri: A.tracks[3].uri }), END, GRACE_MS_LOCAL).kind).toBe('album');
  });
});

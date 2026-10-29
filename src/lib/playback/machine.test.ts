import { describe, expect, it } from 'vitest';
import type { PlaybackStatus } from '../store/queue';
import { transition } from './machine';

describe('startup (KTD17)', () => {
  it('mirrors the same album when it is live elsewhere', () => {
    expect(transition('Starting', { type: 'startup', live: 'album-remote', hasSaved: true })).toBe('Mirroring');
  });

  it('is ReadyToResume with a saved album and nothing live, or Resting with nothing saved', () => {
    expect(transition('Starting', { type: 'startup', live: 'none', hasSaved: true })).toBe('ReadyToResume');
    expect(transition('Starting', { type: 'startup', live: 'none', hasSaved: false })).toBe('Resting');
  });

  it('leaves SdkUnavailable unless the album is live on a remote device', () => {
    expect(transition('SdkUnavailable', { type: 'startup', live: 'none', hasSaved: true })).toBe('SdkUnavailable');
    expect(transition('SdkUnavailable', { type: 'startup', live: 'album-remote', hasSaved: true })).toBe('Mirroring');
  });

  it('ignores playback events while Starting', () => {
    expect(transition('Starting', { type: 'album', remote: false, paused: false, ending: false })).toBe('Starting');
  });
});

describe('the started album', () => {
  it('is Playing or Paused in the tab', () => {
    expect(transition('Resting', { type: 'album', remote: false, paused: false, ending: false })).toBe('Playing');
    expect(transition('Playing', { type: 'album', remote: false, paused: true, ending: false })).toBe('Paused');
    expect(transition('Paused', { type: 'album', remote: false, paused: false, ending: false })).toBe('Playing');
  });

  it('is Mirroring on a remote device', () => {
    expect(transition('Playing', { type: 'album', remote: true, paused: false, ending: false })).toBe('Mirroring');
    expect(transition('PlayingElsewhere', { type: 'album', remote: true, paused: false, ending: false })).toBe(
      'Mirroring',
    );
    expect(transition('Mirroring', { type: 'album', remote: true, paused: true, ending: false })).toBe('Paused');
  });

  it('is AlbumEnding near the end of the last track', () => {
    expect(transition('Playing', { type: 'album', remote: false, paused: false, ending: true })).toBe('AlbumEnding');
    expect(transition('Mirroring', { type: 'album', remote: true, paused: false, ending: true })).toBe('AlbumEnding');
  });
});

describe('album end', () => {
  it('stays AlbumEnding until the next album starts, or rests when the queue is empty', () => {
    expect(transition('Playing', { type: 'ended', hasNext: true })).toBe('AlbumEnding');
    expect(transition('AlbumEnding', { type: 'ended', hasNext: false })).toBe('Resting');
    expect(transition('Mirroring', { type: 'ended', hasNext: false })).toBe('Resting');
  });
});

describe('other playback', () => {
  it('is PlayingElsewhere from any state with a record on', () => {
    for (const from of ['Playing', 'Paused', 'Mirroring', 'AlbumEnding'] as PlaybackStatus[]) {
      expect(transition(from, { type: 'elsewhere' })).toBe('PlayingElsewhere');
    }
  });

  it('does not matter while nothing is on', () => {
    expect(transition('Resting', { type: 'elsewhere' })).toBe('Resting');
    expect(transition('ReadyToResume', { type: 'elsewhere' })).toBe('ReadyToResume');
  });

  it('stops the record when nothing is playing anywhere', () => {
    expect(transition('Playing', { type: 'stopped' })).toBe('Paused');
    expect(transition('Mirroring', { type: 'stopped' })).toBe('Paused');
    expect(transition('Resting', { type: 'stopped' })).toBe('Resting');
  });

  it('pauses when the browser blocks autoplay', () => {
    expect(transition('Playing', { type: 'autoplayFailed' })).toBe('Paused');
  });
});

describe('failures', () => {
  it('moves to the failure state from anywhere', () => {
    expect(transition('Playing', { type: 'failure', status: 'AuthLost' })).toBe('AuthLost');
    expect(transition('Starting', { type: 'failure', status: 'PremiumRequired' })).toBe('PremiumRequired');
    expect(transition('Starting', { type: 'failure', status: 'SdkUnavailable' })).toBe('SdkUnavailable');
  });

  it('keeps blocking states once there', () => {
    for (const from of ['AuthLost', 'PremiumRequired', 'NotAllowlisted', 'Follower', 'SignedOut'] as PlaybackStatus[]) {
      expect(transition(from, { type: 'album', remote: false, paused: false, ending: false })).toBe(from);
      expect(transition(from, { type: 'elsewhere' })).toBe(from);
    }
  });

  it('does not let SdkUnavailable hide a harder failure', () => {
    expect(transition('PremiumRequired', { type: 'failure', status: 'SdkUnavailable' })).toBe('PremiumRequired');
  });
});

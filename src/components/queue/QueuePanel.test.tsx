import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppStateProvider } from '../../lib/store/AppState';
import { saveState } from '../../lib/store/persist';
import type { Album } from '../../lib/store/queue';
import QueuePanel from './QueuePanel';

function album(id: string): Album {
  return {
    id,
    uri: `spotify:album:${id}`,
    name: `Album ${id}`,
    artists: [`Artist ${id}`],
    imageUrl: `https://i.scdn.co/image/${id}`,
    tracks: [{ uri: `spotify:track:${id}-1`, name: 'One', durationMs: 180_000 }],
  };
}

function setup(queue: Album[], { isFollower = false } = {}) {
  saveState('test', { queue, current: null, position: { trackIndex: 0, positionMs: 0 } });
  render(
    <AppStateProvider accountId="test">
      <QueuePanel isFollower={isFollower} />
    </AppStateProvider>,
  );
}

function names() {
  return within(screen.getByRole('list', { name: 'Queue' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('heading').textContent);
}

function item(name: string) {
  return screen.getByRole('listitem', { name });
}

beforeEach(() => {
  localStorage.clear();
});

describe('QueuePanel', () => {
  it('lists the queued albums in order', () => {
    setup([album('a'), album('b'), album('c')]);
    expect(names()).toEqual(['Album a', 'Album b', 'Album c']);
    expect(within(item('Album a')).getByText('Artist a')).toBeInTheDocument();
  });

  it('Move up on the second item swaps it with the first', () => {
    setup([album('a'), album('b'), album('c')]);
    fireEvent.click(within(item('Album b')).getByRole('button', { name: 'Move up' }));
    expect(names()).toEqual(['Album b', 'Album a', 'Album c']);
  });

  it('Move down on the first item swaps it with the second', () => {
    setup([album('a'), album('b')]);
    fireEvent.click(within(item('Album a')).getByRole('button', { name: 'Move down' }));
    expect(names()).toEqual(['Album b', 'Album a']);
  });

  it('cannot move the first item up or the last item down', () => {
    setup([album('a'), album('b')]);
    expect(within(item('Album a')).getByRole('button', { name: 'Move up' })).toBeDisabled();
    expect(within(item('Album b')).getByRole('button', { name: 'Move down' })).toBeDisabled();
  });

  it('Remove drops the album', () => {
    setup([album('a'), album('b'), album('c')]);
    fireEvent.click(within(item('Album b')).getByRole('button', { name: 'Remove' }));
    expect(names()).toEqual(['Album a', 'Album c']);
  });

  it('links every queued album to its Spotify URL with the text Listen on Spotify', () => {
    setup([album('a'), album('b')]);
    expect(within(item('Album a')).getByRole('link', { name: 'Listen on Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/a',
    );
    expect(within(item('Album b')).getByRole('link', { name: 'Listen on Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/album/b',
    );
  });

  it('renders no queue controls in a follower tab', () => {
    setup([album('a'), album('b')], { isFollower: true });
    expect(names()).toEqual(['Album a', 'Album b']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when the queue is empty', () => {
    setup([]);
    expect(screen.getByText('Nothing queued yet.')).toBeInTheDocument();
  });
});

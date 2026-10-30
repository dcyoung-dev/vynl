import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { playlists, type Playlist } from '../../lib/playlists/catalog';
import { playlistPath, playlistSelectionPath } from '../../lib/url';
import PlaylistCatalog from './PlaylistCatalog';
import PlaylistDetail from './PlaylistDetail';

const rotation = playlists[0];

describe('PlaylistDetail', () => {
  it('renders without any account or store, albums in catalogue order', () => {
    render(<PlaylistDetail playlist={rotation} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Album rotation' })).toBeInTheDocument();
    expect(screen.getByText('Ten albums to put on, one after another.')).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Albums' })).getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveTextContent("The Hand You've Been Dealt");
    expect(items[0]).toHaveTextContent("Joker's Republic");
    expect(items[1]).toHaveTextContent('Moonflower');
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', 'https://open.spotify.com/album/7jtE0xbYPrmEefrEqKWFha');
  });

  it('links to the root player with only the playlist slug, and says browsing is not playback access', () => {
    render(<PlaylistDetail playlist={rotation} />);
    const action = screen.getByRole('link', { name: 'Play in Vynl' });
    expect(action).toHaveAttribute('href', playlistSelectionPath('album-rotation'));
    expect(action.getAttribute('href')).not.toMatch(/token|code|position/i);
    expect(screen.getByText(/Premium account/)).toBeInTheDocument();
  });

  it('shows a fallback when an album has no artwork', () => {
    const noArt: Playlist = { ...rotation, albums: [{ ...rotation.albums[0], imageUrl: null }] };
    const { container } = render(<PlaylistDetail playlist={noArt} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('No artwork')).toBeInTheDocument();
  });
});

describe('PlaylistCatalog', () => {
  it('links each playlist to its own page, including a second entry', () => {
    const second: Playlist = { slug: 'second', title: 'Second', description: 'More.', albums: rotation.albums.slice(0, 2) };
    render(<PlaylistCatalog playlists={[rotation, second]} />);
    expect(screen.getByRole('link', { name: 'Album rotation' })).toHaveAttribute('href', playlistPath('album-rotation'));
    expect(screen.getByRole('link', { name: 'Second' })).toHaveAttribute('href', playlistPath('second'));
    expect(screen.getByText('2 albums')).toBeInTheDocument();
  });
});

import type { Playlist } from '../../lib/playlists/catalog';
import { spotifyAlbumUrl } from '../../lib/spotify/links';
import { playlistSelectionPath, playlistsPath } from '../../lib/url';
import AlbumArt from './AlbumArt';
import { eligibilityNote } from './PlaylistCatalog';

const link =
  'underline underline-offset-2 hover:text-honey-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze';

/** One public playlist: ordered albums and a plain link that selects it in the root player. Static. */
export default function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  return (
    <article aria-labelledby="playlist-heading" className="flex flex-col gap-4">
      <p>
        <a href={playlistsPath()} className={link}>
          All playlists
        </a>
      </p>
      <h1 id="playlist-heading" className="font-display text-5xl text-honey-bronze">
        {playlist.title}
      </h1>
      <p>{playlist.description}</p>
      <p>
        <a
          href={playlistSelectionPath(playlist.slug)}
          className="inline-block rounded-full bg-honey-bronze px-4 py-2 font-semibold text-night-bordeaux focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vanilla-custard"
        >
          Play in Vynl
        </a>
      </p>
      <p className="text-sm">{eligibilityNote} Opening Vynl does not start anything by itself.</p>
      <ol aria-label="Albums" className="flex flex-col gap-3">
        {playlist.albums.map((album, index) => (
          <li key={album.id} className="flex items-center gap-3">
            <span aria-hidden="true" className="w-6 shrink-0 text-right text-sm">
              {index + 1}
            </span>
            <AlbumArt album={album} />
            <div className="min-w-0">
              <p className="font-semibold">{album.name}</p>
              <p className="text-sm">{album.artists.join(', ')}</p>
              <a
                href={spotifyAlbumUrl(album.id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${album.name} on Spotify`}
                className={`text-sm ${link}`}
              >
                Open in Spotify
              </a>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

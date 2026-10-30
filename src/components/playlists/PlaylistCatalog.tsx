import type { Playlist } from '../../lib/playlists/catalog';
import { playlistPath } from '../../lib/url';

export const eligibilityNote =
  'Anyone can browse these playlists. Playing one needs your own Spotify Premium account that has been allowed on this app.';

/** The public list of curated playlists. Static: no account, store or Spotify request. */
export default function PlaylistCatalog({ playlists }: { playlists: readonly Playlist[] }) {
  return (
    <section aria-labelledby="playlists-heading" className="flex flex-col gap-4">
      <h1 id="playlists-heading" className="font-display text-5xl text-honey-bronze">
        Playlists
      </h1>
      <p>Curated album selections you can share. Each plays its albums in order, one after another.</p>
      <p>{eligibilityNote}</p>
      <ul className="flex flex-col gap-3">
        {playlists.map((playlist) => (
          <li key={playlist.slug} className="rounded border border-muted-teal p-4">
            <h2 className="font-display text-2xl">
              <a
                href={playlistPath(playlist.slug)}
                className="underline underline-offset-2 hover:text-honey-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey-bronze"
              >
                {playlist.title}
              </a>
            </h2>
            <p>{playlist.description}</p>
            <p className="text-sm">{playlist.albums.length} albums</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { AlbumSummary } from '../spotify/api';

/** A curated, ordered album selection. Repository-authored: change it by editing this file and deploying. */
export interface Playlist {
  /** Part of the public URL. Keep it stable once published. */
  slug: string;
  title: string;
  description: string;
  /** Display snapshots only. Playback metadata is resolved from Spotify when the listener starts it. */
  albums: readonly AlbumSummary[];
}

type Row = readonly [id: string, name: string, artist: string, totalTracks: number, artworkKey: string];

function album([id, name, artist, totalTracks, artworkKey]: Row): AlbumSummary {
  return {
    id,
    uri: `spotify:album:${id}`,
    name,
    artists: [artist],
    imageUrl: `https://i.scdn.co/image/${artworkKey}`,
    totalTracks,
  };
}

const albumRotationRows: Row[] = [
  ['7jtE0xbYPrmEefrEqKWFha', "The Hand You've Been Dealt", "Joker's Republic", 12, 'ab67616d0000b273aefb1a2c7fb6a49c9d46205c'],
  ['44ASESIE4S1Rw76k8AcRB5', 'Moonflower', 'Flying Raccoon Suit', 13, 'ab67616d0000b27338ba2ace1702ff3a79123f05'],
  ['4r9l0IE5BCE7WUl2f9Jx7e', 'Vending Machine', 'Sad Snack', 9, 'ab67616d0000b27354639539edd0b54d2b5a1f6d'],
  ['2zWSnM4pk3NaTGad8hH78l', 'At Least More Than Half-Way Dead', 'Sgt. Scag', 11, 'ab67616d0000b273b069240261fbd22d8330f16f'],
  ['6Or0QrFbkQ2rkbRJTUoCRz', 'Harmonic Convergence', 'Mega Infinity', 10, 'ab67616d0000b2737b6b5dd577beb99fe357ef15'],
  ['4KQq5k0VTTfRVYqplDihnd', 'Just Devils', 'PWRUP', 12, 'ab67616d0000b273f540297b8d49e417560a0d8c'],
  ['15KlC2f68uX0tH0ccGkI4r', "That's Right!", 'The Agonizers', 10, 'ab67616d0000b273c8f0e81a80a19c60547a2a71'],
  ['582w4ysx1o6rfe291qUciG', 'Treats', 'Poindexter', 10, 'ab67616d0000b273b7a651f64bba5fce52996683'],
  ['3dg4N52mvnw0bOdgakVrWB', 'Disco Lunch', 'The Boy Detective', 10, 'ab67616d0000b2737d80f4c668906b7d4d8b2c6b'],
  ['5pEODhluey5BQStCWB7QlE', 'Work by Day, Skank by Night', 'Swashbuckling Doctors', 11, 'ab67616d0000b2738e364f1c60b03d7819ac0c10'],
];

export const playlists: readonly Playlist[] = [
  {
    slug: 'modern-ska',
    title: 'Modern Ska',
    description: 'A selection of modern ska albums to get you skanking.',
    albums: albumRotationRows.map(album),
  },
];

/** Returns the curated playlist for a known slug, or `undefined`. Never falls back to another playlist. */
export function findPlaylist(slug: string | null | undefined): Playlist | undefined {
  return playlists.find((playlist) => playlist.slug === slug);
}

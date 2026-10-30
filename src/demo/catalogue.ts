import { playlists } from '../lib/playlists/catalog';
import type { SpotifyAlbum, SpotifyArtist, SpotifyDevice, SpotifyTrack, SpotifyUser } from '../lib/spotify/types';

// Hues taken from the palette in src/styles/global.css.
const HUES = [217, 73.5, 130.5, 99.2, 24.9];

function coverArt(seed: number, label: string): string {
  const hue = HUES[seed % HUES.length];
  const accent = HUES[(seed + 2) % HUES.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">` +
    `<rect width="300" height="300" fill="oklch(32% 0.07 ${hue})"/>` +
    `<circle cx="150" cy="150" r="${60 + (seed % 5) * 12}" fill="oklch(72% 0.12 ${accent})"/>` +
    `<circle cx="150" cy="150" r="22" fill="oklch(95% 0.05 ${hue})"/>` +
    `<text x="150" y="285" font-size="20" text-anchor="middle" fill="oklch(95% 0.05 ${hue})">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function artist(id: string, name: string): SpotifyArtist {
  return { id, name, uri: `spotify:artist:${id}` };
}

const ARTISTS = {
  hollow: artist('hollow-tides', 'Hollow Tides'),
  vesper: artist('vesper-lane', 'Vesper Lane'),
  juniper: artist('juniper', 'Juniper'),
  copper: artist('copper-owls', 'The Copper Owls'),
  marlowe: artist('marlowe-quartet', 'Marlowe Quartet'),
  sable: artist('sable-static', 'Sable Static'),
  long: artist('long-named-philharmonic', 'The Extraordinarily Long-Named Philharmonic Ensemble of Northern Provinces'),
  duo: artist('okafor', 'Okafor'),
  duo2: artist('lindqvist', 'Lindqvist'),
  solo: artist('solo-pilgrim', 'Solo Pilgrim'),
};

interface AlbumSpec {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  tracks: Array<string | [string, number]>;
  year: number;
}

function buildAlbum(spec: AlbumSpec, seed: number): SpotifyAlbum {
  const tracks: SpotifyTrack[] = spec.tracks.map((entry, index) => {
    const [name, durationMs] = typeof entry === 'string' ? [entry, 150_000 + ((index * 37_000) % 120_000)] : entry;
    return {
      id: `${spec.id}-t${index + 1}`,
      uri: `spotify:track:${spec.id}-t${index + 1}`,
      name,
      duration_ms: durationMs,
      disc_number: 1,
      track_number: index + 1,
      artists: spec.artists,
    };
  });
  const art = coverArt(seed, spec.name.slice(0, 18).replace(/&/g, '+').replace(/</g, ''));
  return {
    id: spec.id,
    uri: `spotify:album:${spec.id}`,
    name: spec.name,
    album_type: 'album',
    total_tracks: tracks.length,
    release_date: `${spec.year}-01-01`,
    images: [
      { url: art, width: 640, height: 640 },
      { url: art, width: 300, height: 300 },
    ],
    artists: spec.artists,
    tracks: {
      href: `https://api.spotify.com/v1/albums/${spec.id}/tracks`,
      items: tracks,
      limit: 50,
      next: null,
      offset: 0,
      previous: null,
      total: tracks.length,
    },
  };
}

const LONG_TRACK = 'An Unreasonably Long Track Title That Keeps Going Well Past Any Sensible Column Width (Extended Remix)';

const THIRTY_TWO_TRACKS = Array.from(
  { length: 32 },
  (_, i) => `Movement ${i + 1}: ${['Dawn', 'Dusk', 'Tide', 'Ember', 'Frost', 'Bloom', 'Drift', 'Hush'][i % 8]}`,
);

const SAVED_SPECS: AlbumSpec[] = [
  {
    id: 'midnight-harbour',
    name: 'Midnight Harbour',
    artists: [ARTISTS.hollow],
    year: 2021,
    tracks: ['Lantern Light', 'Salt on the Glass', ['Slow Ferry', 245_000], 'Low Tide Hymn', 'Foghorn', 'Last Boat Home'],
  },
  {
    id: 'long-name-album',
    name: 'A Remarkably Long Album Title That Refuses To Fit Neatly Inside Any Reasonable Container Width',
    artists: [ARTISTS.long, ARTISTS.vesper, ARTISTS.copper],
    year: 2019,
    tracks: ['Opening', LONG_TRACK, 'Interlude', 'Reprise'],
  },
  { id: 'thirty-two-pieces', name: 'Thirty-Two Pieces for Patient Listeners', artists: [ARTISTS.marlowe], year: 2018, tracks: THIRTY_TWO_TRACKS },
  { id: 'one-song-only', name: 'One Song Only', artists: [ARTISTS.solo], year: 2023, tracks: [['The Only Song', 312_000]] },
  {
    id: 'paper-moons',
    name: 'Paper Moons',
    artists: [ARTISTS.vesper],
    year: 2020,
    tracks: ['Cut and Fold', 'Origami Sky', 'Glue', 'Scissors Waltz', 'Paper Moons', 'Recycled'],
  },
  {
    id: 'two-voices',
    name: 'Two Voices, One Room',
    artists: [ARTISTS.duo, ARTISTS.duo2],
    year: 2022,
    tracks: ['Call', 'Response', 'Harmony in the Hallway', 'Unison', 'Round', 'Quiet Applause'],
  },
  {
    id: 'static-summer',
    name: 'Static Summer',
    artists: [ARTISTS.sable],
    year: 2017,
    tracks: ['Radio Hiss', 'Heat Haze', 'Fuzz Tape', 'Sunburn', 'Dial Tone', 'Cassette Sleeping', 'Static Summer'],
  },
  {
    id: 'copper-hours',
    name: 'Copper Hours',
    artists: [ARTISTS.copper],
    year: 2016,
    tracks: ['First Hour', 'Second Hour', 'Third Hour', 'Hour of the Owl', 'Closing Time'],
  },
  {
    id: 'long-road-home',
    name: 'The Long Road Home',
    artists: [ARTISTS.juniper],
    year: 2015,
    tracks: ['Gravel', 'Mile Marker', 'Rest Stop Serenade', 'Headlights', 'Crossing the State Line', 'Porch Light'],
  },
  {
    id: 'quartet-no-3',
    name: 'String Quartet No. 3 in F minor, Op. 47',
    artists: [ARTISTS.marlowe],
    year: 2014,
    tracks: [
      ['I. Allegro moderato', 421_000],
      ['II. Scherzo', 288_000],
      ['III. Adagio', 502_000],
      ['IV. Finale: Presto', 349_000],
    ],
  },
  {
    id: 'glasswork',
    name: 'Glasswork',
    artists: [ARTISTS.hollow, ARTISTS.sable],
    year: 2024,
    tracks: ['Blown', 'Annealed', 'Fracture', 'Mosaic', 'Stained', 'Clear'],
  },
  {
    id: 'winter-letters',
    name: 'Winter Letters',
    artists: [ARTISTS.juniper, ARTISTS.vesper],
    year: 2013,
    tracks: ['Dear December', 'Postmarked', 'Frozen Ink', 'Return to Sender', 'Thaw'],
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    artists: [ARTISTS.solo],
    year: 2012,
    tracks: ['Clock In', 'Vending Machine Blues', 'Fluorescent', 'Break Room', 'Clock Out'],
  },
];

const SEARCH_SPECS: AlbumSpec[] = [
  { id: 'search-echoes', name: 'Echoes of a Quiet Town', artists: [ARTISTS.vesper], year: 2011, tracks: ['Main Street', 'Closed Shop', 'Church Bells', 'Empty Square'] },
  { id: 'search-lowlight', name: 'Lowlight', artists: [ARTISTS.sable, ARTISTS.hollow], year: 2010, tracks: ['Dim', 'Dimmer', 'Dark'] },
  { id: 'search-orchard', name: 'Orchard Songs', artists: [ARTISTS.copper], year: 2009, tracks: ['Windfall', 'Press', 'Cider Season', 'Bare Branches'] },
  { id: 'search-minimal', name: 'Minimal', artists: [ARTISTS.solo], year: 2008, tracks: ['One', 'Two'] },
];

export const DEMO_ALBUMS: SpotifyAlbum[] = SAVED_SPECS.map((spec, index) => buildAlbum(spec, index));
export const DEMO_SEARCH_ALBUMS: SpotifyAlbum[] = SEARCH_SPECS.map((spec, index) => buildAlbum(spec, index + DEMO_ALBUMS.length));

export function allDemoAlbums(): SpotifyAlbum[] {
  return [...DEMO_ALBUMS, ...DEMO_SEARCH_ALBUMS];
}

let playlistAlbums: SpotifyAlbum[] | undefined;

/**
 * Fake albums for every catalogue playlist entry, built from its display snapshot so the demo follows catalogue edits.
 * They resolve by id and uri but stay out of saved albums and search.
 */
export function playlistDemoAlbums(): SpotifyAlbum[] {
  playlistAlbums ??= playlists
    .flatMap((playlist) => playlist.albums)
    .filter((summary, index, all) => all.findIndex((other) => other.id === summary.id) === index)
    .map((summary, index) =>
      buildAlbum(
        {
          id: summary.id,
          name: summary.name,
          artists: summary.artists.map((name) => artist(`playlist-${summary.id}-${name}`, name)),
          tracks: Array.from({ length: summary.totalTracks }, (_, track) => `Track ${track + 1}`),
          year: 2020,
        },
        index + DEMO_ALBUMS.length + DEMO_SEARCH_ALBUMS.length,
      ),
    );
  return playlistAlbums;
}

export const DEMO_USER: SpotifyUser = {
  id: 'demo-listener',
  uri: 'spotify:user:demo-listener',
  display_name: 'Demo Listener',
  images: [],
  product: 'premium',
  country: 'GB',
};

export const DEMO_TAB_DEVICE_ID = 'demo-tab-device';

/** Devices besides this browser tab, which the fake SDK player registers as `DEMO_TAB_DEVICE_ID`. */
export const DEMO_DEVICES: SpotifyDevice[] = [
  { id: 'demo-kitchen-speaker', name: 'Kitchen Speaker', type: 'Speaker', is_active: false, is_private_session: false, is_restricted: false, volume_percent: 40 },
  {
    id: 'demo-living-room-tv',
    name: 'Living Room TV with an Extremely Long Device Name',
    type: 'TV',
    is_active: false,
    is_private_session: false,
    is_restricted: false,
    volume_percent: 25,
  },
  { id: 'demo-phone', name: 'Demo Phone', type: 'Smartphone', is_active: false, is_private_session: false, is_restricted: false, volume_percent: 60 },
];

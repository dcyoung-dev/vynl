/**
 * Raw Spotify Web API response shapes, limited to what Vynl reads.
 * Fields Spotify removed for development-mode apps in February 2026 are optional (KTD3).
 */

export interface SpotifyImage {
  url: string;
  height?: number | null;
  width?: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
}

export interface SpotifyPaging<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  disc_number: number;
  track_number: number;
  artists: SpotifyArtist[];
}

export interface SpotifySimplifiedAlbum {
  id: string;
  uri: string;
  name: string;
  album_type: string;
  total_tracks: number;
  release_date?: string;
  images: SpotifyImage[];
  artists: SpotifyArtist[];
  available_markets?: string[];
}

export interface SpotifyAlbum extends SpotifySimplifiedAlbum {
  tracks: SpotifyPaging<SpotifyTrack>;
  label?: string;
  popularity?: number;
  genres?: string[];
  external_ids?: Record<string, string>;
}

export interface SpotifySavedAlbum {
  added_at: string;
  album: SpotifyAlbum;
}

export interface SpotifySearchResponse {
  albums: SpotifyPaging<SpotifySimplifiedAlbum>;
}

export interface SpotifyUser {
  id: string;
  uri: string;
  display_name?: string | null;
  images?: SpotifyImage[];
  email?: string;
  country?: string;
  product?: string;
  followers?: { total: number };
  explicit_content?: { filter_enabled: boolean; filter_locked: boolean };
}

export interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  volume_percent: number | null;
  supports_volume?: boolean;
}

export interface SpotifyDevicesResponse {
  devices: SpotifyDevice[];
}

export interface SpotifyPlaybackContext {
  type: string;
  uri: string;
  href?: string;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice;
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  context: SpotifyPlaybackContext | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  item: (SpotifyTrack & { album?: SpotifySimplifiedAlbum }) | null;
}

/** Spotify's error envelope. Some failures put `reason` at the top level instead. */
export interface SpotifyErrorBody {
  error?: { status?: number; message?: string; reason?: string } | string;
  reason?: string;
}

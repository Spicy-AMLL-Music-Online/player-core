/**
 * Spicy AMLL Player — Library Manager
 * Handles user Library (Songs, Albums, Artists),
 * recently added collection, and playlist helpers.
 */

import { getPlaylists, getPlaylistTracks } from './router.js';

const STORAGE_KEY = 'spicy_user_library';

function getRawLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { songs: [], albums: [], artists: [] };
    const parsed = JSON.parse(raw);
    return {
      songs: Array.isArray(parsed.songs) ? parsed.songs : [],
      albums: Array.isArray(parsed.albums) ? parsed.albums : [],
      artists: Array.isArray(parsed.artists) ? parsed.artists : []
    };
  } catch (e) {
    console.error('[Library] Failed to parse library:', e);
    return { songs: [], albums: [], artists: [] };
  }
}

function saveRawLibrary(lib) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
    window.dispatchEvent(new CustomEvent('spicy-library-changed', { detail: lib }));
  } catch (e) {
    console.error('[Library] Failed to save library:', e);
  }
}

// ── Song Operations ──
export function addSongToLibrary(song) {
  const lib = getRawLibrary();
  const id = String(song.trackId || song.id || song.amTrackId);
  if (!id) return;

  // Remove existing duplicate
  lib.songs = lib.songs.filter(s => String(s.id) !== id);

  const entry = {
    id,
    type: 'song',
    name: song.trackName || song.name || song.title || 'Unknown Song',
    artist: song.artistName || song.artist || 'Unknown Artist',
    album: song.collectionName || song.album || '',
    artUrl: (song.artworkUrl100 || song.artUrl || 'favicon.svg').replace('100x100', '600x600'),
    addedAt: Date.now()
  };

  lib.songs.unshift(entry);
  saveRawLibrary(lib);
  return entry;
}

export function removeSongFromLibrary(songId) {
  const lib = getRawLibrary();
  const id = String(songId);
  lib.songs = lib.songs.filter(s => String(s.id) !== id);
  saveRawLibrary(lib);
}

export function isSongInLibrary(songId) {
  const lib = getRawLibrary();
  const id = String(songId);
  return lib.songs.some(s => String(s.id) === id);
}

// ── Album Operations ──
export function addAlbumToLibrary(album) {
  const lib = getRawLibrary();
  const id = String(album.id || album.albumId);
  if (!id) return;

  lib.albums = lib.albums.filter(a => String(a.id) !== id);

  const entry = {
    id,
    type: 'album',
    name: album.name || album.title || album.collectionName || 'Album',
    artist: album.artistName || album.artist || 'Artist',
    artUrl: (album.artworkUrl100 || album.artUrl || album.artwork?.url || 'favicon.svg').replace('{w}', '600').replace('{h}', '600').replace('100x100', '600x600'),
    releaseDate: album.releaseDate || '',
    addedAt: Date.now()
  };

  lib.albums.unshift(entry);
  saveRawLibrary(lib);
  return entry;
}

export function removeAlbumFromLibrary(albumId) {
  const lib = getRawLibrary();
  const id = String(albumId);
  lib.albums = lib.albums.filter(a => String(a.id) !== id);
  saveRawLibrary(lib);
}

export function isAlbumInLibrary(albumId) {
  const lib = getRawLibrary();
  const id = String(albumId);
  return lib.albums.some(a => String(a.id) === id);
}

// ── Artist Operations ──
export function addArtistToLibrary(artist) {
  const lib = getRawLibrary();
  const id = String(artist.id || artist.artistId);
  if (!id) return;

  lib.artists = lib.artists.filter(a => String(a.id) !== id);

  const entry = {
    id,
    type: 'artist',
    name: artist.name || artist.artistName || 'Artist',
    artUrl: (artist.artworkUrl100 || artist.artUrl || artist.artwork?.url || 'favicon.svg').replace('{w}', '600').replace('{h}', '600'),
    genre: artist.genre || artist.genreNames?.[0] || 'Music',
    addedAt: Date.now()
  };

  lib.artists.unshift(entry);
  saveRawLibrary(lib);
  return entry;
}

export function removeArtistFromLibrary(artistId) {
  const lib = getRawLibrary();
  const id = String(artistId);
  lib.artists = lib.artists.filter(a => String(a.id) !== id);
  saveRawLibrary(lib);
}

export function isArtistInLibrary(artistId) {
  const lib = getRawLibrary();
  const id = String(artistId);
  return lib.artists.some(a => String(a.id) === id);
}

// ── Getters ──
export function getLibrarySongs() {
  return getRawLibrary().songs;
}

export function getLibraryAlbums() {
  return getRawLibrary().albums;
}

export function getLibraryArtists() {
  return getRawLibrary().artists;
}

/**
 * Get all items in library combined, sorted by addedAt descending
 */
export async function getRecentlyAdded(limit = 100) {
  const lib = getRawLibrary();
  const combined = [
    ...lib.songs.map(s => ({ ...s, itemType: 'song' })),
    ...lib.albums.map(a => ({ ...a, itemType: 'album' })),
    ...lib.artists.map(ar => ({ ...ar, itemType: 'artist' }))
  ];

  // Also include user playlists
  try {
    const playlists = await getPlaylists();
    for (const p of playlists) {
      if (p.name !== 'Favorites') {
        const pTracks = await getPlaylistTracks(p.id);
        const firstArt = pTracks[0]?.artUrl || 'favicon.svg';
        combined.push({
          id: p.id,
          type: 'playlist',
          itemType: 'playlist',
          name: p.name,
          artist: `${pTracks.length} tracks`,
          artUrl: firstArt,
          addedAt: p.createdAt || Date.now()
        });
      }
    }
  } catch (e) {
    console.warn('[Library] Failed to fetch playlists for recently added:', e);
  }

  combined.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return combined.slice(0, limit);
}

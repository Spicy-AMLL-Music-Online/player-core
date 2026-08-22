/**
 * Spicy AMLL Player — Smart Recommendation Algorithm
 * Generates personalized "Top Picks for You", "Recently Played",
 * and 90 curated recommendations based on listening history.
 */

const API_BASE = "https://spicyamllplayer-api.hf.space";

export function getListeningHistory() {
  try {
    const raw = localStorage.getItem('spicy_recent_tracks');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[Algorithm] Failed to parse recent tracks:', e);
    return [];
  }
}

export function hasListenedSongs() {
  return getListeningHistory().length > 0;
}

/**
 * Generates the "Top Picks for You" mix:
 * 1. The latest song listened by the user
 * 2. 10 mixed items (songs, albums, artists) from similar / listened artists
 */
export async function generateTopPicks() {
  const history = getListeningHistory();
  if (history.length === 0) return [];

  const latestSong = history[0];
  const picks = [];

  // 1. Latest song
  picks.push({
    type: 'song',
    isLatest: true,
    id: latestSong.trackId || latestSong.id || latestSong.amTrackId,
    title: latestSong.trackName || latestSong.name || latestSong.title || 'Latest Track',
    subtitle: latestSong.artistName || latestSong.artist || 'Unknown Artist',
    album: latestSong.collectionName || latestSong.album || '',
    artUrl: (latestSong.artworkUrl100 || latestSong.artUrl || 'favicon.svg').replace('100x100', '600x600'),
    raw: latestSong
  });

  // Extract unique artists from history
  const artistNames = [...new Set(history.map(t => t.artistName || t.artist).filter(Boolean))];
  const targetArtists = artistNames.slice(0, 4);

  // Fetch songs/albums/artists for these artists to create a 10-item mix
  const mixItems = [];

  try {
    const fetchPromises = targetArtists.map(async (artName) => {
      try {
        const res = await fetch(`${API_BASE}/search?term=${encodeURIComponent(artName)}&limit=15`);
        if (!res.ok) return null;
        const data = await res.json();
        const results = data.results || {};
        const songs = results.songs?.data || [];
        const albums = results.albums?.data || [];
        const artists = results.artists?.data || [];
        return { songs, albums, artists };
      } catch (e) {
        return null;
      }
    });

    const results = (await Promise.all(fetchPromises)).filter(Boolean);

    // Collect candidates
    results.forEach(res => {
      // Add artists
      (res.artists || []).forEach(art => {
        const attr = art.attributes || {};
        mixItems.push({
          type: 'artist',
          id: art.id,
          title: attr.name || 'Artist',
          subtitle: 'Artist',
          artUrl: attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg',
          raw: art
        });
      });

      // Add albums
      (res.albums || []).forEach(alb => {
        const attr = alb.attributes || {};
        mixItems.push({
          type: 'album',
          id: alb.id,
          title: attr.name || 'Album',
          subtitle: attr.artistName || 'Artist',
          artUrl: attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg',
          raw: alb
        });
      });

      // Add songs (not the exact latest song)
      (res.songs || []).forEach(s => {
        if (s.id !== latestSong.trackId && s.id !== latestSong.id) {
          const attr = s.attributes || {};
          mixItems.push({
            type: 'song',
            id: s.id,
            title: attr.name || 'Song',
            subtitle: attr.artistName || 'Artist',
            album: attr.albumName || '',
            artUrl: attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg',
            raw: s
          });
        }
      });
    });

    // Shuffle and pick 10 items
    const shuffled = mixItems.sort(() => 0.5 - Math.random());
    const seen = new Set();
    for (const item of shuffled) {
      if (!seen.has(item.id) && item.id !== latestSong.trackId && item.id !== latestSong.id) {
        seen.add(item.id);
        picks.push(item);
        if (picks.length >= 11) break; // 1 latest + 10 mix
      }
    }
  } catch (e) {
    console.error('[Algorithm] Error building Top Picks mix:', e);
  }

  return picks;
}

/**
 * Returns up to 10 recently played songs (latest to oldest)
 */
export function getRecentlyPlayed10() {
  const history = getListeningHistory();
  return history.slice(0, 10).map(t => ({
    id: t.trackId || t.id || t.amTrackId,
    title: t.trackName || t.name || t.title || 'Song',
    artist: t.artistName || t.artist || 'Unknown Artist',
    album: t.collectionName || t.album || '',
    artUrl: (t.artworkUrl100 || t.artUrl || 'favicon.svg').replace('100x100', '600x600'),
    raw: t
  }));
}

/**
 * Generates 90 recommendations combining similar artists' songs,
 * albums, and songs from recently listened artists not yet heard.
 */
export async function generate90Recommendations() {
  const history = getListeningHistory();
  const listenedIds = new Set(history.map(t => String(t.trackId || t.id || t.amTrackId)));
  const artistNames = [...new Set(history.map(t => t.artistName || t.artist).filter(Boolean))];

  const targetSearchQueries = artistNames.slice(0, 8);
  if (targetSearchQueries.length === 0) {
    targetSearchQueries.push('Hits', 'Pop', 'Rock', 'Electronic');
  }

  const allRecommendations = [];

  try {
    // 1. Fetch recommendations from Search queries for listened artists
    const fetchPromises = targetSearchQueries.map(async (query) => {
      try {
        const res = await fetch(`${API_BASE}/search?term=${encodeURIComponent(query)}&limit=25`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    });

    // 2. Also fetch curated landing recommendations
    const curatedPromise = fetch(`${API_BASE}/recommendations?name=search-landing`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    const [searchResults, curated] = await Promise.all([
      Promise.all(fetchPromises),
      curatedPromise
    ]);

    // Process search results
    searchResults.filter(Boolean).forEach(data => {
      const results = data.results || {};
      (results.songs?.data || []).forEach(s => {
        if (!listenedIds.has(String(s.id))) {
          const attr = s.attributes || {};
          allRecommendations.push({
            type: 'song',
            id: s.id,
            title: attr.name || 'Song',
            subtitle: attr.artistName || 'Artist',
            album: attr.albumName || '',
            artUrl: attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg',
            raw: s
          });
        }
      });

      (results.albums?.data || []).forEach(a => {
        const attr = a.attributes || {};
        allRecommendations.push({
          type: 'album',
          id: a.id,
          title: attr.name || 'Album',
          subtitle: attr.artistName || 'Artist',
          artUrl: attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg',
          raw: a
        });
      });

      (results.artists?.data || []).forEach(ar => {
        const attr = ar.attributes || {};
        allRecommendations.push({
          type: 'artist',
          id: ar.id,
          title: attr.name || 'Artist',
          subtitle: 'Artist',
          artUrl: attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg',
          raw: ar
        });
      });
    });

    // Deduplicate and trim to exactly 90
    const seen = new Set();
    const uniqueList = [];
    const shuffled = allRecommendations.sort(() => 0.5 - Math.random());

    for (const item of shuffled) {
      if (!seen.has(String(item.id))) {
        seen.add(String(item.id));
        uniqueList.push(item);
        if (uniqueList.length >= 90) break;
      }
    }

    return uniqueList;
  } catch (e) {
    console.error('[Algorithm] Failed generating 90 recommendations:', e);
    return allRecommendations.slice(0, 90);
  }
}

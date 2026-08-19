import { addTrackToQueue, clearQueue, setCurrentIndex, getPlaylists, createPlaylist, addTrackToPlaylist, getPlaylistTracks, deletePlaylist } from './router.js';
import { parseAudioMetadata } from './metadata-parser.js';
import { robustFetch } from './network-utils.js';
import { TTMLDownloader } from './ttml-downloader.js';
import isRtl from './is-rtl.js';
import { escapeHTML } from './security-utils.js';

const API_BASE = "https://spicyamllplayer-api.hf.space";

document.addEventListener('DOMContentLoaded', () => {
  const ttmlZone = document.getElementById('ttml-zone');
  const audioZone = document.getElementById('audio-zone');
  const ttmlInput = document.getElementById('ttml-input');
  const audioInput = document.getElementById('audio-input');
  const startBtn = document.getElementById('start-button');
  const errorEl = document.getElementById('upload-error');

  const queuePreview = document.getElementById('queue-preview');
  const queueList = document.getElementById('queue-list');
  const queueCount = document.getElementById('queue-count');
  const clearQueueBtn = document.getElementById('clear-queue-btn');

  const prepOverlay = document.getElementById('prep-overlay');
  const prepStatus = document.getElementById('prep-status');

  // Search Elements
  const catalogSearch = document.getElementById('catalog-search');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const listenInitialContent = document.getElementById('listen-initial-content');
  const searchResultsContainer = document.getElementById('search-results-container');
  const recentlySearchedSection = document.getElementById('recently-searched-section');
  const recentlySearchedGrid = document.getElementById('recently-searched-grid');
  const clearRecentSearchesBtn = document.getElementById('clear-recent-searches-btn');
  const categoriesGrid = document.getElementById('categories-grid');

  // Categorized Search Grid Elements
  const sectionTopResults = document.getElementById('section-top-results');
  const topResultsGrid = document.getElementById('top-results-grid');

  const sectionArtists = document.getElementById('section-artists');
  const artistsGrid = document.getElementById('artists-grid');

  const sectionSongs = document.getElementById('section-songs');
  const songsGrid = document.getElementById('songs-grid');

  const sectionAlbums = document.getElementById('section-albums');
  const albumsGrid = document.getElementById('albums-grid');

  const sectionPlaylists = document.getElementById('section-playlists');
  const playlistsSearchGrid = document.getElementById('playlists-search-grid');

  const sectionVideos = document.getElementById('section-videos');
  const videosGrid = document.getElementById('videos-grid');

  // Album View
  const albumViewContainer = document.getElementById('album-view-container');
  const albumHeader = document.getElementById('album-header');
  const albumTracksGrid = document.getElementById('album-tracks-grid');

  // Artist View
  const artistViewContainer = document.getElementById('artist-view-container');
  const artistViewContent = document.getElementById('artist-view-content');

  // Context Menu & Playlists
  const songContextMenu = document.getElementById('song-context-menu');
  const ctxPlay = document.getElementById('ctx-play');
  const ctxAddPlaylist = document.getElementById('ctx-add-playlist');
  const ctxViewAlbum = document.getElementById('ctx-view-album');
  const ctxViewArtist = document.getElementById('ctx-view-artist');
  const ctxFavorite = document.getElementById('ctx-favorite');
  const ctxCopyId = document.getElementById('ctx-copy-id');

  const playlistModal = document.getElementById('playlist-select-modal');
  const playlistOptionsList = document.getElementById('playlist-options-list');
  const modalCreatePlaylistBtn = document.getElementById('modal-create-playlist-btn');
  const closePlaylistModal = document.getElementById('close-playlist-modal');

  const playlistsGrid = document.getElementById('playlists-grid');
  const playlistDetail = document.getElementById('playlist-detail');
  const playlistDetailTitle = document.getElementById('playlist-detail-title');
  const playlistTracksGrid = document.getElementById('playlist-tracks-grid');
  const playlistBackBtn = document.getElementById('playlist-back-btn');
  const createPlaylistBtn = document.getElementById('create-playlist-btn');

  // TTML Downloader Elements
  const fetchTtmlBtn = document.getElementById('fetch-ttml-btn');
  const ttmlSongIdInput = document.getElementById('ttml-song-id');
  const ttmlResultContainer = document.getElementById('ttml-result-preview');
  const ttmlPreviewName = document.getElementById('ttml-preview-name');
  const ttmlPreviewArtist = document.getElementById('ttml-preview-artist');
  const ttmlPreviewArt = document.getElementById('ttml-preview-art');
  const ttmlCodeBlock = document.getElementById('ttml-code-block');
  const ttmlStatus = document.getElementById('ttml-status');
  const downloadTtmlBtn = document.getElementById('download-ttml-file-btn');

  let currentFetchedTTML = null;
  let currentFetchedSong = null;
  let contextMenuTrack = null;

  let stagedAudio = [];
  let stagedTTML = [];

  // ── Zone Click ──
  if (ttmlZone) {
    ttmlZone.addEventListener('click', (e) => {
      if (e.target === ttmlInput) return;
      ttmlInput.click();
    });
  }

  if (audioZone) {
    audioZone.addEventListener('click', (e) => {
      if (e.target === audioInput) return;
      audioInput.click();
    });
  }

  // ── File Input Change ──
  if (ttmlInput) ttmlInput.addEventListener('change', (e) => handleTTMLFiles(Array.from(e.target.files)));
  if (audioInput) audioInput.addEventListener('change', (e) => handleAudioFiles(Array.from(e.target.files)));

  // ── Drag & Drop ──
  [ttmlZone, audioZone].forEach(zone => {
    if (!zone) return;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      if (zone === ttmlZone) handleTTMLFiles(files);
      else handleAudioFiles(files);
    });
  });

  function handleTTMLFiles(files) {
    const validFiles = files.filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ext === 'ttml' || ext === 'xml';
    });
    if (validFiles.length < files.length) showError('Skipped non-TTML files.');
    stagedTTML = [...stagedTTML, ...validFiles];
    matchAndRender();
  }

  function handleAudioFiles(files) {
    const audioExts = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'];
    const validAudio = [];
    files.forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (audioExts.includes(ext)) {
        validAudio.push({ file: f, ttmlFile: null });
      }
    });
    if (validAudio.length === 0 && files.length > 0) showError('No valid audio files found.');
    stagedAudio = [...stagedAudio, ...validAudio];
    matchAndRender();
  }

  function matchAndRender() {
    clearError();
    stagedAudio.forEach(item => {
      const baseName = item.file.name.replace(/\.[^/.]+$/, "");
      if (!item.ttmlFile) {
        const match = stagedTTML.find(tf => tf.name.replace(/\.[^/.]+$/, "") === baseName);
        if (match) item.ttmlFile = match;
      }
    });
    renderQueue();
    checkReady();
  }

  function renderQueue() {
    if (!queueList) return;
    queueList.innerHTML = '';
    if (stagedAudio.length > 0) {
      queuePreview.classList.add('active');
      queueCount.textContent = `${stagedAudio.length} track${stagedAudio.length > 1 ? 's' : ''}`;
    } else {
      queuePreview.classList.remove('active');
    }

    stagedAudio.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      el.draggable = true;
      el.dataset.index = index;

      let ttmlOptions = '<option value="">⏳ Auto-fetch lyrics</option>';
      stagedTTML.forEach((tf, tfIdx) => {
        const isSelected = item.ttmlFile === tf;
        ttmlOptions += `<option value="${tfIdx}" ${isSelected ? 'selected' : ''}>${escapeHTML(tf.name)}</option>`;
      });

      const safeName = escapeHTML(item.file.name);
      const safeArtist = escapeHTML(item.artist || 'Unknown Artist');

      el.innerHTML = `
        <div class="drag-handle">≡</div>
        <div class="queue-item-info">
          <span class="queue-item-name">${safeName}</span>
          <span class="queue-item-meta">${safeArtist}</span>
        </div>
        <div class="queue-pair-controls">
          <select class="ttml-select" data-index="${index}">
            ${ttmlOptions}
          </select>
          <button class="remove-item" data-index="${index}">✕</button>
        </div>
      `;
      queueList.appendChild(el);
    });

    queueList.querySelectorAll('.remove-item').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.closest('button').dataset.index, 10);
        stagedAudio.splice(idx, 1);
        matchAndRender();
      };
    });
  }

  function checkReady() {
    if (!startBtn) return;
    if (stagedAudio.length > 0) {
      startBtn.classList.add('enabled');
      startBtn.removeAttribute('disabled');
    } else {
      startBtn.classList.remove('enabled');
      startBtn.setAttribute('disabled', 'true');
    }
  }

  if (clearQueueBtn) {
    clearQueueBtn.onclick = () => {
      stagedAudio = [];
      stagedTTML = [];
      matchAndRender();
    };
  }

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (stagedAudio.length === 0) return;
      startBtn.disabled = true;

      try {
        await clearQueue();
        for (const item of stagedAudio) {
          const audioBuffer = await readFileAsArrayBuffer(item.file);
          const metadata = await parseAudioMetadata(audioBuffer, item.file.name);
          let ttmlContent = item.ttmlFile ? await readFileAsText(item.ttmlFile) : '__AUTO_FETCH__';

          await addTrackToQueue(audioBuffer, {
            name: metadata.title || item.file.name,
            artist: metadata.artist || 'Unknown Artist',
            artUrl: metadata.artUrl || null,
            type: item.file.type || 'audio/mpeg',
            ttml: ttmlContent
          });
        }
        setCurrentIndex(0);
        window.location.href = 'player.html';
      } catch (err) {
        showError('Failed to prepare queue: ' + err.message);
        startBtn.disabled = false;
      }
    });
  }

  // ── Navigation Tabs ──
  const navItems = document.querySelectorAll('.am-nav-item');
  const pages = document.querySelectorAll('.am-page');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.dataset.page;
      if (!pageId) return;

      navItems.forEach(i => i.classList.remove('am-nav-active'));
      document.querySelectorAll(`[data-page="${pageId}"]`).forEach(el => el.classList.add('am-nav-active'));

      pages.forEach(p => p.classList.remove('active'));
      const targetPage = document.getElementById(`page-${pageId}`);
      if (targetPage) targetPage.classList.add('active');

      if (pageId === 'listen') {
        clearSearchUI();
        loadLandingView();
      }
      if (pageId === 'playlists') renderPlaylistsPage();
      if (pageId === 'songs') renderFavoritesPage();
      if (pageId === 'recent') renderRecentPage();
    });
  });

  // ── Categories & Landing View (using Recommendations endpoint) ──
  async function loadLandingView() {
    renderRecentlySearched();
    fetchCategories();
  }

  async function fetchCategories() {
    if (!categoriesGrid) return;
    try {
      const res = await fetch(`${API_BASE}/recommendations?name=search-landing`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      
      const curators = data.resources?.['apple-curators'] || {};
      const categories = Object.values(curators);

      if (categories.length === 0) {
        categoriesGrid.innerHTML = `<p class="am-empty-msg">No browse categories available.</p>`;
        return;
      }

      categoriesGrid.innerHTML = categories.map(cat => {
        const name = cat.attributes?.name || 'Category';
        const artObj = cat.attributes?.artwork;
        const artUrl = artObj?.url ? artObj.url.replace('{w}', '400').replace('{h}', '250').replace('{f}', 'jpg').replace('{c}', 'cc') : '';
        const bgColor = artObj?.bgColor ? `#${artObj.bgColor}` : '#333';

        return `
          <div class="am-category-card" style="background-color: ${bgColor}" data-name="${escapeHTML(name)}">
            ${artUrl ? `<img src="${artUrl}" loading="lazy" alt="${escapeHTML(name)}" class="am-category-bg">` : ''}
            <span class="am-category-title">${escapeHTML(name)}</span>
          </div>
        `;
      }).join('');

      categoriesGrid.querySelectorAll('.am-category-card').forEach(card => {
        card.onclick = () => {
          const categoryName = card.dataset.name;
          if (catalogSearch) {
            catalogSearch.value = categoryName;
            performSearch(categoryName);
          }
        };
      });

    } catch (err) {
      console.warn("Failed to load categories:", err);
      categoriesGrid.innerHTML = `<p class="am-error-msg">Could not load browse categories.</p>`;
    }
  }

  // ── Recently Searched Local Storage Handling ──
  function getRecentSearches() {
    return JSON.parse(localStorage.getItem('spicy_recent_searches') || '[]');
  }

  function saveRecentSearch(item) {
    let recent = getRecentSearches();
    recent = recent.filter(r => r.id !== item.id);
    recent.unshift(item);
    if (recent.length > 8) recent.pop();
    localStorage.setItem('spicy_recent_searches', JSON.stringify(recent));
  }

  function renderRecentlySearched() {
    if (!recentlySearchedSection || !recentlySearchedGrid) return;
    const recent = getRecentSearches();

    if (recent.length === 0) {
      recentlySearchedSection.classList.add('hidden');
      return;
    }

    recentlySearchedSection.classList.remove('hidden');
    recentlySearchedGrid.innerHTML = recent.map(item => `
      <div class="am-recent-search-chip" data-id="${item.id}" data-type="${item.type}">
        <img src="${item.artUrl || 'favicon.svg'}" class="am-chip-art">
        <div class="am-chip-info">
          <div class="am-chip-title">${escapeHTML(item.title)}</div>
          <div class="am-chip-sub">${escapeHTML(item.sub || item.type)}</div>
        </div>
      </div>
    `).join('');

    recentlySearchedGrid.querySelectorAll('.am-recent-search-chip').forEach(chip => {
      chip.onclick = () => {
        const id = chip.dataset.id;
        const type = chip.dataset.type;
        if (type === 'song') loadTrackById(id);
        else if (type === 'album') fetchAlbumDetails(id);
        else if (type === 'artist') openArtistView(id, chip.querySelector('.am-chip-title').textContent);
      };
    });
  }

  if (clearRecentSearchesBtn) {
    clearRecentSearchesBtn.onclick = () => {
      localStorage.removeItem('spicy_recent_searches');
      renderRecentlySearched();
    };
  }

  // ── Search Handling ──
  let searchDebounceTimeout = null;

  if (catalogSearch) {
    catalogSearch.addEventListener('input', (e) => {
      const query = e.target.value;
      if (query.trim().length > 0) {
        if (searchClearBtn) searchClearBtn.classList.remove('hidden');
      } else {
        if (searchClearBtn) searchClearBtn.classList.add('hidden');
        clearSearchUI();
        return;
      }

      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        performSearch(query.trim());
      }, 400);
    });

    catalogSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimeout);
        performSearch(catalogSearch.value.trim());
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.onclick = () => {
      catalogSearch.value = '';
      searchClearBtn.classList.add('hidden');
      clearSearchUI();
    };
  }

  function clearSearchUI() {
    if (listenInitialContent) listenInitialContent.classList.remove('hidden');
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
    if (albumViewContainer) albumViewContainer.classList.add('hidden');
    if (artistViewContainer) artistViewContainer.classList.add('hidden');
  }

  async function performSearch(query) {
    if (!query) {
      clearSearchUI();
      return;
    }

    if (query.startsWith('/songid ')) {
      const id = query.replace('/songid ', '').trim();
      if (/^\d+$/.test(id)) {
        loadTrackById(id);
        return;
      }
    }

    listenInitialContent.classList.add('hidden');
    albumViewContainer.classList.add('hidden');
    artistViewContainer.classList.add('hidden');
    searchResultsContainer.classList.remove('hidden');

    resetSearchResultsSections();

    try {
      const res = await fetch(`${API_BASE}/search?term=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      renderCategorizedSearchResults(data.results || {});
    } catch (err) {
      console.error("Search API Error:", err);
      showError("Failed to perform search. Please try again.");
    }
  }

  function resetSearchResultsSections() {
    [sectionTopResults, sectionArtists, sectionSongs, sectionAlbums, sectionPlaylists, sectionVideos].forEach(sec => {
      if (sec) sec.classList.add('hidden');
    });
  }
// Helper: Format duration into hours and minutes or total minutes
function formatTotalAlbumDuration(seconds) {
  const totalMins = Math.round(seconds / 60);
  if (totalMins >= 60) {
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'}, ${mins} minutes`;
  }
  return `${totalMins} minutes`;
}

// Render Artist View with expandable bio and metadata
function renderArtistView(artistData) {
  const container = document.getElementById('artist-view-container');
  if (!container) return;

  const bioText = artistData.bio || "No description available.";
  const hometown = artistData.hometown || "Unknown";
  const born = artistData.born || "N/A";
  const genre = artistData.genre || "Pop";

  container.innerHTML = `
    <div class="am-artist-header" style="background-image: url('${artistData.headerImg || ''}')">
      <h1 class="am-artist-name-overlay">${artistData.name}</h1>
    </div>
    
    <div class="am-about-section">
      <h2 style="color: #fff; font-size: 20px; margin-bottom: 8px;">About</h2>
      <div class="am-about-text-container" id="artist-about-text">
        <p style="color: #d1d1d6; font-size: 14px;">${bioText}</p>
      </div>
      <button class="am-show-more-btn" id="about-toggle-btn">More</button>
      
      <div class="am-artist-meta-grid">
        <div class="am-meta-item">
          <label>Hometown</label>
          <span>${hometown}</span>
        </div>
        <div class="am-meta-item">
          <label>Born</label>
          <span>${born}</span>
        </div>
        <div class="am-meta-item">
          <label>Genre</label>
          <span>${genre}</span>
        </div>
      </div>
    </div>
  `;

  // Toggle truncated description
  const toggleBtn = document.getElementById('about-toggle-btn');
  const textContainer = document.getElementById('artist-about-text');
  
  toggleBtn.addEventListener('click', () => {
    const isExpanded = textContainer.classList.toggle('expanded');
    toggleBtn.textContent = isExpanded ? 'Less' : 'More';
  });
}

// Render Album Metadata, Track Count, Duration & Production Team
function renderAlbumFooter(albumData, tracks) {
  const footerContainer = document.getElementById('album-footer-info');
  if (!footerContainer) return;

  const totalSeconds = tracks.reduce((acc, track) => acc + (track.duration || 0), 0);
  const formattedDuration = formatTotalAlbumDuration(totalSeconds);
  const releaseDate = albumData.releaseDate ? new Date(albumData.releaseDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }) : 'Unknown Date';

  const productionTeam = albumData.productionTeam || albumData.copyright || 'Rotana Audiovisual';

  footerContainer.innerHTML = `
    <div>${releaseDate}</div>
    <div>${tracks.length} songs, ${formattedDuration}</div>
    <div>℗ ${productionTeam}</div>
  `;
}

// Render Floating Bottom Player Component
function renderBottomPlayer(track) {
  let playerEl = document.getElementById('am-bottom-player');
  if (!playerEl) {
    playerEl = document.createElement('div');
    playerEl.id = 'am-bottom-player';
    playerEl.className = 'am-bottom-player';
    document.body.appendChild(playerEl);
  }

  playerEl.innerHTML = `
    <div class="am-player-track-info">
      <img class="am-player-cover" src="${track.coverUrl || 'placeholder.jpg'}" alt="Cover" />
      <div class="am-player-details">
        <span class="am-player-title">${track.title}</span>
        <span style="font-size: 12px; color: #8e8e93;">${track.artist || ''}</span>
      </div>
    </div>
    <div class="am-player-controls">
      <button class="am-player-btn" id="am-play-pause-btn">❚❚</button>
      <button class="am-player-btn" id="am-next-btn">❯❯</button>
    </div>
  `;
}

// Handle Preview Playback directly inside index.html without navigating to player.html
// Updated Preview Queue function inside upload.js
function playPreviewAudioQueue(tracks) {
  if (!tracks || tracks.length === 0) return;

  if (window._activePreviewAudio) {
    window._activePreviewAudio.pause();
    window._activePreviewAudio = null;
  }

  let index = 0;

  function playTrack(idx) {
    if (idx >= tracks.length) return;
    const track = tracks[idx];
    const previewUrl = `${API_BASE}/download?song=${track.id}`;

    const audio = new Audio(previewUrl);
    window._activePreviewAudio = audio;

    // Render Floating Mini Player UI
    renderBottomPlayer({
      title: track.name || track.title,
      artist: track.artistName || track.artist || 'Unknown Artist',
      coverUrl: track.artUrl || 'favicon.svg'
    });

    // Register OS Media Session Controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name || track.title,
        artist: track.artistName || track.artist || 'Unknown Artist',
        artwork: [{ src: track.artUrl || 'favicon.svg', sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        audio.pause();
        if (index + 1 < tracks.length) playTrack(++index);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        audio.pause();
        if (index > 0) playTrack(--index);
      });
    }

    audio.play().catch(console.warn);

    // Playback state listeners
    audio.onplay = () => {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      const playBtn = document.getElementById('am-play-pause-btn');
      if (playBtn) playBtn.textContent = '❚❚';
    };

    audio.onpause = () => {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      const playBtn = document.getElementById('am-play-pause-btn');
      if (playBtn) playBtn.textContent = '▶';
    };

    audio.onended = () => {
      index++;
      if (index < tracks.length) playTrack(index);
    };
  }

  playTrack(index);
}


// Attach event listener to Preview Play Button
document.addEventListener('DOMContentLoaded', () => {
  const playBtn = document.getElementById('album-play-btn');
  
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (window.currentAlbumTracks && window.currentAlbumTracks.length > 0) {
        const trackIds = window.currentAlbumTracks.map(t => t.id);
        playPreviewAudioQueue(trackIds);
      }
    });
  }
});

  function renderCategorizedSearchResults(results) {
    // 1. Top Results
    if (results.top && results.top.data && results.top.data.length > 0) {
      sectionTopResults.classList.remove('hidden');
      topResultsGrid.innerHTML = results.top.data.slice(0, 6).map(item => {
        const attr = item.attributes || {};
        const isSong = item.type === 'songs';
        const isArtist = item.type === 'artists';
        const isAlbum = item.type === 'albums';

        const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '200').replace('{h}', '200') : 'favicon.svg';
        const title = attr.name || attr.trackName || 'Title';
        const artist = attr.artistName || (isSong ? 'Song' : isAlbum ? 'Album' : 'Artist');
        const lyricsSnippet = attr.hasLyrics ? 'Lyrics available' : '';

        return `
          <div class="am-top-result-card ${isArtist ? 'is-artist' : ''}" data-id="${item.id}" data-type="${item.type}">
            <img src="${artUrl}" loading="lazy" class="am-top-card-art">
            <div class="am-top-card-details">
              <div class="am-top-card-title">${escapeHTML(title)}</div>
              <div class="am-top-card-sub">${isSong ? 'Song • ' : isAlbum ? 'Album • ' : 'Artist '}${escapeHTML(artist)}</div>
              ${lyricsSnippet ? `<div class="am-top-card-lyrics">Lyrics: "${escapeHTML(lyricsSnippet)}"</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      topResultsGrid.querySelectorAll('.am-top-result-card').forEach(card => {
        card.onclick = (e) => {
          const id = card.dataset.id;
          const type = card.dataset.type;
          const title = card.querySelector('.am-top-card-title').textContent;
          const artUrl = card.querySelector('img').src;

          saveRecentSearch({ id, type: type === 'songs' ? 'song' : type === 'albums' ? 'album' : 'artist', title, artUrl });

          if (type === 'songs') loadTrackById(id);
          else if (type === 'albums') fetchAlbumDetails(id);
          else if (type === 'artists') openArtistView(id, title);
        };
      });
    }

    // 2. Artists
    if (results.artists && results.artists.data && results.artists.data.length > 0) {
      sectionArtists.classList.remove('hidden');
      artistsGrid.innerHTML = results.artists.data.map(artist => {
        const attr = artist.attributes || {};
        const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '200').replace('{h}', '200') : 'favicon.svg';

        return `
          <div class="am-artist-circle-card" data-id="${artist.id}" data-name="${escapeHTML(attr.name)}">
            <img src="${artUrl}" loading="lazy" class="am-artist-circle-img">
            <span class="am-artist-circle-name">${escapeHTML(attr.name)}</span>
          </div>
        `;
      }).join('');

      artistsGrid.querySelectorAll('.am-artist-circle-card').forEach(card => {
        card.onclick = () => openArtistView(card.dataset.id, card.dataset.name);
      });
    }

    // 3. Songs
    if (results.songs && results.songs.data && results.songs.data.length > 0) {
      sectionSongs.classList.remove('hidden');
      songsGrid.innerHTML = results.songs.data.map(song => {
        const attr = song.attributes || {};
        const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '120').replace('{h}', '120') : 'favicon.svg';

        return `
          <div class="am-song-row-item" data-id="${song.id}">
            <img src="${artUrl}" loading="lazy" class="am-song-row-art">
            <div class="am-song-row-info">
              <div class="am-song-row-title">${escapeHTML(attr.name)}</div>
              <div class="am-song-row-artist">${escapeHTML(attr.artistName)}</div>
              ${attr.hasTimeSyncedLyrics ? `<span class="am-lyrics-badge">SYNCED LYRICS</span>` : ''}
            </div>
            <button class="am-song-more-btn" data-id="${song.id}">•••</button>
          </div>
        `;
      }).join('');

      songsGrid.querySelectorAll('.am-song-row-item').forEach(row => {
        row.onclick = (e) => {
          if (e.target.classList.contains('am-song-more-btn')) {
            e.stopPropagation();
            const id = row.dataset.id;
            const songObj = results.songs.data.find(s => s.id === id);
            showContextMenu(e, mapApiSongToLocal(songObj));
            return;
          }
          loadTrackById(row.dataset.id);
        };
      });
    }

    // 4. Albums
    if (results.albums && results.albums.data && results.albums.data.length > 0) {
      sectionAlbums.classList.remove('hidden');
      albumsGrid.innerHTML = results.albums.data.map(album => {
        const attr = album.attributes || {};
        const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '300').replace('{h}', '300') : 'favicon.svg';

        return `
          <div class="am-standard-media-card" data-id="${album.id}">
            <img src="${artUrl}" loading="lazy" class="am-media-card-art">
            <div class="am-media-card-title">${escapeHTML(attr.name)}</div>
            <div class="am-media-card-sub">${escapeHTML(attr.artistName)}</div>
          </div>
        `;
      }).join('');

      albumsGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
        card.onclick = () => fetchAlbumDetails(card.dataset.id);
      });
    }

    // 5. Playlists
    if (results.playlists && results.playlists.data && results.playlists.data.length > 0) {
      sectionPlaylists.classList.remove('hidden');
      playlistsSearchGrid.innerHTML = results.playlists.data.map(pl => {
        const attr = pl.attributes || {};
        const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '300').replace('{h}', '300') : 'favicon.svg';

        return `
          <div class="am-standard-media-card" data-id="${pl.id}">
            <img src="${artUrl}" loading="lazy" class="am-media-card-art">
            <div class="am-media-card-title">${escapeHTML(attr.name)}</div>
            <div class="am-media-card-sub">${escapeHTML(attr.curatorName || 'Playlist')}</div>
          </div>
        `;
      }).join('');
    }
  }

function mapApiSongToLocal(song) {
  if (!song) return null;
  const attr = song.attributes || {};
  return {
    trackId: song.id,
    trackName: attr.name,
    artistName: attr.artistName,
    collectionName: attr.albumName,
    // Add albumId and artistId fallback mappings:
    albumId: song.relationships?.albums?.data?.[0]?.id || attr.albumId || null,
    artistId: song.relationships?.artists?.data?.[0]?.id || attr.artistId || null,
    artworkUrl100: attr.artwork?.url ? attr.artwork.url.replace('{w}', '100').replace('{h}', '100') : ''
  };
}

// ── Album Detail View (Fetching via /album?album= ID) ──
async function fetchAlbumDetails(albumId) {
  listenInitialContent.classList.add('hidden');
  searchResultsContainer.classList.add('hidden');
  artistViewContainer.classList.add('hidden');
  albumViewContainer.classList.remove('hidden');

  albumHeader.innerHTML = `<div class="am-loading-msg">Loading Album...</div>`;
  albumTracksGrid.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/album?album=${albumId}`);
    if (!res.ok) throw new Error(`Album fetch failed ${res.status}`);
    const data = await res.json();

    // The real catalog object lives at raw_data.data[0], not data.data[0]
    const albumObj = data.raw_data?.data?.[0] || data.data?.[0] || data.results?.albums?.data?.[0];
    if (!albumObj) throw new Error('Album not found in response');

    const attr = albumObj.attributes || {};
    const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600') : 'favicon.svg';
    const artistId = albumObj.relationships?.artists?.data?.[0]?.id || null;
    const artistName = attr.artistName || '';

    let videoUrl = null;
    try {
      const animRes = await fetch(`${API_BASE}/animatedart?album=${albumId}`);
      if (animRes.ok) {
        const animData = await animRes.json();
        videoUrl = animData.videoUrl || animData.url;
      }
    } catch (e) {
      console.warn("No animated art found:", e);
    }

    const year = attr.releaseDate ? new Date(attr.releaseDate).getFullYear() : '';
    const shortDesc = attr.editorialNotes?.short || '';
    const standardDesc = attr.editorialNotes?.standard || '';

    albumHeader.innerHTML = `
      <div class="am-album-art-container">
        ${videoUrl ? `<video src="${videoUrl}" autoplay loop muted playsinline class="am-album-cover"></video>` : `<img src="${artUrl}" class="am-album-cover">`}
      </div>
      <div class="am-album-details">
        <h2 class="am-album-title">${escapeHTML(attr.name || 'Album')}</h2>
        <div class="am-album-artist" id="album-artist-link" style="${artistId ? 'cursor:pointer;' : ''}">${escapeHTML(artistName)}</div>
        <div class="am-album-meta">${escapeHTML(attr.genreNames?.[0] || 'Music')} • ${year}</div>
        ${shortDesc ? `<p class="am-album-desc" id="album-desc-text">${escapeHTML(shortDesc)}${standardDesc && standardDesc !== shortDesc ? ` <span id="album-desc-more" style="color:#fa243c; cursor:pointer; font-weight:700;">MORE</span>` : ''}</p>` : ''}
        <button class="premium-btn primary" id="album-play-btn" style="border-radius:100px; padding:0 32px; height:44px; display:inline-flex; align-items:center; gap:8px; width:fit-content;">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
          <span>Preview</span>
        </button>
      </div>
    `;

    const descMoreBtn = document.getElementById('album-desc-more');
    if (descMoreBtn) {
      descMoreBtn.onclick = () => {
        const descEl = document.getElementById('album-desc-text');
        if (descEl) descEl.textContent = standardDesc.replace(/<[^>]*>/g, '');
      };
    }

    const artistLink = document.getElementById('album-artist-link');
    if (artistLink && artistId) {
      artistLink.onclick = () => openArtistView(artistId, artistName);
    }

    // Prefer the flattened parsed_tracks list; fall back to raw relationships
    const relTracks = albumObj.relationships?.tracks?.data || [];
    const tracks = (data.parsed_tracks && data.parsed_tracks.length > 0)
      ? data.parsed_tracks.map(t => ({
          id: t.id,
          name: t.title,
          artistName: t.artist,
          trackNumber: t.track_number,
          durationInMillis: t.duration_ms,
        }))
      : relTracks.map(t => ({
          id: t.id,
          name: t.attributes?.name,
          artistName: t.attributes?.artistName,
          trackNumber: t.attributes?.trackNumber,
          durationInMillis: t.attributes?.durationInMillis,
        }));

    albumTracksGrid.innerHTML = tracks.map((t, idx) => `
      <div class="am-track-row animate-fade" data-id="${t.id}">
         <div class="am-track-num">${t.trackNumber || idx + 1}</div>
         <div class="am-track-title">${escapeHTML(t.name || 'Unknown')}</div>
         <div class="am-track-duration">${millisToMinutesAndSeconds(t.durationInMillis)}</div>
         <button class="am-song-more-btn" data-id="${t.id}">•••</button>
      </div>
    `).join('');

    albumTracksGrid.querySelectorAll('.am-track-row').forEach(row => {
      row.onclick = (e) => {
        if (e.target.classList.contains('am-song-more-btn')) {
          e.stopPropagation();
          const id = row.dataset.id;
          const t = tracks.find(x => x.id === id);
          showContextMenu(e, {
            trackId: id,
            trackName: t?.name,
            artistName: t?.artistName || artistName,
            collectionName: attr.name,
            albumId,
            artistId,
            artworkUrl100: artUrl
          });
          return;
        }
        loadTrackById(row.dataset.id);
      };
    });
// Add footer rendering inside fetchAlbumDetails in upload.js
const albumRawAttr = albumObj.attributes || {};
const footerContainer = document.createElement('div');
footerContainer.id = 'album-footer-info';
footerContainer.className = 'am-album-footer-info';

renderAlbumFooter(
  {
    releaseDate: albumRawAttr.releaseDate,
    productionTeam: albumRawAttr.copyright || albumRawAttr.recordLabel
  },
  tracks.map(t => ({ duration: Math.floor((t.durationInMillis || 0) / 1000) }))
);

albumTracksGrid.after(document.getElementById('album-footer-info') || footerContainer);

    // REPLACE WITH THIS:
const playBtn = document.getElementById('album-play-btn');
if (playBtn && tracks.length > 0) {
  playBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.currentAlbumTracks = tracks;
    playPreviewAudioQueue(tracks.map(t => t.id));
  };
}
  } catch (err) {
    console.error(err);
    albumHeader.innerHTML = `<div class="am-error-msg">Failed to load album details.</div>`;
  }
}

// ── Open Artist View ──
// Replace openArtistView in upload.js
async function openArtistView(artistId, artistName) {
  listenInitialContent.classList.add('hidden');
  searchResultsContainer.classList.add('hidden');
  albumViewContainer.classList.add('hidden');
  artistViewContainer.classList.remove('hidden');

  artistViewContent.innerHTML = `<div class="am-loading-msg">Fetching Artist Profile...</div>`;

  try {
    const res = await fetch(`${API_BASE}/artist?artist=${artistId}`);
    if (!res.ok) throw new Error(`Artist fetch failed ${res.status}`);
    const data = await res.json();

    // Correctly extract artist data from array or root object
    const artistObj = Array.isArray(data.data) ? data.data[0] : (data.data || data);
    if (!artistObj || !artistObj.attributes) throw new Error('Artist data invalid');

    const attr = artistObj.attributes;
    const displayName = attr.name || artistName;
    const artistPhoto = attr.artwork?.url
      ? attr.artwork.url.replace('{w}', '1200').replace('{h}', '800')
      : 'favicon.svg';
      
    const bioText = attr.artistBio || attr.editorialNotes?.standard || "No description available.";
    const genre = attr.genreNames?.[0] || "Music";

    // Extract Albums from Relationships
    const albumRefs = artistObj.relationships?.albums?.data || [];
    const albumIds = albumRefs.slice(0, 12).map(a => a.id);

    const albumResponses = await Promise.all(albumIds.map(id =>
      fetch(`${API_BASE}/album?album=${id}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
    ));

    const albums = albumResponses
      .map(d => d?.raw_data?.data?.[0] || d?.data?.[0])
      .filter(Boolean);

    const albumsHTML = albums.map(a => {
      const aAttr = a.attributes || {};
      const art = aAttr.artwork?.url ? aAttr.artwork.url.replace('{w}', '300').replace('{h}', '300') : 'favicon.svg';
      const y = aAttr.releaseDate ? new Date(aAttr.releaseDate).getFullYear() : '';
      return `
        <div class="am-standard-media-card" data-id="${a.id}">
          <img src="${art}" loading="lazy" class="am-media-card-art">
          <div class="am-media-card-title">${escapeHTML(aAttr.name || '')}</div>
          <div class="am-media-card-sub">${y}</div>
        </div>
      `;
    }).join('');

    artistViewContent.innerHTML = `
       <div class="am-artist-header" style="background-image: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(18,18,18,1) 100%), url('${artistPhoto}'); background-size: cover; background-position: center; min-height: 240px; border-radius: 16px; margin-bottom: 20px;">
          <div class="am-artist-name-row" style="padding: 20px;">
              <h1 class="am-artist-name" style="color: #fff; font-size: 2rem; font-weight: 800;">${escapeHTML(displayName)}</h1>
          </div>
       </div>

       <div class="am-about-section">
          <h3 style="color: #fff; font-size: 18px; margin-bottom: 8px;">About</h3>
          <div class="am-about-text-container" id="artist-about-text">
            <p style="color: #d1d1d6; font-size: 14px;">${escapeHTML(bioText.replace(/<[^>]*>/g, ''))}</p>
          </div>
          <div class="am-artist-meta-grid">
            <div class="am-meta-item">
              <label>Genre</label>
              <span>${escapeHTML(genre)}</span>
            </div>
          </div>
       </div>

       <div class="am-search-section" style="margin-top:30px;">
          <h3 class="am-search-section-title">Albums</h3>
          <div class="am-cards-horizontal-scroll">${albumsHTML || '<p class="am-empty-msg">No albums found</p>'}</div>
       </div>
    `;

    artistViewContent.querySelectorAll('.am-standard-media-card').forEach(card => {
      card.onclick = () => fetchAlbumDetails(card.dataset.id);
    });

  } catch (err) {
    console.error(err);
    artistViewContent.innerHTML = `<div class="am-error-msg">Failed to load artist details: ${err.message}</div>`;
  }
}


  // ── Remote Track Load & Decryption Stream ──
  async function loadRemoteTrack(song) {
    if (!prepOverlay) return;

    addToRecent(song);

    prepOverlay.classList.add('active');
    prepStatus.textContent = "Downloading & Decrypting Track...";

    try {
      const audioUrl = `${API_BASE}/download?song=${song.trackId}`;
      const response = await robustFetch(audioUrl, { skipProxy: true });
      const audioBuffer = await response.arrayBuffer();

      prepStatus.textContent = "Processing Metadata...";

      const metadata = {
        name: song.trackName,
        artist: song.artistName,
        album: song.collectionName,
        artUrl: song.artworkUrl100 ? song.artworkUrl100.replace('100x100', '600x600') : 'favicon.svg',
        type: isMP4Buffer(audioBuffer) ? 'audio/mp4' : 'audio/mpeg',
        ttml: '__AUTO_FETCH__',
        amTrackId: song.trackId
      };

      await clearQueue();
      await addTrackToQueue(audioBuffer, metadata);

      setCurrentIndex(0);
      window.location.href = 'player.html';

    } catch (err) {
      console.error("Remote load failed:", err);
      prepOverlay.classList.remove('active');
      alert(`Error loading track: ${err.message}`);
    }
  }

  async function loadTrackById(id) {
    if (!prepOverlay) return;
    
    prepOverlay.classList.add('active');
    prepStatus.textContent = "Fetching metadata...";
    
    try {
      const res = await fetch(`${API_BASE}/song?song=${id}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      
      const songData = data.data?.[0] || data.results?.songs?.data?.[0];
      if (!songData) throw new Error("Track ID not found");

      const attr = songData.attributes || {};
      const song = {
        trackId: songData.id,
        trackName: attr.name,
        artistName: attr.artistName,
        collectionName: attr.albumName,
        artworkUrl100: attr.artwork?.url ? attr.artwork.url.replace('{w}', '100').replace('{h}', '100') : ''
      };

      loadRemoteTrack(song);
    } catch (err) {
      console.error("[ID Loader] Failed:", err);
      prepOverlay.classList.remove('active');
      alert(`Could not load track ${id}: ${err.message}`);
    }
  }

  // ── Context Menu ──
  function showContextMenu(e, song) {
    if (!song) return;
    e.preventDefault();
    contextMenuTrack = song;
    songContextMenu.style.left = `${e.clientX}px`;
    songContextMenu.style.top = `${e.clientY}px`;
    songContextMenu.classList.remove('hidden');

    const closeMenu = () => {
      songContextMenu.classList.add('hidden');
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
  }

  if (ctxPlay) ctxPlay.onclick = () => { if (contextMenuTrack) loadRemoteTrack(contextMenuTrack); };
if (ctxViewAlbum) {
  ctxViewAlbum.onclick = () => {
    const targetAlbumId = contextMenuTrack?.albumId || contextMenuTrack?.collectionId;
    if (targetAlbumId) {
      fetchAlbumDetails(targetAlbumId);
    } else {
      alert("Album ID not available for this track.");
    }
  };
}

if (ctxViewArtist) {
  ctxViewArtist.onclick = () => {
    const targetArtistId = contextMenuTrack?.artistId;
    const targetArtistName = contextMenuTrack?.artistName;
    if (targetArtistId && targetArtistName) {
      openArtistView(targetArtistId, targetArtistName);
    }
  };
}


  if (ctxCopyId) {
    ctxCopyId.onclick = () => {
      if (contextMenuTrack) {
        const id = contextMenuTrack.trackId || contextMenuTrack.id;
        navigator.clipboard?.writeText(id.toString()).then(() => alert(`Song ID ${id} copied!`));
      }
    };
  }

  // ── TTML Downloader Logic ──
  if (fetchTtmlBtn) {
    fetchTtmlBtn.onclick = async () => {
      const songId = ttmlSongIdInput.value.trim();
      if (!songId) return;

      fetchTtmlBtn.disabled = true;
      ttmlStatus.textContent = 'Extracting TTML...';

      try {
        const metadata = await TTMLDownloader.fetchMetadata(songId);
        currentFetchedSong = metadata;
        
        ttmlPreviewName.textContent = metadata.name;
        ttmlPreviewArtist.textContent = metadata.artist;
        ttmlPreviewArt.src = metadata.artUrl;

        const ttml = await TTMLDownloader.fetchTTML(songId);
        if (!ttml) throw new Error('No TTML lyrics available.');

        currentFetchedTTML = ttml;
        ttmlCodeBlock.textContent = ttml;
        ttmlResultContainer.classList.remove('hidden');
        downloadTtmlBtn.disabled = false;
        ttmlStatus.textContent = 'Lyrics successfully extracted!';
      } catch (err) {
        ttmlStatus.textContent = err.message;
      } finally {
        fetchTtmlBtn.disabled = false;
      }
    };
  }

  if (downloadTtmlBtn) {
    downloadTtmlBtn.onclick = () => {
      if (!currentFetchedTTML || !currentFetchedSong) return;
      const filename = `${currentFetchedSong.name} - ${currentFetchedSong.artist}.ttml`;
      TTMLDownloader.download(filename, currentFetchedTTML);
    };
  }

  // ── Helper Utilities ──
  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      setTimeout(() => clearError(), 5000);
    }
  }

  function clearError() {
    if (errorEl) errorEl.textContent = '';
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e.target.error);
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e.target.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function isMP4Buffer(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 12) return false;
    return view.getUint8(4) === 0x66 && view.getUint8(5) === 0x74 && view.getUint8(6) === 0x79 && view.getUint8(7) === 0x70;
  }

  function millisToMinutesAndSeconds(millis) {
    if (!millis) return "0:00";
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
  }

  function addToRecent(track) {
    let recent = JSON.parse(localStorage.getItem('spicy_recent_tracks') || '[]');
    recent = recent.filter(t => (t.trackId || t.id) !== (track.trackId || track.id));
    recent.unshift(track);
    if (recent.length > 20) recent.pop();
    localStorage.setItem('spicy_recent_tracks', JSON.stringify(recent));
  }

  // Initial Landing View Load
  loadLandingView();
});
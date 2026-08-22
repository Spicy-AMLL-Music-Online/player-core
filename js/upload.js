import { addTrackToQueue, clearQueue, setCurrentIndex, getPlaylists, createPlaylist, addTrackToPlaylist, getPlaylistTracks, deletePlaylist, updatePlaylistTrack, findTrackInPlaylist } from './router.js';
import { parseAudioMetadata } from './metadata-parser.js';
import { robustFetch } from './network-utils.js';
import { TTMLDownloader } from './ttml-downloader.js';
import isRtl from './is-rtl.js';
import { escapeHTML } from './security-utils.js';
import { t, getCurrentLang, setLanguage, applyDOMTranslations, formatLocalizedDate, formatLocalizedYear } from './i18n.js';
import { checkFirstTimeSetup, getUserProfile, openProfileSettingsModal, updateProfileUI } from './user-profile.js';
import { hasListenedSongs, generateTopPicks, getRecentlyPlayed10, generate90Recommendations } from './algorithm.js';
import {
  addSongToLibrary,
  removeSongFromLibrary,
  isSongInLibrary,
  addAlbumToLibrary,
  removeAlbumFromLibrary,
  isAlbumInLibrary,
  addArtistToLibrary,
  removeArtistFromLibrary,
  isArtistInLibrary,
  getLibrarySongs,
  getLibraryAlbums,
  getLibraryArtists,
  getRecentlyAdded
} from './library-manager.js';
import { previewPlayer } from './preview-player.js';

const API_BASE = "https://spicyamllplayer-api.hf.space";

function cleanArtworkUrl(url, w = 300, h = 300) {
  if (!url) return 'favicon.svg';
  return url
    .replace('{w}', String(w))
    .replace('{h}', String(h))
    .replace('{c}', '')
    .replace('{f}', 'jpg');
}

document.addEventListener('DOMContentLoaded', () => {
  // First-time setup assistant check & Profile init
  checkFirstTimeSetup();
  updateProfileUI();

  // Profile button click events (desktop and mobile)
  const userProfileBtn = document.getElementById('user-profile-btn');
  const mobileUserProfileBtn = document.getElementById('mobile-user-profile-btn');
  if (userProfileBtn) userProfileBtn.addEventListener('click', openProfileSettingsModal);
  if (mobileUserProfileBtn) mobileUserProfileBtn.addEventListener('click', openProfileSettingsModal);

  window.addEventListener('spicy-profile-updated', () => {
    updateProfileUI();
    const profile = getUserProfile();
    const homeGreetingHeading = document.getElementById('home-greeting-heading');
    if (homeGreetingHeading) {
      homeGreetingHeading.textContent = `${t('home_welcome', { name: profile.name })} 👋`;
    }
    const homeGreetingTitle = document.getElementById('home-recommended-title');
    if (homeGreetingTitle) {
      homeGreetingTitle.textContent = t('home_recommended_for', { name: profile.name });
    }
  });

  window.addEventListener('spicy-lang-changed', () => {
    applyDOMTranslations();
    updateSidebarPlaylists();
    updateProfileUI();
  });

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
  const ctxAddLib = document.getElementById('ctx-add-library');
  const ctxAddPlaylist = document.getElementById('ctx-add-playlist');
  const ctxViewAlbum = document.getElementById('ctx-view-album');
  const ctxViewArtist = document.getElementById('ctx-view-artist');
  const ctxFavorite = document.getElementById('ctx-favorite');
  const ctxCopyId = document.getElementById('ctx-copy-id');

  // Mobile Context Modal
  const mobileContextModal = document.getElementById('mobile-context-modal');
  const mobModalArt = document.getElementById('mob-modal-art');
  const mobModalTitle = document.getElementById('mob-modal-title');
  const mobModalSub = document.getElementById('mob-modal-sub');
  const mobModalCloseBtn = document.getElementById('mob-modal-close-btn');
  const mobCtxPlay = document.getElementById('mob-ctx-play');
  const mobCtxAddLib = document.getElementById('mob-ctx-add-lib');
  const mobCtxLibLabel = document.getElementById('mob-ctx-lib-label');
  const mobCtxAddPlaylist = document.getElementById('mob-ctx-add-playlist');
  const mobCtxViewAlbum = document.getElementById('mob-ctx-view-album');
  const mobCtxViewArtist = document.getElementById('mob-ctx-view-artist');
  const mobCtxFavorite = document.getElementById('mob-ctx-favorite');
  const mobCtxFavLabel = document.getElementById('mob-ctx-fav-label');
  const mobCtxCopyId = document.getElementById('mob-ctx-copy-id');

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

  // Remote playlist detail view (Apple Music playlists from search results)
  const playlistViewContainer = document.getElementById('playlist-view-container');
  const playlistViewContent = document.getElementById('playlist-view-content');

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
    const audioExts = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'mp4', 'm4b', 'opus', 'webm'];
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

    stagedAudio.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'queue-item';

      const info = document.createElement('div');
      info.className = 'queue-info';
      info.innerHTML = `
        <span class="queue-title">${escapeHTML(item.file.name)}</span>
        <span class="queue-status ${item.ttmlFile ? 'has-ttml' : 'no-ttml'}">
          ${item.ttmlFile ? '✓ TTML Attached' : '⚡ Auto-fetch lyrics on play'}
        </span>
      `;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'queue-remove-btn';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        stagedAudio.splice(index, 1);
        matchAndRender();
      };

      row.appendChild(info);
      row.appendChild(removeBtn);
      queueList.appendChild(row);
    });

    if (queueCount) queueCount.textContent = `${stagedAudio.length} tracks`;
    if (queuePreview) {
      if (stagedAudio.length > 0) queuePreview.classList.add('visible');
      else queuePreview.classList.remove('visible');
    }
  }

  function checkReady() {
    if (startBtn) startBtn.disabled = (stagedAudio.length === 0);
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
      if (prepOverlay) {
        prepOverlay.classList.add('active');
        prepStatus.textContent = "Processing Queue...";
      }

      try {
        await clearQueue();

        for (let i = 0; i < stagedAudio.length; i++) {
          const item = stagedAudio[i];
          if (prepStatus) prepStatus.textContent = `Reading ${i + 1}/${stagedAudio.length}: ${item.file.name}...`;

          const audioBuffer = await readFileAsArrayBuffer(item.file);
          let ttmlContent = null;
          if (item.ttmlFile) {
            ttmlContent = await readFileAsText(item.ttmlFile);
          } else {
            ttmlContent = '__AUTO_FETCH__';
          }

          let metadata = { name: item.file.name, artist: 'Unknown Artist', album: null, type: item.file.type || 'audio/mpeg' };
          try {
            const parsed = await parseAudioMetadata(audioBuffer, item.file.type);
            metadata = { ...metadata, ...parsed };
          } catch (e) {
            console.warn("Local parse failed, fallback:", e);
          }

          metadata.ttml = ttmlContent;
          await addTrackToQueue(audioBuffer, metadata);
        }

        setCurrentIndex(0);
        window.location.href = 'player.html';

      } catch (err) {
        showError('Failed to prepare queue: ' + err.message);
        startBtn.disabled = false;
        if (prepOverlay) prepOverlay.classList.remove('active');
      }
    });
  }

  // ── Navigation & Page Management ──
  const navItems = document.querySelectorAll('.am-sidebar-nav .am-nav-item');
  const mobNavBtns = document.querySelectorAll('.am-mob-nav-btn');
  const pages = document.querySelectorAll('.am-page');

  function switchPage(pageId) {
    if (!pageId) return;

    // Update sidebar nav items
    navItems.forEach(i => {
      if (i.dataset.page === pageId) i.classList.add('am-nav-active');
      else i.classList.remove('am-nav-active');
    });

    // Update mobile bottom nav
    mobNavBtns.forEach(btn => {
      if (btn.dataset.page === pageId) btn.classList.add('am-mob-active');
      else btn.classList.remove('am-mob-active');
    });

    // Hide all pages, show target page
    pages.forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');

    // Page-specific loaders
    if (pageId === 'home') renderHomePage();
    if (pageId === 'listen') {
      clearSearchUI();
      loadLandingView();
    }
    if (pageId === 'recently-added') renderRecentlyAddedPage();
    if (pageId === 'library-hub') renderLibraryHubPage();
    if (pageId === 'library-artists') renderLibraryArtistsPage();
    if (pageId === 'library-albums') renderLibraryAlbumsPage();
    if (pageId === 'playlists') renderPlaylistsPage();
    if (pageId === 'songs') renderFavoritesPage();
    if (pageId === 'recent') renderRecentPage();
  }

  // Attach nav item clicks
  navItems.forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  mobNavBtns.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  // Library Hub Pill clicks
  document.querySelectorAll('.am-hub-pill-btn').forEach(pill => {
    pill.addEventListener('click', () => {
      const target = pill.dataset.target;
      if (target) switchPage(target);
    });
  });

  // ── Show Detail Views Helpers (Clean View Transitions) ──
  function showAlbumView(albumId) {
    if (!albumId) return;
    pages.forEach(p => p.classList.remove('active'));
    const listenPage = document.getElementById('page-listen');
    if (listenPage) listenPage.classList.add('active');

    navItems.forEach(i => {
      if (i.dataset.page === 'listen') i.classList.add('am-nav-active');
      else i.classList.remove('am-nav-active');
    });
    mobNavBtns.forEach(btn => {
      if (btn.dataset.page === 'listen') btn.classList.add('am-mob-active');
      else btn.classList.remove('am-mob-active');
    });

    fetchAlbumDetails(albumId);
  }

  function showArtistView(artistId, artistName) {
    if (!artistId) return;
    pages.forEach(p => p.classList.remove('active'));
    const listenPage = document.getElementById('page-listen');
    if (listenPage) listenPage.classList.add('active');

    navItems.forEach(i => {
      if (i.dataset.page === 'listen') i.classList.add('am-nav-active');
      else i.classList.remove('am-nav-active');
    });
    mobNavBtns.forEach(btn => {
      if (btn.dataset.page === 'listen') btn.classList.add('am-mob-active');
      else btn.classList.remove('am-mob-active');
    });

    openArtistView(artistId, artistName);
  }

  function showRemotePlaylistView(playlistId, playlistName) {
    if (!playlistId) return;
    pages.forEach(p => p.classList.remove('active'));
    const listenPage = document.getElementById('page-listen');
    if (listenPage) listenPage.classList.add('active');

    navItems.forEach(i => {
      if (i.dataset.page === 'listen') i.classList.add('am-nav-active');
      else i.classList.remove('am-nav-active');
    });
    mobNavBtns.forEach(btn => {
      if (btn.dataset.page === 'listen') btn.classList.add('am-mob-active');
      else btn.classList.remove('am-mob-active');
    });

    openRemotePlaylistView(playlistId, playlistName);
  }

  // ── Smart Algorithm & Home Page ──
  function syncHomeNavVisibility() {
    const hasHistory = hasListenedSongs();
    const homeNavItem = document.getElementById('nav-item-home');
    const mobHomeBtn = document.getElementById('mob-nav-home');

    if (hasHistory) {
      if (homeNavItem) homeNavItem.classList.remove('hidden');
      if (mobHomeBtn) mobHomeBtn.classList.remove('hidden');
    } else {
      if (homeNavItem) homeNavItem.classList.add('hidden');
      if (mobHomeBtn) mobHomeBtn.classList.add('hidden');
    }
  }

  async function renderHomePage() {
    const topPicksContainer = document.getElementById('home-top-picks-scroll');
    const recentContainer = document.getElementById('home-recent-scroll');
    const recommendedGrid = document.getElementById('home-recommended-grid');
    const profile = getUserProfile();

    const homeGreetingHeading = document.getElementById('home-greeting-heading');
    if (homeGreetingHeading) {
      homeGreetingHeading.textContent = `${t('home_welcome', { name: profile.name })} 👋`;
    }

    const homeGreetingTitle = document.getElementById('home-recommended-title');
    if (homeGreetingTitle) {
      homeGreetingTitle.textContent = t('home_recommended_for', { name: profile.name });
    }

    // 1. Top Picks for You (1 latest song + 10 mix)
    if (topPicksContainer) {
      topPicksContainer.innerHTML = `<div class="am-loading-msg">${t('loading')}</div>`;
      try {
        const picks = await generateTopPicks();
        if (picks.length === 0) {
          topPicksContainer.innerHTML = `<p class="am-empty-msg">${t('empty_picks')}</p>`;
        } else {
          topPicksContainer.innerHTML = picks.map((item, i) => `
            <div class="am-standard-media-card animate-fade" data-type="${item.type}" data-id="${item.id}" data-idx="${i}">
              <div style="position: relative;">
                <img src="${cleanArtworkUrl(item.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art ${item.type === 'artist' ? 'artist-circle' : ''}" onerror="this.src='favicon.svg'">
                ${item.isLatest ? `<span class="am-media-badge-tag">${t('home_latest_played')}</span>` : ''}
              </div>
              <div class="am-media-card-title">${escapeHTML(item.title)}</div>
              <div class="am-media-card-sub">${escapeHTML(item.subtitle)}</div>
            </div>
          `).join('');

          topPicksContainer.querySelectorAll('.am-standard-media-card').forEach(card => {
            card.onclick = () => {
              const type = card.dataset.type;
              const id = card.dataset.id;
              const idx = parseInt(card.dataset.idx, 10);
              const pick = picks[idx];
              if (type === 'song') {
                loadRemoteTrack({
                  trackId: id,
                  trackName: pick.title,
                  artistName: pick.subtitle,
                  collectionName: pick.album || '',
                  albumId: pick.albumId || null,
                  artistId: pick.artistId || null,
                  artworkUrl100: pick.artUrl
                });
              } else if (type === 'album') {
                showAlbumView(id);
              } else if (type === 'artist') {
                showArtistView(id, pick.title);
              }
            };
          });
        }
      } catch (e) {
        topPicksContainer.innerHTML = `<p class="am-error-msg">${t('error')}</p>`;
      }
    }

    // 2. Recently Played (up to 10 with back icon to full recent page)
    if (recentContainer) {
      const recent10 = getRecentlyPlayed10();
      if (recent10.length === 0) {
        recentContainer.innerHTML = `<p class="am-empty-msg">${t('recent_empty')}</p>`;
      } else {
        recentContainer.innerHTML = recent10.map((song, i) => `
          <div class="am-standard-media-card animate-fade" data-id="${song.id}" data-idx="${i}">
            <img src="${cleanArtworkUrl(song.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(song.title)}</div>
            <div class="am-media-card-sub">${escapeHTML(song.artist)}</div>
          </div>
        `).join('');

        recentContainer.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            const idx = parseInt(card.dataset.idx, 10);
            const song = recent10[idx];
            if (song) {
              loadRemoteTrack({
                trackId: song.id,
                trackName: song.title,
                artistName: song.artist,
                collectionName: song.album,
                albumId: song.albumId || null,
                artistId: song.artistId || null,
                artworkUrl100: song.artUrl
              });
            }
          };
        });
      }
    }

    // Link heading click to full recent list
    const homeRecentHeader = document.getElementById('home-recent-header');
    if (homeRecentHeader) {
      homeRecentHeader.onclick = () => switchPage('recent');
    }

    // 3. Recommended for {Name} (90 recommendations)
    if (recommendedGrid) {
      try {
        const rec90 = await generate90Recommendations();
        if (rec90.length === 0) {
          recommendedGrid.innerHTML = `<p class="am-empty-msg">${t('empty_recommendations')}</p>`;
        } else {
          recommendedGrid.innerHTML = rec90.map((item, i) => `
            <div class="am-standard-media-card animate-fade" data-type="${item.type}" data-id="${item.id}" data-idx="${i}">
              <div style="position: relative;">
                <img src="${cleanArtworkUrl(item.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art ${item.type === 'artist' ? 'artist-circle' : ''}" onerror="this.src='favicon.svg'">
                <button class="am-card-3dots-btn" data-id="${item.id}" data-idx="${i}">•••</button>
              </div>
              <div class="am-media-card-title">${escapeHTML(item.title)}</div>
              <div class="am-media-card-sub">${escapeHTML(item.subtitle)}</div>
            </div>
          `).join('');

          recommendedGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
            card.onclick = (e) => {
              const idx = parseInt(card.dataset.idx, 10);
              const item = rec90[idx];
              if (!item) return;

              if (e.target.classList.contains('am-card-3dots-btn')) {
                e.stopPropagation();
                showContextMenu(e, {
                  trackId: item.id,
                  trackName: item.title,
                  artistName: item.subtitle,
                  collectionName: item.album || '',
                  albumId: item.albumId || null,
                  artistId: item.artistId || null,
                  artworkUrl100: item.artUrl
                });
                return;
              }

              if (item.type === 'song') {
                loadRemoteTrack({
                  trackId: item.id,
                  trackName: item.title,
                  artistName: item.subtitle,
                  collectionName: item.album || '',
                  albumId: item.albumId || null,
                  artistId: item.artistId || null,
                  artworkUrl100: item.artUrl
                });
              } else if (item.type === 'album') {
                showAlbumView(item.id);
              } else if (item.type === 'artist') {
                showArtistView(item.id, item.title);
              }
            };
          });
        }
      } catch (e) {
        recommendedGrid.innerHTML = `<p class="am-error-msg">${t('error')}</p>`;
      }
    }
  }

  // ── Recently Added Page ──
  async function renderRecentlyAddedPage() {
    const mixGrid = document.getElementById('recently-added-mix-grid');
    const songsGrid = document.getElementById('recently-added-songs-grid');
    const albumsGrid = document.getElementById('recently-added-albums-grid');
    const artistsGrid = document.getElementById('recently-added-artists-grid');

    // 1. Top Section: Big Grid of all items
    if (mixGrid) {
      const items = await getRecentlyAdded(60);
      if (items.length === 0) {
        mixGrid.innerHTML = `<p class="am-empty-msg" data-i18n="rec_added_empty">${t('rec_added_empty')}</p>`;
      } else {
        mixGrid.innerHTML = items.map((item, i) => {
          const itemTypeLabel = item.itemType === 'artist' ? t('badge_artist') :
                                item.itemType === 'album' ? t('badge_album') :
                                item.itemType === 'playlist' ? t('badge_playlist') :
                                t('badge_song');
          return `
            <div class="am-standard-media-card animate-fade" data-type="${item.itemType}" data-id="${item.id}" data-idx="${i}">
              <div style="position: relative;">
                <img src="${cleanArtworkUrl(item.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art ${item.itemType === 'artist' ? 'artist-circle' : ''}" onerror="this.src='favicon.svg'">
                <span class="am-media-badge-tag">${itemTypeLabel}</span>
              </div>
              <div class="am-media-card-title">${escapeHTML(item.name)}</div>
              <div class="am-media-card-sub">${escapeHTML(item.artist || '')}</div>
            </div>
          `;
        }).join('');

        mixGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            const idx = parseInt(card.dataset.idx, 10);
            const it = items[idx];
            if (!it) return;
            if (it.itemType === 'song') {
              loadRemoteTrack({
                trackId: it.id,
                trackName: it.name,
                artistName: it.artist,
                collectionName: it.album || '',
                albumId: it.albumId || null,
                artistId: it.artistId || null,
                artworkUrl100: it.artUrl
              });
            } else if (it.itemType === 'album') {
              showAlbumView(it.id);
            } else if (it.itemType === 'artist') {
              showArtistView(it.id, it.name);
            } else if (it.itemType === 'playlist') {
              switchPage('playlists');
              openLocalPlaylistDetail(it.id);
            }
          };
        });
      }
    }

    // 2. Songs
    if (songsGrid) {
      const songs = getLibrarySongs();
      if (songs.length === 0) {
        songsGrid.innerHTML = `<p class="am-empty-msg">${t('empty_library')}</p>`;
      } else {
        songsGrid.innerHTML = songs.map((s, i) => `
          <div class="am-song-row-item animate-fade" data-id="${s.id}" data-idx="${i}">
            <div class="am-song-row-num">${i + 1}</div>
            <img src="${cleanArtworkUrl(s.artUrl, 100, 100)}" loading="lazy" referrerpolicy="no-referrer" class="am-song-row-art" onerror="this.src='favicon.svg'">
            <div class="am-song-row-info">
              <div class="am-song-row-title">${escapeHTML(s.name)}</div>
              <div class="am-song-row-artist">${escapeHTML(s.artist)}</div>
            </div>
            <button class="am-song-more-btn" data-id="${s.id}" data-idx="${i}">•••</button>
          </div>
        `).join('');

        songsGrid.querySelectorAll('.am-song-row-item').forEach(row => {
          row.onclick = (e) => {
            const idx = parseInt(row.dataset.idx, 10);
            const song = songs[idx];
            if (e.target.classList.contains('am-song-more-btn')) {
              e.stopPropagation();
              showContextMenu(e, {
                trackId: song.id,
                trackName: song.name,
                artistName: song.artist,
                collectionName: song.album,
                albumId: song.albumId || null,
                artistId: song.artistId || null,
                artworkUrl100: song.artUrl
              });
              return;
            }
            loadRemoteTrack({
              trackId: song.id,
              trackName: song.name,
              artistName: song.artist,
              collectionName: song.album,
              albumId: song.albumId || null,
              artistId: song.artistId || null,
              artworkUrl100: song.artUrl
            });
          };
        });
      }
    }

    // 3. Albums
    if (albumsGrid) {
      const albums = getLibraryAlbums();
      if (albums.length === 0) {
        albumsGrid.innerHTML = `<p class="am-empty-msg">${t('empty_library')}</p>`;
      } else {
        albumsGrid.innerHTML = albums.map((a, i) => `
          <div class="am-standard-media-card animate-fade" data-id="${a.id}" data-idx="${i}">
            <img src="${cleanArtworkUrl(a.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(a.name)}</div>
            <div class="am-media-card-sub">${escapeHTML(a.artist)}</div>
          </div>
        `).join('');

        albumsGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            const idx = parseInt(card.dataset.idx, 10);
            const alb = albums[idx];
            if (alb) {
              showAlbumView(alb.id);
            }
          };
        });
      }
    }

    // 4. Artists
    if (artistsGrid) {
      const artists = getLibraryArtists();
      if (artists.length === 0) {
        artistsGrid.innerHTML = `<p class="am-empty-msg">${t('empty_library')}</p>`;
      } else {
        artistsGrid.innerHTML = artists.map((art, i) => `
          <div class="am-standard-media-card animate-fade" data-id="${art.id}" data-idx="${i}">
            <img src="${cleanArtworkUrl(art.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art artist-circle" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(art.name)}</div>
            <div class="am-media-card-sub">${escapeHTML(art.genre || t('badge_artist'))}</div>
          </div>
        `).join('');

        artistsGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            const idx = parseInt(card.dataset.idx, 10);
            const art = artists[idx];
            if (art) {
              showArtistView(art.id, art.name);
            }
          };
        });
      }
    }
  }

  // ── Library Hub Page (Mobile) ──
  async function renderLibraryHubPage() {
    const recentAddedRow = document.getElementById('hub-recent-added-row');
    const playlistsRow = document.getElementById('hub-playlists-row');
    const recentListenedRow = document.getElementById('hub-recent-listened-row');

    if (recentAddedRow) {
      const items = await getRecentlyAdded(15);
      if (items.length === 0) {
        recentAddedRow.innerHTML = `<p class="am-empty-msg">${t('rec_added_empty')}</p>`;
      } else {
        recentAddedRow.innerHTML = items.map((item, i) => `
          <div class="am-standard-media-card animate-fade" data-type="${item.itemType}" data-id="${item.id}" data-idx="${i}">
            <img src="${cleanArtworkUrl(item.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art ${item.itemType === 'artist' ? 'artist-circle' : ''}" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(item.name)}</div>
            <div class="am-media-card-sub">${escapeHTML(item.artist || '')}</div>
          </div>
        `).join('');

        recentAddedRow.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            const idx = parseInt(card.dataset.idx, 10);
            const it = items[idx];
            if (it.itemType === 'song') {
              loadRemoteTrack({ trackId: it.id, trackName: it.name, artistName: it.artist, collectionName: it.album || '', albumId: it.albumId || null, artistId: it.artistId || null, artworkUrl100: it.artUrl });
            } else if (it.itemType === 'album') {
              showAlbumView(it.id);
            } else if (it.itemType === 'artist') {
              showArtistView(it.id, it.name);
            }
          };
        });
      }
    }

    if (playlistsRow) {
      const playlists = await getPlaylists();
      if (playlists.length === 0) {
        playlistsRow.innerHTML = `<p class="am-empty-msg">${t('playlists_empty')}</p>`;
      } else {
        const cardsHTML = await Promise.all(playlists.map(async (p, i) => {
          const pTracks = await getPlaylistTracks(p.id);
          const firstArt = pTracks[0]?.artUrl || 'favicon.svg';
          return `
            <div class="am-standard-media-card animate-fade" data-id="${p.id}" data-idx="${i}">
              <img src="${cleanArtworkUrl(firstArt, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
              <div class="am-media-card-title">${escapeHTML(p.name)}</div>
              <div class="am-media-card-sub">${t('lib_tracks_count', { count: pTracks.length })}</div>
            </div>
          `;
        }));
        playlistsRow.innerHTML = cardsHTML.join('');

        playlistsRow.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            switchPage('playlists');
            openLocalPlaylistDetail(parseInt(card.dataset.id, 10));
          };
        });
      }
    }

    if (recentListenedRow) {
      const recent10 = getRecentlyPlayed10();
      if (recent10.length === 0) {
        recentListenedRow.innerHTML = `<p class="am-empty-msg">${t('recent_empty')}</p>`;
      } else {
        recentListenedRow.innerHTML = recent10.map((song, i) => `
          <div class="am-standard-media-card animate-fade" data-id="${song.id}" data-idx="${i}">
            <img src="${cleanArtworkUrl(song.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(song.title)}</div>
            <div class="am-media-card-sub">${escapeHTML(song.artist)}</div>
          </div>
        `).join('');

        recentListenedRow.querySelectorAll('.am-standard-media-card').forEach(card => {
          card.onclick = () => {
            const idx = parseInt(card.dataset.idx, 10);
            const song = recent10[idx];
            if (song) {
              loadRemoteTrack({ trackId: song.id, trackName: song.title, artistName: song.artist, collectionName: song.album, albumId: song.albumId || null, artistId: song.artistId || null, artworkUrl100: song.artUrl });
            }
          };
        });
      }
    }

    const hubCreateBtn = document.getElementById('hub-create-playlist-btn');
    if (hubCreateBtn) {
      hubCreateBtn.onclick = () => {
        const name = prompt(t('prompt_enter_playlist_name'));
        if (name && name.trim()) {
          createPlaylist(name.trim()).then(() => renderLibraryHubPage());
        }
      };
    }
  }

  // ── Library Artists & Albums Pages ──
  function renderLibraryArtistsPage() {
    const grid = document.getElementById('library-artists-grid');
    if (!grid) return;
    const artists = getLibraryArtists();
    if (artists.length === 0) {
      grid.innerHTML = `<p class="am-empty-msg">${t('empty_library')}</p>`;
    } else {
      grid.innerHTML = artists.map((art, i) => `
        <div class="am-standard-media-card animate-fade" data-id="${art.id}" data-idx="${i}">
          <img src="${cleanArtworkUrl(art.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art artist-circle" onerror="this.src='favicon.svg'">
          <div class="am-media-card-title">${escapeHTML(art.name)}</div>
          <div class="am-media-card-sub">${escapeHTML(art.genre || t('badge_artist'))}</div>
        </div>
      `).join('');

      grid.querySelectorAll('.am-standard-media-card').forEach(card => {
        card.onclick = () => {
          const idx = parseInt(card.dataset.idx, 10);
          const art = artists[idx];
          if (art) {
            showArtistView(art.id, art.name);
          }
        };
      });
    }
  }

  function renderLibraryAlbumsPage() {
    const grid = document.getElementById('library-albums-grid');
    if (!grid) return;
    const albums = getLibraryAlbums();
    if (albums.length === 0) {
      grid.innerHTML = `<p class="am-empty-msg">${t('empty_library')}</p>`;
    } else {
      grid.innerHTML = albums.map((alb, i) => `
        <div class="am-standard-media-card animate-fade" data-id="${alb.id}" data-idx="${i}">
          <img src="${cleanArtworkUrl(alb.artUrl, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
          <div class="am-media-card-title">${escapeHTML(alb.name)}</div>
          <div class="am-media-card-sub">${escapeHTML(alb.artist)}</div>
        </div>
      `).join('');

      grid.querySelectorAll('.am-standard-media-card').forEach(card => {
        card.onclick = () => {
          const idx = parseInt(card.dataset.idx, 10);
          const alb = albums[idx];
          if (alb) {
            showAlbumView(alb.id);
          }
        };
      });
    }
  }

  // ── Update Sidebar Top 4 Playlists ──
  async function updateSidebarPlaylists() {
    const container = document.getElementById('sidebar-playlists-list');
    if (!container) return;

    try {
      const playlists = await getPlaylists();
      const userPlaylists = playlists.filter(p => p.name !== 'Favorites').slice(0, 4);

      if (userPlaylists.length === 0) {
        container.innerHTML = '';
        return;
      }

      const itemsHTML = await Promise.all(userPlaylists.map(async p => {
        const tracks = await getPlaylistTracks(p.id);
        const firstArt = tracks[0]?.artUrl || 'favicon.svg';
        return `
          <div class="am-sidebar-playlist-item" data-id="${p.id}">
            <img src="${cleanArtworkUrl(firstArt, 60, 60)}" loading="lazy" referrerpolicy="no-referrer" class="am-sidebar-playlist-cover" alt="" onerror="this.src='favicon.svg'">
            <span class="am-sidebar-playlist-name">${escapeHTML(p.name)}</span>
          </div>
        `;
      }));

      container.innerHTML = itemsHTML.join('');

      container.querySelectorAll('.am-sidebar-playlist-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const pId = parseInt(item.dataset.id, 10);
          switchPage('playlists');
          openLocalPlaylistDetail(pId);
        };
      });
    } catch (e) {
      console.warn('[Sidebar] Error loading top 4 playlists:', e);
    }
  }

  // ── Categories & Landing View ──
  async function loadLandingView() {
    renderRecentlySearched();
    fetchCategories();
    syncHomeNavVisibility();
  }

  async function fetchCategories() {
    if (!categoriesGrid) return;
    try {
      const res = await fetch(`${API_BASE}/recommendations?name=search-landing&l=${getCurrentLang()}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();

      const curators = data.resources?.['apple-curators'] || {};
      const categories = Object.values(curators);

      if (categories.length === 0) {
        categoriesGrid.innerHTML = `<p class="am-empty-msg">${t('empty_categories')}</p>`;
        return;
      }

      categoriesGrid.innerHTML = categories.map(cat => {
        const attr = cat.attributes || {};
        const rawUrl = attr.artwork?.url || '';
        const artUrl = rawUrl ? cleanArtworkUrl(rawUrl, 480, 270) : '';

        return `
          <div class="am-category-card animate-fade" data-curator="${cat.id}">
            ${artUrl ? `<img src="${artUrl}" class="am-category-bg" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.style.display='none'">` : ''}
            <div class="am-category-title">${escapeHTML(attr.name || t('nav_search'))}</div>
          </div>
        `;
      }).join('');

      categoriesGrid.querySelectorAll('.am-category-card').forEach(card => {
        card.onclick = () => {
          const title = card.querySelector('.am-category-title')?.textContent || '';
          catalogSearch.value = title;
          performCatalogSearch(title);
        };
      });

    } catch (err) {
      console.error(err);
      categoriesGrid.innerHTML = `<p class="am-error-msg">${t('error')}</p>`;
    }
  }

  // ── Recent Searches ──
  function renderRecentlySearched() {
    if (!recentlySearchedGrid || !recentlySearchedSection) return;
    const recents = JSON.parse(localStorage.getItem('spicy_recent_searches') || '[]');
    if (recents.length === 0) {
      recentlySearchedSection.classList.add('hidden');
      return;
    }
    recentlySearchedSection.classList.remove('hidden');

    recentlySearchedGrid.innerHTML = recents.map(item => `
      <div class="am-recent-search-chip" data-query="${escapeHTML(item.query)}">
        <img src="${cleanArtworkUrl(item.artUrl, 60, 60)}" class="am-chip-art" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.src='favicon.svg'">
        <div class="am-chip-info">
          <span class="am-chip-title">${escapeHTML(item.title || item.query)}</span>
          <span class="am-chip-sub">${escapeHTML(item.type || t('nav_search'))}</span>
        </div>
      </div>
    `).join('');

    recentlySearchedGrid.querySelectorAll('.am-recent-search-chip').forEach(chip => {
      chip.onclick = () => {
        const q = chip.dataset.query;
        catalogSearch.value = q;
        performCatalogSearch(q);
      };
    });
  }

  if (clearRecentSearchesBtn) {
    clearRecentSearchesBtn.onclick = () => {
      localStorage.removeItem('spicy_recent_searches');
      renderRecentlySearched();
    };
  }

  function addRecentSearch(query, title, type, artUrl) {
    let recents = JSON.parse(localStorage.getItem('spicy_recent_searches') || '[]');
    recents = recents.filter(r => r.query !== query);
    recents.unshift({ query, title, type, artUrl });
    if (recents.length > 8) recents.pop();
    localStorage.setItem('spicy_recent_searches', JSON.stringify(recents));
  }

  // ── Search Handling ──
  let searchDebounce = null;
  if (catalogSearch) {
    catalogSearch.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (searchClearBtn) {
        if (q.length > 0) searchClearBtn.classList.remove('hidden');
        else searchClearBtn.classList.add('hidden');
      }

      clearTimeout(searchDebounce);
      if (!q) {
        clearSearchUI();
        return;
      }
      searchDebounce = setTimeout(() => performCatalogSearch(q), 350);
    });

    catalogSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounce);
        const q = catalogSearch.value.trim();
        if (q) performCatalogSearch(q);
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.onclick = () => {
      catalogSearch.value = '';
      searchClearBtn.classList.add('hidden');
      clearSearchUI();
      catalogSearch.focus();
    };
  }

  function clearSearchUI() {
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
    if (albumViewContainer) albumViewContainer.classList.add('hidden');
    if (artistViewContainer) artistViewContainer.classList.add('hidden');
    if (playlistViewContainer) playlistViewContainer.classList.add('hidden');
    if (listenInitialContent) listenInitialContent.classList.remove('hidden');
  }

  async function performCatalogSearch(query) {
    if (!query) return;

    if (listenInitialContent) listenInitialContent.classList.add('hidden');
    if (albumViewContainer) albumViewContainer.classList.add('hidden');
    if (artistViewContainer) artistViewContainer.classList.add('hidden');
    if (playlistViewContainer) playlistViewContainer.classList.add('hidden');
    if (searchResultsContainer) searchResultsContainer.classList.remove('hidden');

    [sectionTopResults, sectionArtists, sectionSongs, sectionAlbums, sectionPlaylists, sectionVideos].forEach(s => {
      if (s) {
        s.classList.remove('hidden');
        const grid = s.querySelector('div');
        if (grid) grid.innerHTML = `<div class="am-loading-msg">${t('loading')}</div>`;
      }
    });

    try {
      const res = await fetch(`${API_BASE}/search?term=${encodeURIComponent(query)}&limit=25&l=${getCurrentLang()}`);
      if (!res.ok) throw new Error(`Search error ${res.status}`);
      const data = await res.json();
      const results = data.results || {};

      // Support both 'top' and 'topResults' schemas (e.g. searchapi.json vs standard)
      const topData = results.top?.data || results.topResults?.data || [];
      const topResult = topData[0];
      if (topResult) {
        const attr = topResult.attributes || {};
        const art = attr.artwork?.url ? cleanArtworkUrl(attr.artwork.url, 100, 100) : '';
        addRecentSearch(query, attr.name || query, topResult.type, art);
      }

      const artistData = results.artists?.data || [];
      const songData = results.songs?.data || [];
      const albumData = results.albums?.data || [];
      const playlistData = results.playlists?.data || [];
      const videoData = results.music_video?.data || results['music-videos']?.data || [];

      renderTopResults(topData);
      renderArtists(artistData);
      renderSongs(songData);
      renderAlbums(albumData);
      renderPlaylists(playlistData);
      renderMusicVideos(videoData);

    } catch (err) {
      console.error(err);
      if (topResultsGrid) topResultsGrid.innerHTML = `<div class="am-error-msg">${t('error')}: ${err.message}</div>`;
    }
  }

  function renderTopResults(items) {
    if (!sectionTopResults || !topResultsGrid) return;
    if (items.length === 0) {
      sectionTopResults.classList.add('hidden');
      return;
    }
    sectionTopResults.classList.remove('hidden');

    topResultsGrid.innerHTML = items.slice(0, 4).map((item, i) => {
      const attr = item.attributes || {};
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 300, 300);
      const isArtist = item.type === 'artists';
      const badgeKey = item.type === 'artists' ? 'badge_artist' :
                       item.type === 'albums' ? 'badge_album' :
                       item.type === 'songs' ? 'badge_song' :
                       item.type === 'playlists' ? 'badge_playlist' :
                       item.type === 'music_video' || item.type === 'music-videos' ? 'badge_video' : 'badge_song';

      return `
        <div class="am-top-card animate-fade" data-type="${item.type}" data-id="${item.id}" data-idx="${i}">
          <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" class="am-top-card-art ${isArtist ? 'artist-circle' : ''}" onerror="this.src='favicon.svg'">
          <div class="am-top-card-info">
            <h3 class="am-top-card-title">${escapeHTML(attr.name || '')}</h3>
            <p class="am-top-card-subtitle">${escapeHTML(attr.artistName || (isArtist ? t('badge_artist') : ''))}</p>
            <span class="am-top-card-badge">${t(badgeKey)}</span>
          </div>
        </div>
      `;
    }).join('');

    topResultsGrid.querySelectorAll('.am-top-card').forEach(card => {
      card.onclick = () => {
        const type = card.dataset.type;
        const id = card.dataset.id;
        const title = card.querySelector('.am-top-card-title')?.textContent || '';
        if (type === 'songs') {
          const song = items.find(x => x.id === id);
          const attr = song?.attributes || {};
          const albumId = song?.relationships?.albums?.data?.[0]?.id || attr.url?.match(/\/album\/[^/]+\/(\d+)/)?.[1] || null;
          const artistId = song?.relationships?.artists?.data?.[0]?.id || null;
          loadRemoteTrack({
            trackId: id,
            trackName: attr.name,
            artistName: attr.artistName,
            collectionName: attr.albumName,
            albumId,
            artistId,
            artworkUrl100: cleanArtworkUrl(attr.artwork?.url, 100, 100)
          });
        } else if (type === 'albums') {
          showAlbumView(id);
        } else if (type === 'artists') {
          showArtistView(id, title);
        } else if (type === 'playlists') {
          showRemotePlaylistView(id, title);
        } else if (type === 'music_video' || type === 'music-videos') {
          playMusicVideo(id);
        }
      };
    });
  }

  function renderArtists(artists) {
    if (!sectionArtists || !artistsGrid) return;
    if (artists.length === 0) {
      sectionArtists.classList.add('hidden');
      return;
    }
    sectionArtists.classList.remove('hidden');

    artistsGrid.innerHTML = artists.map(art => {
      const attr = art.attributes || {};
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 240, 240);

      return `
        <div class="am-artist-card animate-fade" data-id="${art.id}">
          <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" class="am-artist-art" alt="" onerror="this.src='favicon.svg'">
          <div class="am-artist-name">${escapeHTML(attr.name || '')}</div>
          <div class="am-artist-sub">${t('badge_artist')}</div>
        </div>
      `;
    }).join('');

    artistsGrid.querySelectorAll('.am-artist-card').forEach(card => {
      card.onclick = () => {
        const name = card.querySelector('.am-artist-name')?.textContent || '';
        showArtistView(card.dataset.id, name);
      };
    });
  }

  function renderSongs(songs) {
    if (!sectionSongs || !songsGrid) return;
    if (songs.length === 0) {
      sectionSongs.classList.add('hidden');
      return;
    }
    sectionSongs.classList.remove('hidden');

    songsGrid.innerHTML = songs.map((s, i) => {
      const attr = s.attributes || {};
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 60, 60);

      return `
        <div class="am-song-row-item animate-fade" data-id="${s.id}" data-idx="${i}">
          <div class="am-song-row-num">${i + 1}</div>
          <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" class="am-song-row-art" onerror="this.src='favicon.svg'">
          <div class="am-song-row-info">
            <div class="am-song-row-title">${escapeHTML(attr.name || '')}</div>
            <div class="am-song-row-artist">${escapeHTML(attr.artistName || '')}</div>
          </div>
          <button class="am-song-more-btn" data-id="${s.id}" data-idx="${i}">•••</button>
        </div>
      `;
    }).join('');

    songsGrid.querySelectorAll('.am-song-row-item').forEach(row => {
      row.onclick = (e) => {
        const idx = parseInt(row.dataset.idx, 10);
        const song = songs[idx];
        const attr = song?.attributes || {};
        const albumId = song?.relationships?.albums?.data?.[0]?.id || attr.url?.match(/\/album\/[^/]+\/(\d+)/)?.[1] || null;
        const artistId = song?.relationships?.artists?.data?.[0]?.id || null;

        if (e.target.classList.contains('am-song-more-btn')) {
          e.stopPropagation();
          showContextMenu(e, {
            trackId: song.id,
            trackName: attr.name,
            artistName: attr.artistName,
            collectionName: attr.albumName,
            albumId,
            artistId,
            artworkUrl100: cleanArtworkUrl(attr.artwork?.url, 100, 100)
          });
          return;
        }

        loadRemoteTrack({
          trackId: song.id,
          trackName: attr.name,
          artistName: attr.artistName,
          collectionName: attr.albumName,
          albumId,
          artistId,
          artworkUrl100: cleanArtworkUrl(attr.artwork?.url, 100, 100)
        });
      };
    });
  }

  function renderAlbums(albums) {
    if (!sectionAlbums || !albumsGrid) return;
    if (albums.length === 0) {
      sectionAlbums.classList.add('hidden');
      return;
    }
    sectionAlbums.classList.remove('hidden');

    albumsGrid.innerHTML = albums.map(alb => {
      const attr = alb.attributes || {};
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 300, 300);

      return `
        <div class="am-standard-media-card animate-fade" data-id="${alb.id}">
          <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
          <div class="am-media-card-title">${escapeHTML(attr.name || '')}</div>
          <div class="am-media-card-sub">${escapeHTML(attr.artistName || '')}</div>
        </div>
      `;
    }).join('');

    albumsGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
      card.onclick = () => showAlbumView(card.dataset.id);
    });
  }

  function renderPlaylists(playlists) {
    if (!sectionPlaylists || !playlistsSearchGrid) return;
    if (playlists.length === 0) {
      sectionPlaylists.classList.add('hidden');
      return;
    }
    sectionPlaylists.classList.remove('hidden');

    playlistsSearchGrid.innerHTML = playlists.map(pl => {
      const attr = pl.attributes || {};
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 300, 300);

      return `
        <div class="am-standard-media-card animate-fade" data-id="${pl.id}">
          <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
          <div class="am-media-card-title">${escapeHTML(attr.name || '')}</div>
          <div class="am-media-card-sub">${escapeHTML(attr.curatorName || 'Apple Music')}</div>
        </div>
      `;
    }).join('');

    playlistsSearchGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
      card.onclick = () => {
        const name = card.querySelector('.am-media-card-title')?.textContent || 'Playlist';
        showRemotePlaylistView(card.dataset.id, name);
      };
    });
  }

  function renderMusicVideos(videos) {
    if (!sectionVideos || !videosGrid) return;
    if (videos.length === 0) {
      sectionVideos.classList.add('hidden');
      return;
    }
    sectionVideos.classList.remove('hidden');

    videosGrid.innerHTML = videos.map(vid => {
      const attr = vid.attributes || {};
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 320, 180);

      return `
        <div class="am-standard-media-card animate-fade" data-id="${vid.id}">
          <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" style="aspect-ratio: 16/9;" onerror="this.src='favicon.svg'">
          <div class="am-media-card-title">${escapeHTML(attr.name || '')}</div>
          <div class="am-media-card-sub">${escapeHTML(attr.artistName || '')}</div>
        </div>
      `;
    }).join('');

    videosGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
      card.onclick = () => playMusicVideo(card.dataset.id);
    });
  }

  async function playMusicVideo(vidId) {
    if (!prepOverlay) return;
    prepOverlay.classList.add('active');
    prepStatus.textContent = t('loading');

    try {
      const res = await fetch(`${API_BASE}/musicvideo?song=${vidId}&l=${getCurrentLang()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      prepOverlay.classList.remove('active');

      const videoUrl = data.video_url || data.preview_url || data.hls_url;
      const title = data.title || data.name || 'Music Video';
      const artist = data.artist || data.artist_name || '';
      const downloadUrl = `${API_BASE}/musicvideo/download?song=${vidId}&quality=4k&l=${getCurrentLang()}`;

      let videoModal = document.getElementById('music-video-modal');
      if (!videoModal) {
        videoModal = document.createElement('div');
        videoModal.id = 'music-video-modal';
        videoModal.className = 'modal-backdrop animate-fade';
        videoModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
        videoModal.innerHTML = `
          <div class="video-modal-content" style="max-width:840px;width:100%;background:#18181b;border:1px solid rgba(255,255,255,0.12);border-radius:18px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.8);position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);">
              <div>
                <h3 id="mv-modal-title" style="margin:0;font-size:1.1rem;color:#fff;font-weight:600;">${escapeHTML(title)}</h3>
                <p id="mv-modal-artist" style="margin:2px 0 0 0;font-size:0.85rem;color:#a1a1aa;">${escapeHTML(artist)}</p>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <a id="mv-modal-download" href="${downloadUrl}" download="${escapeHTML(title)}.mp4" style="background:rgba(255,255,255,0.12);color:#fff;text-decoration:none;padding:6px 14px;border-radius:20px;font-size:0.85rem;display:flex;align-items:center;gap:6px;cursor:pointer;transition:background 0.2s;">
                  <img src="icons/download.png" style="width:14px;height:14px;filter:invert(1);" alt="Download">
                  <span>${t('loading_download')}</span>
                </a>
                <button id="mv-modal-close" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
              </div>
            </div>
            <div style="position:relative;padding-top:56.25%;background:#000;">
              <video id="mv-modal-video" controls autoplay playsinline style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;"></video>
            </div>
          </div>
        `;
        document.body.appendChild(videoModal);

        videoModal.querySelector('#mv-modal-close').onclick = () => {
          const v = videoModal.querySelector('#mv-modal-video');
          if (v) { v.pause(); v.src = ''; }
          videoModal.classList.add('hidden');
        };

        videoModal.onclick = (e) => {
          if (e.target === videoModal) {
            const v = videoModal.querySelector('#mv-modal-video');
            if (v) { v.pause(); v.src = ''; }
            videoModal.classList.add('hidden');
          }
        };
      }

      videoModal.querySelector('#mv-modal-title').textContent = title;
      videoModal.querySelector('#mv-modal-artist').textContent = artist;
      const downloadLink = videoModal.querySelector('#mv-modal-download');
      if (downloadLink) {
        downloadLink.href = downloadUrl;
        downloadLink.setAttribute('download', `${title}.mp4`);
      }
      const videoEl = videoModal.querySelector('#mv-modal-video');
      if (videoUrl) {
        videoEl.src = videoUrl;
        videoEl.play().catch(() => {});
      }
      videoModal.classList.remove('hidden');

    } catch (err) {
      console.error("Music video load failed:", err);
      prepOverlay.classList.remove('active');
      alert(`Could not load music video: ${err.message}`);
    }
  }

  // ── Album Detail View with "More by Artist" row in random order ──
  async function fetchAlbumDetails(albumId) {
    if (listenInitialContent) listenInitialContent.classList.add('hidden');
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
    if (artistViewContainer) artistViewContainer.classList.add('hidden');
    if (playlistViewContainer) playlistViewContainer.classList.add('hidden');
    if (albumViewContainer) albumViewContainer.classList.remove('hidden');

    albumHeader.innerHTML = `<div class="am-loading-msg">${t('loading')}</div>`;
    albumTracksGrid.innerHTML = '';

    try {
      const res = await fetch(`${API_BASE}/album?album=${albumId}&l=${getCurrentLang()}`);
      if (!res.ok) throw new Error(`Album fetch failed ${res.status}`);
      const data = await res.json();

      // Robust extraction compatible with raw_data or standard data envelopes
      const albumObj = data.raw_data?.data?.[0] || data.data?.[0] || data.results?.albums?.data?.[0] || data;
      if (!albumObj || (!albumObj.attributes && !albumObj.name)) throw new Error('Album not found in response');

      const attr = albumObj.attributes || albumObj;
      const artUrl = cleanArtworkUrl(attr.artwork?.url, 600, 600);
      const artistId = albumObj.relationships?.artists?.data?.[0]?.id || data.artist_id || null;
      const artistName = attr.artistName || data.artist_name || '';

      let videoUrl = null;
      try {
        const animRes = await fetch(`${API_BASE}/animatedart?album=${albumId}&l=${getCurrentLang()}`);
        if (animRes.ok) {
          const animData = await animRes.json();
          videoUrl = animData.videoUrl || animData.url;
        }
      } catch (e) {}

      const year = attr.releaseDate ? new Date(attr.releaseDate).getFullYear() : '';
      const genre = attr.genreNames?.[0] || 'Music';
      const inLib = isAlbumInLibrary(albumId);

      // Render Album Header
      albumHeader.innerHTML = `
        <div class="am-album-art-container">
          ${videoUrl ? `<video src="${videoUrl}" autoplay loop muted playsinline class="am-album-cover"></video>` : `<img src="${artUrl}" referrerpolicy="no-referrer" class="am-album-cover" onerror="this.src='favicon.svg'">`}
        </div>
        <div class="am-album-details">
          <h2 class="am-album-title">${escapeHTML(attr.name || 'Album')}</h2>
          <div class="am-album-artist" id="album-artist-link" style="${artistId ? 'cursor:pointer;' : ''}">${escapeHTML(artistName)}</div>
          <div class="am-album-meta">${escapeHTML(genre)} • ${year}</div>
          <div class="am-album-actions" style="display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap;">
            <button class="premium-btn primary" id="album-play-btn" style="border-radius:100px; padding:0 28px; height:42px; display:inline-flex; align-items:center; gap:8px;">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
              <span>${t('album_preview')}</span>
            </button>
            <button class="premium-btn secondary" id="album-add-lib-btn" style="border-radius:100px; padding:0 22px; height:42px; display:inline-flex; align-items:center; gap:8px;">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              <span id="album-lib-label">${inLib ? t('ctx_in_library') : t('ctx_add_library')}</span>
            </button>
          </div>
        </div>
      `;

      const artistLink = document.getElementById('album-artist-link');
      if (artistLink && artistId) {
        artistLink.onclick = () => showArtistView(artistId, artistName);
      }

      const addLibBtn = document.getElementById('album-add-lib-btn');
      if (addLibBtn) {
        addLibBtn.onclick = () => {
          if (isAlbumInLibrary(albumId)) {
            removeAlbumFromLibrary(albumId);
            document.getElementById('album-lib-label').textContent = t('ctx_add_library');
          } else {
            addAlbumToLibrary({ id: albumId, name: attr.name, artistName, artUrl, releaseDate: attr.releaseDate });
            document.getElementById('album-lib-label').textContent = t('ctx_in_library');
          }
        };
      }

      // Extract tracks from parsed_tracks (fast) or relationships.tracks.data
      const relTracks = albumObj.relationships?.tracks?.data || [];
      const tracks = (data.parsed_tracks && data.parsed_tracks.length > 0)
        ? data.parsed_tracks.map(t => ({
            id: t.id,
            name: t.title || t.name,
            artistName: t.artist || t.artistName || artistName,
            trackNumber: t.track_number || t.trackNumber,
            durationInMillis: t.duration_ms || t.durationInMillis,
            is_explicit: t.is_explicit || false
          }))
        : relTracks.map(t => ({
            id: t.id,
            name: t.attributes?.name,
            artistName: t.attributes?.artistName || artistName,
            trackNumber: t.attributes?.trackNumber,
            durationInMillis: t.attributes?.durationInMillis,
            is_explicit: t.attributes?.contentRating === 'explicit'
          }));

      // Render Tracks
      albumTracksGrid.innerHTML = tracks.map((t, idx) => `
        <div class="am-track-row animate-fade" data-id="${t.id}" data-index="${idx}">
           <div class="am-track-num">${t.trackNumber || idx + 1}</div>
           <div class="am-track-title">
             <span>${escapeHTML(t.name || 'Unknown')}</span>
             ${t.is_explicit ? '<span class="am-explicit-tag">E</span>' : ''}
           </div>
           <div class="am-track-duration">${formatDuration(t.durationInMillis)}</div>
           <button class="am-song-more-btn" data-id="${t.id}">•••</button>
        </div>
      `).join('');

      albumTracksGrid.querySelectorAll('.am-track-row').forEach(row => {
        row.onclick = (e) => {
          const id = row.dataset.id;
          const idx = parseInt(row.dataset.index, 10);
          const t = tracks[idx] || tracks.find(x => x.id === id);

          if (e.target.classList.contains('am-song-more-btn')) {
            e.stopPropagation();
            showContextMenu(e, {
              trackId: id,
              trackName: t?.name,
              artistName: t?.artistName || artistName,
              collectionName: attr.name,
              albumId: albumId,
              artistId: artistId,
              artworkUrl100: artUrl
            });
            return;
          }

          // Play preview starting from this track
          previewPlayer.playAlbum(data, idx >= 0 ? idx : 0);
        };
      });

      // Footer info & Editorial Notes
      let footerContainer = document.getElementById('album-footer-info');
      if (!footerContainer) {
        footerContainer = document.createElement('div');
        footerContainer.id = 'album-footer-info';
        footerContainer.className = 'am-album-footer-info';
        albumTracksGrid.after(footerContainer);
      }

      const totalMs = tracks.reduce((acc, t) => acc + (t.durationInMillis || 0), 0);
      const editorialReview = attr.editorialNotes?.standard || attr.editorialNotes?.short || '';

      footerContainer.innerHTML = `
        ${editorialReview ? `
          <div class="am-album-editorial-card" style="margin-bottom: 24px; padding: 18px 20px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);">
            <div style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #fa243c; margin-bottom: 8px;">${t('editors_notes')}</div>
            <div style="font-size: 0.92rem; line-height: 1.6; color: #d1d1d6;">${escapeHTML(editorialReview.replace(/<[^>]*>/g, ''))}</div>
          </div>
        ` : ''}
        <div style="font-weight: 500;">${year}</div>
        <div>${t('lib_songs_count', { count: tracks.length })}, ${formatDuration(totalMs)}</div>
        <div style="margin-top: 4px; opacity: 0.8;">${escapeHTML(attr.copyright || attr.recordLabel || '℗ All Rights Reserved')}</div>
      `;

      // Header Preview Button — Plays 30s previews of the album in the mini player
      const playBtn = document.getElementById('album-play-btn');
      if (playBtn && tracks.length > 0) {
        playBtn.onclick = () => {
          previewPlayer.playAlbum(data, 0);
        };
      }

      // "More by {artistName}" Row in random order
      let moreBySection = document.getElementById('album-more-by-section');
      if (!moreBySection) {
        moreBySection = document.createElement('div');
        moreBySection.id = 'album-more-by-section';
        moreBySection.className = 'am-search-section';
        moreBySection.style.marginTop = '36px';
        moreBySection.style.marginBottom = '40px';
        footerContainer.after(moreBySection);
      }

      moreBySection.innerHTML = `
        <h3 class="am-search-section-title">${t('album_more_by', { artist: escapeHTML(artistName) })}</h3>
        <div class="am-cards-horizontal-scroll" id="album-more-by-grid">
          <div class="am-loading-msg">${t('loading')}</div>
        </div>
      `;

      // Fetch other albums by artist and randomize
      fetchArtistOtherAlbums(artistId, artistName, albumId);

    } catch (err) {
      console.error(err);
      albumHeader.innerHTML = `<div class="am-error-msg">${t('error')}: ${err.message}</div>`;
    }
  }

  async function fetchArtistOtherAlbums(artistId, artistName, currentAlbumId) {
    const moreGrid = document.getElementById('album-more-by-grid');
    if (!moreGrid) return;

    try {
      let otherAlbums = [];
      if (artistId) {
        const res = await fetch(`${API_BASE}/artist/albums?artist=${artistId}&limit=25&l=${getCurrentLang()}`);
        if (res.ok) {
          const data = await res.json();
          otherAlbums = data.data || [];
        }
      }

      if (otherAlbums.length === 0) {
        // Fallback to search query for artist name
        const sRes = await fetch(`${API_BASE}/search?term=${encodeURIComponent(artistName)}&types=albums&limit=25&l=${getCurrentLang()}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          otherAlbums = sData.results?.albums?.data || [];
        }
      }

      // Filter out current album and randomize
      const filtered = otherAlbums.filter(a => String(a.id) !== String(currentAlbumId));
      const randomized = filtered.sort(() => 0.5 - Math.random()).slice(0, 15);

      if (randomized.length === 0) {
        moreGrid.innerHTML = `<p class="am-empty-msg">${t('empty_other_albums')}</p>`;
        return;
      }

      moreGrid.innerHTML = randomized.map(alb => {
        const attr = alb.attributes || {};
        const art = cleanArtworkUrl(attr.artwork?.url, 300, 300);
        const y = attr.releaseDate ? new Date(attr.releaseDate).getFullYear() : '';
        return `
          <div class="am-standard-media-card animate-fade" data-id="${alb.id}">
            <img src="${art}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(attr.name || '')}</div>
            <div class="am-media-card-sub">${escapeHTML(y || t('badge_album'))}</div>
          </div>
        `;
      }).join('');

      moreGrid.querySelectorAll('.am-standard-media-card').forEach(card => {
        card.onclick = () => showAlbumView(card.dataset.id);
      });

    } catch (e) {
      moreGrid.innerHTML = `<p class="am-empty-msg">${t('empty_other_albums')}</p>`;
    }
  }

  // ── Artist View with 4x7 Top Songs Grid & Singles / Albums Sorted Latest to Oldest ──
  async function openArtistView(artistId, artistName) {
    if (artistViewContainer) artistViewContainer.classList.remove('hidden');
    if (albumViewContainer) albumViewContainer.classList.add('hidden');
    if (playlistViewContainer) playlistViewContainer.classList.add('hidden');
    if (listenInitialContent) listenInitialContent.classList.add('hidden');
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');

    artistViewContent.innerHTML = `<div class="am-loading-msg">${t('loading_artist_profile')}</div>`;

    try {
      let attr = {};
      let albums = [];
      let songs = [];

      const res = await fetch(`${API_BASE}/artist?artist=${artistId}&l=${getCurrentLang()}`);
      if (res.ok) {
        const data = await res.json();
        const found = Array.isArray(data.data) ? data.data[0] : (data.data || data);
        if (found?.attributes) attr = found.attributes;
      }

      const displayName = attr.name || artistName;
      const artistPhoto = cleanArtworkUrl(attr.artwork?.url, 1200, 630);

      // Fan out parallel fetches for albums and top songs
      const [albumsRes, songsRes] = await Promise.all([
        fetch(`${API_BASE}/artist/albums?artist=${artistId}&limit=100&l=${getCurrentLang()}`).catch(() => null),
        fetch(`${API_BASE}/artist/songs?artist=${artistId}&limit=50&l=${getCurrentLang()}`).catch(() => null)
      ]);

      if (albumsRes && albumsRes.ok) {
        const d = await albumsRes.json();
        albums = d.data || [];
      }

      if (songsRes && songsRes.ok) {
        const d = await songsRes.json();
        songs = d.data || [];
      }

      // If songs are few, search for artist name to populate 4x7 grid (28 songs)
      if (songs.length < 28) {
        try {
          const sSearch = await fetch(`${API_BASE}/search?term=${encodeURIComponent(displayName)}&types=songs&limit=30&l=${getCurrentLang()}`);
          if (sSearch.ok) {
            const sData = await sSearch.json();
            const moreSongs = sData.results?.songs?.data || [];
            const seenIds = new Set(songs.map(s => String(s.id)));
            moreSongs.forEach(ms => {
              if (!seenIds.has(String(ms.id))) {
                seenIds.add(String(ms.id));
                songs.push(ms);
              }
            });
          }
        } catch (e) {}
      }

      // Separate into Full Albums vs Singles & EPs
      const fullAlbums = [];
      const singles = [];

      albums.forEach(alb => {
        const aAttr = alb.attributes || {};
        const name = (aAttr.name || '').toLowerCase();
        const isSingle = aAttr.isSingle || (aAttr.trackCount && aAttr.trackCount <= 3) || name.includes(' - single') || name.includes(' - ep');
        if (isSingle) singles.push(alb);
        else fullAlbums.push(alb);
      });

      // Sort both from latest to oldest release date
      fullAlbums.sort((a, b) => new Date(b.attributes?.releaseDate || 0) - new Date(a.attributes?.releaseDate || 0));
      singles.sort((a, b) => new Date(b.attributes?.releaseDate || 0) - new Date(a.attributes?.releaseDate || 0));

      const inLib = isArtistInLibrary(artistId);

      const bioRaw = attr.artistBio || attr.editorialNotes?.standard || attr.editorialNotes?.short || '';
      const bioText = bioRaw
        ? escapeHTML(bioRaw.replace(/<[^>]*>/g, '')).replace(/&lt;br\s*\/?&gt;/gi, '<br>').replace(/&amp;nbsp;/g, ' ').replace(/\n/g, '<br>')
        : "";

      const genre = attr.genreNames?.[0] || 'Music';

      // 4 rows x 7 cols (28 top songs)
      const top28Songs = songs.slice(0, 28);
      const topSongsCardsHTML = top28Songs.map((s, i) => {
        const sAttr = s.attributes || {};
        const art = cleanArtworkUrl(sAttr.artwork?.url, 80, 80);
        const dateStr = sAttr.releaseDate ? new Date(sAttr.releaseDate).getFullYear() : '';
        return `
          <div class="am-artist-song-card" data-id="${s.id}" data-idx="${i}">
            <img src="${art}" loading="lazy" referrerpolicy="no-referrer" class="am-artist-card-art" alt="" onerror="this.src='favicon.svg'">
            <div class="am-artist-card-meta">
              <div class="am-artist-card-title">${escapeHTML(sAttr.name || '')}</div>
              <div class="am-artist-card-subline">
                <span>${escapeHTML(sAttr.artistName || displayName)}</span>
                ${dateStr ? `<span>• ${dateStr}</span>` : ''}
              </div>
            </div>
            <button class="am-song-more-btn" data-id="${s.id}" data-idx="${i}">•••</button>
          </div>
        `;
      }).join('') || `<p class="am-empty-msg">${t('empty_picks')}</p>`;

      const albumsHTML = fullAlbums.map(a => {
        const aAttr = a.attributes || {};
        const art = cleanArtworkUrl(aAttr.artwork?.url, 300, 300);
        const y = aAttr.releaseDate ? new Date(aAttr.releaseDate).getFullYear() : '';
        return `
          <div class="am-standard-media-card" data-id="${a.id}">
            <img src="${art}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(aAttr.name || '')}</div>
            <div class="am-media-card-sub">${escapeHTML(y || t('badge_album'))}</div>
          </div>
        `;
      }).join('') || `<p class="am-empty-msg">${t('empty_library')}</p>`;

      const singlesHTML = singles.map(s => {
        const sAttr = s.attributes || {};
        const art = cleanArtworkUrl(sAttr.artwork?.url, 300, 300);
        const y = sAttr.releaseDate ? new Date(sAttr.releaseDate).getFullYear() : '';
        return `
          <div class="am-standard-media-card" data-id="${s.id}">
            <img src="${art}" loading="lazy" referrerpolicy="no-referrer" class="am-media-card-art" onerror="this.src='favicon.svg'">
            <div class="am-media-card-title">${escapeHTML(sAttr.name || '')}</div>
            <div class="am-media-card-sub">${escapeHTML(y || t('artist_singles'))}</div>
          </div>
        `;
      }).join('') || `<p class="am-empty-msg">${t('empty_library')}</p>`;

      artistViewContent.innerHTML = `
        <div class="am-artist-header am-artist-hero" style="background-image: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(18,18,18,0.95) 100%), url('${artistPhoto}');">
          <div class="am-artist-name-row">
            <h1 class="am-artist-name">${escapeHTML(displayName)}</h1>
            <div style="display: flex; gap: 10px; align-items: center;">
              <div class="am-artist-play-btn" data-i18n-title="artist_play_top" title="${t('artist_play_top')}"><svg viewBox="0 0 24 24" fill="#fff" width="22" height="22"><path d="M8 5v14l11-7z"/></svg></div>
              <button class="premium-btn secondary" id="artist-add-lib-btn" style="border-radius: 100px; padding: 0 20px; height: 42px; display: inline-flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                <span id="artist-lib-label">${inLib ? t('ctx_in_library') : t('ctx_add_library')}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Top Songs Section (4 songs vertically x 7 horizontally scrollable) -->
        <div class="am-search-section" style="margin-top: 24px;">
          <h3 class="am-search-section-title">${t('artist_top_songs')}</h3>
          <div class="am-artist-top-songs-grid">${topSongsCardsHTML}</div>
        </div>

        <!-- Albums Row (Latest to Oldest) -->
        <div class="am-search-section" style="margin-top: 36px;">
          <h3 class="am-search-section-title">${t('artist_albums')}</h3>
          <div class="am-cards-horizontal-scroll">${albumsHTML}</div>
        </div>

        <!-- Singles Row (Latest to Oldest) -->
        <div class="am-search-section" style="margin-top: 36px;">
          <h3 class="am-search-section-title">${t('artist_singles')}</h3>
          <div class="am-cards-horizontal-scroll">${singlesHTML}</div>
        </div>

        <!-- About Section -->
        <div class="am-about-section" style="margin-top: 36px; margin-bottom: 40px;">
          <h3 style="color: #fff; font-size: 18px; margin-bottom: 8px;">${t('artist_about')}</h3>
          <div class="am-about-text-container" id="artist-about-text">
            <p style="color: #d1d1d6; font-size: 14px;">${bioText || '...'}</p>
          </div>
          ${bioRaw ? `<button class="am-show-more-btn" id="about-toggle-btn">${t('artist_show_more')}</button>` : ''}
          <div class="am-artist-meta-grid">
            <div class="am-meta-item">
              <label>${t('artist_genre')}</label>
              <span>${escapeHTML(genre)}</span>
            </div>
            <div class="am-meta-item">
              <label>${t('artist_albums')}</label>
              <span>${fullAlbums.length + singles.length}</span>
            </div>
            <div class="am-meta-item">
              <label>${t('artist_top_songs')}</label>
              <span>${songs.length}</span>
            </div>
          </div>
        </div>
      `;

      // About Toggle
      const toggleBtn = artistViewContent.querySelector('#about-toggle-btn');
      const textContainer = artistViewContent.querySelector('.am-about-text-container');
      if (toggleBtn && textContainer) {
        toggleBtn.addEventListener('click', () => {
          const isExpanded = textContainer.classList.toggle('expanded');
          toggleBtn.textContent = isExpanded ? t('artist_show_less') : t('artist_show_more');
        });
      }

      // Add to library
      const artistAddBtn = artistViewContent.querySelector('#artist-add-lib-btn');
      if (artistAddBtn) {
        artistAddBtn.onclick = () => {
          if (isArtistInLibrary(artistId)) {
            removeArtistFromLibrary(artistId);
            document.getElementById('artist-lib-label').textContent = t('ctx_add_library');
          } else {
            addArtistToLibrary({ id: artistId, name: displayName, artUrl: artistPhoto, genre });
            document.getElementById('artist-lib-label').textContent = t('ctx_in_library');
          }
        };
      }

      // Albums & Singles card click
      artistViewContent.querySelectorAll('.am-standard-media-card').forEach(card => {
        card.onclick = () => showAlbumView(card.dataset.id);
      });

      // Top songs card click & context menu
      artistViewContent.querySelectorAll('.am-artist-song-card').forEach(card => {
        card.onclick = (e) => {
          const idx = parseInt(card.dataset.idx, 10);
          const song = top28Songs[idx];
          const sAttr = song?.attributes || {};
          const albumId = song?.relationships?.albums?.data?.[0]?.id || sAttr.url?.match(/\/album\/[^/]+\/(\d+)/)?.[1] || null;

          if (e.target.classList.contains('am-song-more-btn')) {
            e.stopPropagation();
            showContextMenu(e, {
              trackId: song.id,
              trackName: sAttr.name,
              artistName: sAttr.artistName || displayName,
              collectionName: sAttr.albumName,
              albumId: albumId,
              artistId: artistId,
              artworkUrl100: cleanArtworkUrl(sAttr.artwork?.url, 100, 100)
            });
            return;
          }

          loadRemoteTrack({
            trackId: song.id,
            trackName: sAttr.name,
            artistName: sAttr.artistName || displayName,
            collectionName: sAttr.albumName,
            albumId: albumId,
            artistId: artistId,
            artworkUrl100: cleanArtworkUrl(sAttr.artwork?.url, 100, 100)
          });
        };
      });

      // Play top song button
      const playBtn = artistViewContent.querySelector('.am-artist-play-btn');
      if (playBtn && top28Songs.length > 0) {
        playBtn.onclick = (e) => {
          e.stopPropagation();
          const sAttr = top28Songs[0].attributes || {};
          const albumId = top28Songs[0]?.relationships?.albums?.data?.[0]?.id || sAttr.url?.match(/\/album\/[^/]+\/(\d+)/)?.[1] || null;
          loadRemoteTrack({
            trackId: top28Songs[0].id,
            trackName: sAttr.name,
            artistName: sAttr.artistName || displayName,
            collectionName: sAttr.albumName,
            albumId: albumId,
            artistId: artistId,
            artworkUrl100: cleanArtworkUrl(sAttr.artwork?.url, 100, 100)
          });
        };
      }

    } catch (err) {
      console.error(err);
      artistViewContent.innerHTML = `<div class="am-error-msg">${t('error')}: ${err.message}</div>`;
    }
  }

  // ── Remote Track Load & Playback ──
  async function loadRemoteTrack(song) {
    if (!prepOverlay) return;

    previewPlayer.close();
    addToRecent(song);
    syncHomeNavVisibility();

    prepOverlay.classList.add('active');
    prepStatus.textContent = t('loading_download');

    try {
      const audioUrl = `${API_BASE}/download?song=${song.trackId}&l=${getCurrentLang()}`;
      const response = await robustFetch(audioUrl, { skipProxy: true });
      const audioBuffer = await response.arrayBuffer();

      prepStatus.textContent = t('loading_process_meta');

      const metadata = {
        name: song.trackName,
        artist: song.artistName,
        album: song.collectionName,
        albumId: song.albumId || null,
        artistId: song.artistId || null,
        releaseDate: song.releaseDate || null,
        year: song.releaseDate ? formatLocalizedYear(song.releaseDate) : (song.year || null),
        artUrl: cleanArtworkUrl(song.artworkUrl100 || song.artUrl, 600, 600),
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
    prepStatus.textContent = t('loading_metadata');

    try {
      const res = await fetch(`${API_BASE}/song?song=${id}&l=${getCurrentLang()}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();

      const songData = data.data?.[0] || data.results?.songs?.data?.[0];
      if (!songData) throw new Error("Track ID not found");

      const attr = songData.attributes || {};
      const albumId = songData.relationships?.albums?.data?.[0]?.id || attr.url?.match(/\/album\/[^/]+\/(\d+)/)?.[1] || null;
      const artistId = songData.relationships?.artists?.data?.[0]?.id || null;

      const song = {
        trackId: songData.id,
        trackName: attr.name,
        artistName: attr.artistName,
        collectionName: attr.albumName,
        albumId: albumId,
        artistId: artistId,
        releaseDate: attr.releaseDate || null,
        year: attr.releaseDate ? formatLocalizedYear(attr.releaseDate) : null,
        artworkUrl100: cleanArtworkUrl(attr.artwork?.url, 100, 100)
      };

      loadRemoteTrack(song);
    } catch (err) {
      console.error("[ID Loader] Failed:", err);
      prepOverlay.classList.remove('active');
      alert(`Could not load track ${id}: ${err.message}`);
    }
  }

  // ── URL Routing for /song id or /#songid ──
  function checkUrlRouting() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const path = window.location.pathname || '';

    // Check query params: ?song=123 or ?id=123
    const urlParams = new URLSearchParams(search);
    const querySongId = urlParams.get('song') || urlParams.get('id');
    if (querySongId && /^\d+$/.test(querySongId)) {
      loadTrackById(querySongId);
      return true;
    }

    // Check hash: #12345, #song/12345, #song=12345, #song12345, #/song/12345
    if (hash) {
      const cleaned = hash.replace(/^#\/?/, '');
      const numMatch = cleaned.match(/\d{5,}/);
      if (numMatch) {
        loadTrackById(numMatch[0]);
        return true;
      }
    }

    // Check path: /song/12345
    const pathMatch = path.match(/\/song\/(\d+)/);
    if (pathMatch) {
      loadTrackById(pathMatch[1]);
      return true;
    }

    return false;
  }

  window.addEventListener('hashchange', checkUrlRouting);

  // ── Context Menu (Desktop Dropdown & Mobile 76% Centered Modal) ──
  function showContextMenu(e, song) {
    contextMenuTrack = song;
    const isMobile = window.innerWidth <= 768;

    if (isMobile && mobileContextModal) {
      // Mobile 76% Centered Modal
      if (mobModalArt) mobModalArt.src = cleanArtworkUrl(song.artworkUrl100 || song.artUrl, 300, 300);
      if (mobModalTitle) mobModalTitle.textContent = song.trackName || song.name || 'Song';
      if (mobModalSub) mobModalSub.textContent = song.artistName || song.artist || '';

      const inLib = isSongInLibrary(song.trackId || song.id);
      if (mobCtxLibLabel) mobCtxLibLabel.textContent = inLib ? t('ctx_in_library') : t('ctx_add_library');

      mobileContextModal.classList.remove('hidden');

    } else if (songContextMenu) {
      // Desktop Floating Context Menu
      const inLib = isSongInLibrary(song.trackId || song.id);
      if (ctxAddLib) ctxAddLib.textContent = inLib ? t('ctx_in_library') : t('ctx_add_library');

      const clientX = e.clientX || e.pageX || 100;
      const clientY = e.clientY || e.pageY || 100;
      songContextMenu.style.left = `${Math.min(clientX, window.innerWidth - 220)}px`;
      songContextMenu.style.top = `${Math.min(clientY, window.innerHeight - 260)}px`;
      songContextMenu.classList.remove('hidden');
    }
  }

  function hideContextMenu() {
    if (songContextMenu) songContextMenu.classList.add('hidden');
    if (mobileContextModal) mobileContextModal.classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    if (songContextMenu && !songContextMenu.contains(e.target) && !e.target.classList.contains('am-song-more-btn') && !e.target.classList.contains('am-card-3dots-btn')) {
      songContextMenu.classList.add('hidden');
    }
    if (mobileContextModal && e.target === mobileContextModal) {
      mobileContextModal.classList.add('hidden');
    }
  });

  if (mobModalCloseBtn) {
    mobModalCloseBtn.onclick = hideContextMenu;
  }

  // Context Actions Handler
  const handleCtxPlay = () => {
    if (!contextMenuTrack) return;
    hideContextMenu();
    loadRemoteTrack(contextMenuTrack);
  };

  const handleCtxAddLib = () => {
    if (!contextMenuTrack) return;
    const songId = contextMenuTrack.trackId || contextMenuTrack.id;
    if (isSongInLibrary(songId)) {
      removeSongFromLibrary(songId);
      alert(t('ctx_removed_from_lib'));
    } else {
      addSongToLibrary(contextMenuTrack);
      alert(t('ctx_added_to_lib'));
    }
    hideContextMenu();
  };

  const handleCtxAddPlaylist = async () => {
    if (!contextMenuTrack) return;
    hideContextMenu();
    openPlaylistModal(contextMenuTrack);
  };

  // Direct Show Album Handler (Never falls back to plain search)
  const handleCtxViewAlbum = async () => {
    if (!contextMenuTrack) return;
    hideContextMenu();

    let albId = contextMenuTrack.albumId;

    // Resolve albumId via song lookup API if not directly present
    if (!albId && (contextMenuTrack.trackId || contextMenuTrack.id)) {
      const sId = contextMenuTrack.trackId || contextMenuTrack.id;
      try {
        const res = await fetch(`${API_BASE}/song?song=${sId}&l=${getCurrentLang()}`);
        if (res.ok) {
          const data = await res.json();
          const sObj = data.data?.[0] || data.results?.songs?.data?.[0];
          albId = sObj?.relationships?.albums?.data?.[0]?.id || sObj?.attributes?.url?.match(/\/album\/[^/]+\/(\d+)/)?.[1];
        }
      } catch (e) {}
    }

    // Resolve albumId via direct album search lookup
    if (!albId && contextMenuTrack.collectionName) {
      try {
        const aRes = await fetch(`${API_BASE}/search?term=${encodeURIComponent(contextMenuTrack.collectionName)}&types=albums&limit=5&l=${getCurrentLang()}`);
        if (aRes.ok) {
          const aData = await aRes.json();
          const found = aData.results?.albums?.data?.[0];
          if (found) albId = found.id;
        }
      } catch (e) {}
    }

    if (albId) {
      showAlbumView(albId);
    } else if (contextMenuTrack.collectionName) {
      switchPage('listen');
      catalogSearch.value = contextMenuTrack.collectionName;
      performCatalogSearch(contextMenuTrack.collectionName);
    }
  };

  // Direct Show Artist Handler (Always opens Artist Profile View directly)
  const handleCtxViewArtist = async () => {
    if (!contextMenuTrack) return;
    hideContextMenu();

    let artId = contextMenuTrack.artistId;
    let artName = contextMenuTrack.artistName || contextMenuTrack.artist || '';

    if (!artId && (contextMenuTrack.trackId || contextMenuTrack.id)) {
      const sId = contextMenuTrack.trackId || contextMenuTrack.id;
      try {
        const res = await fetch(`${API_BASE}/song?song=${sId}&l=${getCurrentLang()}`);
        if (res.ok) {
          const data = await res.json();
          const sObj = data.data?.[0] || data.results?.songs?.data?.[0];
          artId = sObj?.relationships?.artists?.data?.[0]?.id;
          if (!artName) artName = sObj?.attributes?.artistName || '';
        }
      } catch (e) {}
    }

    if (!artId && artName) {
      try {
        const artRes = await fetch(`${API_BASE}/search?term=${encodeURIComponent(artName)}&limit=10&l=${getCurrentLang()}`);
        if (artRes.ok) {
          const artData = await artRes.json();
          const found = artData.results?.artists?.data?.[0] || artData.results?.top?.data?.find(x => x.type === 'artists');
          if (found) {
            artId = found.id;
            artName = found.attributes?.name || artName;
          }
        }
      } catch (e) {}
    }

    showArtistView(artId || artName, artName || t('badge_artist'));
  };

  const handleCtxFavorite = async () => {
    if (!contextMenuTrack) return;
    hideContextMenu();
    const playlists = await getPlaylists();
    let favPlaylist = playlists.find(p => p.name === 'Favorites');
    if (!favPlaylist) {
      const favId = await createPlaylist('Favorites');
      favPlaylist = { id: favId, name: 'Favorites' };
    }
    await addTrackToPlaylist(favPlaylist.id, {
      name: contextMenuTrack.trackName || contextMenuTrack.name,
      artist: contextMenuTrack.artistName || contextMenuTrack.artist,
      album: contextMenuTrack.collectionName || contextMenuTrack.album,
      albumId: contextMenuTrack.albumId || null,
      artistId: contextMenuTrack.artistId || null,
      artUrl: cleanArtworkUrl(contextMenuTrack.artworkUrl100 || contextMenuTrack.artUrl, 600, 600),
      amTrackId: contextMenuTrack.trackId || contextMenuTrack.id
    }, null);
    alert(t('favorites_added'));
  };

  const handleCtxCopyId = () => {
    if (!contextMenuTrack) return;
    hideContextMenu();
    const id = contextMenuTrack.trackId || contextMenuTrack.id || '';
    if (id) {
      navigator.clipboard.writeText(String(id));
      alert(t('ctx_id_copied'));
    }
  };

  // Wire desktop context menu items
  if (ctxPlay) ctxPlay.onclick = handleCtxPlay;
  if (ctxAddLib) ctxAddLib.onclick = handleCtxAddLib;
  if (ctxAddPlaylist) ctxAddPlaylist.onclick = handleCtxAddPlaylist;
  if (ctxViewAlbum) ctxViewAlbum.onclick = handleCtxViewAlbum;
  if (ctxViewArtist) ctxViewArtist.onclick = handleCtxViewArtist;
  if (ctxFavorite) ctxFavorite.onclick = handleCtxFavorite;
  if (ctxCopyId) ctxCopyId.onclick = handleCtxCopyId;

  // Wire mobile context modal items
  if (mobCtxPlay) mobCtxPlay.onclick = handleCtxPlay;
  if (mobCtxAddLib) mobCtxAddLib.onclick = handleCtxAddLib;
  if (mobCtxAddPlaylist) mobCtxAddPlaylist.onclick = handleCtxAddPlaylist;
  if (mobCtxViewAlbum) mobCtxViewAlbum.onclick = handleCtxViewAlbum;
  if (mobCtxViewArtist) mobCtxViewArtist.onclick = handleCtxViewArtist;
  if (mobCtxFavorite) mobCtxFavorite.onclick = handleCtxFavorite;
  if (mobCtxCopyId) mobCtxCopyId.onclick = handleCtxCopyId;

  // ── Playlist Selection Modal ──
  async function openPlaylistModal(track) {
    if (!playlistModal) return;
    playlistModal.classList.remove('hidden');
    playlistOptionsList.innerHTML = `<div class="am-loading-msg">${t('loading_playlists')}</div>`;

    const playlists = await getPlaylists();
    const customPlaylists = playlists.filter(p => p.name !== 'Favorites');

    if (customPlaylists.length === 0) {
      playlistOptionsList.innerHTML = `<p class="am-empty-msg">${t('playlists_empty')}</p>`;
    } else {
      playlistOptionsList.innerHTML = customPlaylists.map(p => `
        <div class="playlist-option-item" data-id="${p.id}" style="padding:10px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);margin-bottom:8px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 10h12v2H4v-2zm0-4h12v2H4V6zm0 8h8v2H4v-2zm10 0v6l5-3-5-3z"/></svg>
          <span style="font-weight:600;">${escapeHTML(p.name)}</span>
        </div>
      `).join('');

      playlistOptionsList.querySelectorAll('.playlist-option-item').forEach(el => {
        el.onclick = async () => {
          const pId = parseInt(el.dataset.id, 10);
          await addTrackToPlaylist(pId, {
            name: track.trackName || track.name,
            artist: track.artistName || track.artist,
            album: track.collectionName || track.album,
            albumId: track.albumId || null,
            artistId: track.artistId || null,
            artUrl: cleanArtworkUrl(track.artworkUrl100 || track.artUrl, 600, 600),
            amTrackId: track.trackId || track.id
          }, null);
          playlistModal.classList.add('hidden');
          updateSidebarPlaylists();
          alert(t('playlist_added_track'));
        };
      });
    }
  }

  if (closePlaylistModal) {
    closePlaylistModal.onclick = () => playlistModal.classList.add('hidden');
  }

  if (modalCreatePlaylistBtn) {
    modalCreatePlaylistBtn.onclick = async () => {
      const name = prompt(t('prompt_enter_playlist_name'));
      if (name && name.trim()) {
        const id = await createPlaylist(name.trim());
        updateSidebarPlaylists();
        if (contextMenuTrack) {
          await addTrackToPlaylist(id, {
            name: contextMenuTrack.trackName || contextMenuTrack.name,
            artist: contextMenuTrack.artistName || contextMenuTrack.artist,
            album: contextMenuTrack.collectionName || contextMenuTrack.album,
            albumId: contextMenuTrack.albumId || null,
            artistId: contextMenuTrack.artistId || null,
            artUrl: cleanArtworkUrl(contextMenuTrack.artworkUrl100 || contextMenuTrack.artUrl, 600, 600),
            amTrackId: contextMenuTrack.trackId || contextMenuTrack.id
          }, null);
          alert(t('playlist_added_track'));
        }
        playlistModal.classList.add('hidden');
      }
    };
  }

  // ── Playlists View (User Playlists) ──
  async function renderPlaylistsPage() {
    if (!playlistsGrid) return;
    playlistDetail.classList.add('hidden');
    playlistsGrid.classList.remove('hidden');
    playlistsGrid.innerHTML = `<div class="am-loading-msg">${t('loading_playlists')}</div>`;

    const playlists = await getPlaylists();
    const displayList = playlists.filter(p => p.name !== 'Favorites');

    if (displayList.length === 0) {
      playlistsGrid.innerHTML = `<div class="am-error-msg">${t('playlists_empty')}</div>`;
      return;
    }

    const cardsHTML = await Promise.all(displayList.map(async p => {
      const tracks = await getPlaylistTracks(p.id);
      const firstArt = tracks[0]?.artUrl || 'favicon.svg';
      return `
        <div class="playlist-card animate-fade" data-id="${p.id}">
           <img src="${cleanArtworkUrl(firstArt, 300, 300)}" loading="lazy" referrerpolicy="no-referrer" class="playlist-card-art" alt="${escapeHTML(p.name)}" onerror="this.src='favicon.svg'">
           <div class="playlist-card-info">
             <h4>${escapeHTML(p.name)}</h4>
             <p>${t('lib_tracks_count', { count: tracks.length })}</p>
           </div>
           <button class="playlist-delete-btn" data-id="${p.id}" title="Delete Playlist">✕</button>
        </div>
      `;
    }));

    playlistsGrid.innerHTML = cardsHTML.join('');

    playlistsGrid.querySelectorAll('.playlist-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.classList.contains('playlist-delete-btn')) {
          e.stopPropagation();
          const pId = parseInt(card.dataset.id, 10);
          if (confirm(t('prompt_confirm_delete_playlist'))) {
            deletePlaylist(pId).then(() => {
              renderPlaylistsPage();
              updateSidebarPlaylists();
            });
          }
          return;
        }
        openLocalPlaylistDetail(parseInt(card.dataset.id, 10));
      };
    });
  }

  async function openLocalPlaylistDetail(playlistId) {
    playlistsGrid.classList.add('hidden');
    playlistDetail.classList.remove('hidden');

    const playlists = await getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    if (playlistDetailTitle) playlistDetailTitle.textContent = playlist?.name || 'Playlist';

    playlistTracksGrid.innerHTML = `<div class="am-loading-msg">${t('loading_tracks')}</div>`;
    const tracks = await getPlaylistTracks(playlistId);

    if (!tracks.length) {
      playlistTracksGrid.innerHTML = `<div class="am-error-msg">${t('playlists_empty_tracks')}</div>`;
      return;
    }

    renderTrackGrid(playlistTracksGrid, tracks, false);
  }

  if (playlistBackBtn) {
    playlistBackBtn.onclick = () => renderPlaylistsPage();
  }

  if (createPlaylistBtn) {
    createPlaylistBtn.onclick = async () => {
      const name = prompt(t('prompt_enter_playlist_name'));
      if (name && name.trim()) {
        await createPlaylist(name.trim());
        renderPlaylistsPage();
        updateSidebarPlaylists();
      }
    };
  }

  // ── Favorites Page ──
  async function renderFavoritesPage() {
    const favoriteGrid = document.getElementById('favorite-tracks-grid');
    if (!favoriteGrid) return;
    favoriteGrid.innerHTML = `<div class="am-loading-msg">${t('loading')}</div>`;

    const playlists = await getPlaylists();
    const favPlaylist = playlists.find(p => p.name === 'Favorites');
    if (!favPlaylist) {
      favoriteGrid.innerHTML = `<div class="am-error-msg">${t('favorites_empty')}</div>`;
      return;
    }
    const tracks = await getPlaylistTracks(favPlaylist.id);
    if (!tracks.length) {
      favoriteGrid.innerHTML = `<div class="am-error-msg">${t('favorites_empty')}</div>`;
    } else {
      renderTrackGrid(favoriteGrid, tracks, false);
    }
  }

  // ── Recent Page ──
  async function renderRecentPage() {
    const recentGrid = document.getElementById('recent-tracks-grid');
    if (!recentGrid) return;
    const recentTracks = JSON.parse(localStorage.getItem('spicy_recent_tracks') || '[]');
    if (!recentTracks.length) {
      recentGrid.innerHTML = `<div class="am-error-msg">${t('recent_empty')}</div>`;
    } else {
      renderTrackGrid(recentGrid, recentTracks, true);
    }
  }

  // ── Helper to render grids of tracks ──
  async function renderTrackGrid(container, tracks, isRemote = false) {
    if (!container) return;
    container.innerHTML = tracks.map((t, i) => {
      const safeName = escapeHTML(t.name || t.trackName || t.title || 'Unknown');
      const safeArtist = escapeHTML(t.artist || t.artistName || 'Unknown');
      const artUrl = cleanArtworkUrl(t.artUrl || t.artworkUrl100, 300, 300);
      return `
        <div class="trending-card animate-fade" data-index="${i}" data-id="${t.id || t.trackId || ''}">
          <div class="trending-art">
            <img src="${artUrl}" loading="lazy" referrerpolicy="no-referrer" alt="${safeName}" onerror="this.src='favicon.svg'">
          </div>
          <div class="trending-info">
            <h4>${safeName}</h4>
            <p>${safeArtist}</p>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.trending-card').forEach(card => {
      card.onclick = async () => {
        const idx = parseInt(card.dataset.index, 10);
        const track = tracks[idx];
        if (!track) return;

        if (prepOverlay) {
          prepOverlay.classList.add('active');
          prepStatus.textContent = t('loading_tracks');
        }

        try {
          await clearQueue();

          for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            let buffer = t.buffer;

            if (!buffer && (t.amTrackId || t.trackId)) {
              prepStatus.textContent = `Fetching ${i + 1}/${tracks.length}: ${t.name || t.trackName || ''}...`;
              const trackId = t.amTrackId || t.trackId;
              const audioUrl = `${API_BASE}/download?song=${trackId}`;
              const resp = await robustFetch(audioUrl, { skipProxy: true });
              buffer = await resp.arrayBuffer();

              if (t.id && (t.amTrackId || t.trackId)) {
                await updatePlaylistTrack(t.id, {
                  buffer,
                  type: isMP4Buffer(buffer) ? 'audio/mp4' : 'audio/mpeg'
                });
              }
            }

            const metadata = {
              name: t.name || t.trackName || t.title || 'Unknown',
              artist: t.artist || t.artistName || 'Unknown Artist',
              album: t.album || t.collectionName || '',
              albumId: t.albumId || null,
              artistId: t.artistId || null,
              artUrl: cleanArtworkUrl(t.artUrl || t.artworkUrl100, 600, 600),
              type: t.type || (buffer ? (isMP4Buffer(buffer) ? 'audio/mp4' : 'audio/mpeg') : 'audio/mpeg'),
              ttml: t.ttml || '__AUTO_FETCH__',
              amTrackId: t.amTrackId || t.trackId || null
            };
            await addTrackToQueue(buffer || null, metadata);
          }

          setCurrentIndex(idx);
          window.location.href = 'player.html';
        } catch (err) {
          console.error("Failed to load track grid:", err);
          if (prepOverlay) prepOverlay.classList.remove('active');
          alert('Error loading tracks: ' + err.message);
        }
      };
    });
  }

  // ── Remote Playlist View ──
  async function openRemotePlaylistView(playlistId, playlistName) {
    if (!playlistViewContainer) return;

    if (artistViewContainer) artistViewContainer.classList.add('hidden');
    if (albumViewContainer) albumViewContainer.classList.add('hidden');
    if (listenInitialContent) listenInitialContent.classList.add('hidden');
    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');
    playlistViewContainer.classList.remove('hidden');

    playlistViewContent.innerHTML = `<div class="am-loading-msg">${t('loading_playlist')}</div>`;

    try {
      const res = await fetch(`${API_BASE}/playlist?playlist=${playlistId}&limit=100&l=${getCurrentLang()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const tracks = data.parsed_tracks || [];
      const name = data.name || playlistName;
      const curator = data.curator_name || 'Apple Music';
      const description = data.description || '';
      const art = cleanArtworkUrl(data.artwork_url, 600, 600);

      const tracksHTML = tracks.map((t, i) => `
        <div class="am-track-row" data-id="${t.id}" data-idx="${i}">
          <div class="am-track-num">${i + 1}</div>
          ${t.artwork_url ? `<img src="${cleanArtworkUrl(t.artwork_url, 60, 60)}" class="am-song-row-art" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.src='favicon.svg'">` : ''}
          <div class="am-track-info">
            <div class="am-track-title">${escapeHTML(t.title || '')}</div>
            <div class="am-track-sub">${escapeHTML(t.artist || '')}${t.album ? ' • ' + escapeHTML(t.album) : ''}</div>
          </div>
          ${t.is_explicit ? '<span class="am-explicit-tag">E</span>' : ''}
          <div class="am-track-duration">${formatDuration(t.duration_ms)}</div>
          <button class="am-song-more-btn" data-id="${t.id}" data-idx="${i}">•••</button>
        </div>
      `).join('') || `<p class="am-empty-msg">${t('playlists_empty_tracks')}</p>`;

      playlistViewContent.innerHTML = `
        <div class="am-album-header am-detail-header am-playlist-header">
          <img src="${art}" class="am-album-art" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.src='favicon.svg'">
          <div class="am-album-meta am-detail-meta">
            <div class="am-detail-kicker">${t('badge_playlist')}</div>
            <h1 class="am-detail-title">${escapeHTML(name)}</h1>
            <h2 class="am-detail-artist">${escapeHTML(curator)}</h2>
            <p class="am-detail-sub">${t('lib_songs_count', { count: tracks.length })}</p>
            ${description ? `<p class="am-detail-desc">${escapeHTML(description.replace(/<[^>]*>/g, ''))}</p>` : ''}
          </div>
        </div>
        <div class="am-tracklist">${tracksHTML}</div>
        <div class="am-album-footer-info">
          <p class="am-footer-date">${escapeHTML(curator)} • ${t('lib_songs_count', { count: tracks.length })}</p>
        </div>
      `;

      playlistViewContent.querySelectorAll('.am-track-row').forEach((row, idx) => {
        row.onclick = (e) => {
          const track = tracks[idx];
          if (!track) return;
          const albumId = track.relationships?.albums?.data?.[0]?.id || track.artwork_url?.match(/\/album\/[^/]+\/(\d+)/)?.[1] || null;
          const artistId = track.relationships?.artists?.data?.[0]?.id || null;

          if (e.target.classList.contains('am-song-more-btn')) {
            e.stopPropagation();
            showContextMenu(e, {
              trackId: track.id,
              trackName: track.title,
              artistName: track.artist,
              collectionName: track.album || name,
              albumId: albumId,
              artistId: artistId,
              artworkUrl100: track.artwork_url
            });
            return;
          }
          loadRemoteTrack({
            trackId: track.id,
            trackName: track.title,
            artistName: track.artist,
            collectionName: track.album || name,
            albumId: albumId,
            artistId: artistId,
            artworkUrl100: cleanArtworkUrl(track.artwork_url, 100, 100)
          });
        };
      });
    } catch (err) {
      console.error("Failed to load playlist:", err);
      playlistViewContent.innerHTML = `<div class="am-error-msg">${t('error')}: ${err.message}</div>`;
    }
  }

  // ── TTML Downloader Logic ──
  if (fetchTtmlBtn) {
    fetchTtmlBtn.onclick = async () => {
      const songId = ttmlSongIdInput.value.trim();
      if (!songId) return;

      fetchTtmlBtn.disabled = true;
      ttmlStatus.textContent = t('ttml_status_extracting');

      try {
        const metadata = await TTMLDownloader.fetchMetadata(songId);
        currentFetchedSong = metadata;

        ttmlPreviewName.textContent = metadata.name;
        ttmlPreviewArtist.textContent = metadata.artist;
        ttmlPreviewArt.src = metadata.artUrl;

        const ttml = await TTMLDownloader.fetchTTML(songId);
        if (!ttml) throw new Error(t('ttml_status_no_lyrics'));

        currentFetchedTTML = ttml;
        ttmlCodeBlock.textContent = ttml;
        ttmlResultContainer.classList.remove('hidden');
        downloadTtmlBtn.disabled = false;
        ttmlStatus.textContent = t('ttml_status_success');
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
  function formatDuration(ms) {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

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

  function addToRecent(track) {
    let recent = JSON.parse(localStorage.getItem('spicy_recent_tracks') || '[]');
    recent = recent.filter(t => (t.trackId || t.id) !== (track.trackId || track.id));
    recent.unshift(track);
    if (recent.length > 50) recent.pop();
    localStorage.setItem('spicy_recent_tracks', JSON.stringify(recent));
    syncHomeNavVisibility();
  }

  // ── Initial Start Sequence ──
  updateSidebarPlaylists();
  syncHomeNavVisibility();

  // Check URL routing first (e.g. /song id or /#songid)
  const routed = checkUrlRouting();
  if (!routed) {
    if (hasListenedSongs()) {
      switchPage('home');
    } else {
      switchPage('listen');
    }
  }
});
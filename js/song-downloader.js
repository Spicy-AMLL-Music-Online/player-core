/**
 * song-downloader.js
 * Handles fetching audio tracks via M4A/conversion backends.
 */
import { t, getCurrentLang } from './i18n.js';

const API_BASE = 'https://spicyamllplayer-api.hf.space';

document.addEventListener('DOMContentLoaded', () => {
  const inputEl = document.getElementById('dl-song-input');
  const formatSelect = document.getElementById('dl-song-format');
  const fetchBtn = document.getElementById('fetch-song-btn');
  if (!fetchBtn || !inputEl) return;
  const btnText = fetchBtn.querySelector('.btn-text');
  const btnLoader = fetchBtn.querySelector('.btn-loader');
  const statusEl = document.getElementById('dl-song-status');
  const searchResultsEl = document.getElementById('dl-search-results');

  const setStatus = (message, isError = false) => {
    statusEl.textContent = message;
    statusEl.className = 'status-indicator ' + (isError ? 'error showing' : 'showing');
    setTimeout(() => { if (statusEl.textContent === message) statusEl.classList.remove('showing'); }, 5000);
  };

  const setLoading = (loading) => {
    fetchBtn.disabled = loading;
    if (loading) {
      btnText.classList.add('hidden');
      btnLoader.classList.remove('hidden');
    } else {
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
    }
  };

  const triggerDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadTrack = (songIdOrUrl, name, isVideo = false) => {
    const format = formatSelect ? formatSelect.value : 'm4a';
    searchResultsEl.classList.add('hidden');
    
    if (isVideo || String(songIdOrUrl).includes('/music-video/') || format === 'mp4') {
      setStatus(`${t('loading_download')} (${name || 'Music Video'})`);
      const url = `${API_BASE}/musicvideo/download?song=${encodeURIComponent(songIdOrUrl)}&quality=4k&l=${getCurrentLang()}`;
      triggerDownload(url, `${name || 'Music_Video'}.mp4`);
      setLoading(false);
      return;
    }

    if (format === 'm4a') {
      const url = `${API_BASE}/download?song=${encodeURIComponent(songIdOrUrl)}&l=${getCurrentLang()}`;
      setStatus(`${t('loading_download')} (${name || songIdOrUrl})`);
      triggerDownload(url, `Song_${name || songIdOrUrl}.m4a`);
      setLoading(false);
    } else {
      setStatus(`Requesting conversion to ${format.toUpperCase()} for ${name || songIdOrUrl}...`);
      const url = `${API_BASE}/convert?song=${encodeURIComponent(songIdOrUrl)}&fmt=${format}&l=${getCurrentLang()}`;
      triggerDownload(url, `Song_${name || songIdOrUrl}.${format}`);
      setStatus('Conversion requested. Download will start automatically when ready.');
      setLoading(false);
    }
  };

  const processDownload = async () => {
    const query = inputEl.value.trim();
    if (!query) {
      setStatus(t('song_downloader_placeholder'), true);
      return;
    }

    setLoading(true);
    searchResultsEl.classList.add('hidden');
    searchResultsEl.innerHTML = '';

    try {
      // If it's a full Apple Music URL or raw numeric ID, download directly
      if (/^https?:\/\//i.test(query) || /^\d+$/.test(query)) {
        const isVideo = query.includes('/music-video/');
        setStatus(t('loading_download'));
        downloadTrack(query, query, isVideo);
        return;
      }

      // Otherwise search
      setStatus(t('loading'));
      const searchRes = await fetch(`${API_BASE}/search?term=${encodeURIComponent(query)}&types=songs,music-videos&limit=10&l=${getCurrentLang()}`);
      if (!searchRes.ok) throw new Error('Search failed');
      const searchData = await searchRes.json();

      let foundSongs = searchData?.results?.songs?.data || [];
      let foundVideos = searchData?.results?.['music-videos']?.data || [];
      let combined = [...foundSongs, ...foundVideos];

      if (combined.length === 0) {
        throw new Error('No songs or music videos found for that query.');
      }

      // Render search results
      setStatus(`Found ${combined.length} results.`);
      setLoading(false);
      btnText.textContent = t('nav_search');
      
      combined.forEach(item => {
        const attr = item.attributes || {};
        const isMv = item.type === 'music-videos' || item.type === 'music-video';
        const artUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}', '100').replace('{h}', '100').replace('{f}', 'jpg') : '';
        
        const itemEl = document.createElement('div');
        itemEl.className = 'dl-search-item';

        const imgEl = document.createElement('img');
        imgEl.className = 'dl-search-art';
        imgEl.alt = 'Art';
        imgEl.src = artUrl;

        const infoEl = document.createElement('div');
        infoEl.className = 'dl-search-info';

        const titleEl = document.createElement('h4');
        titleEl.className = 'dl-search-title';
        titleEl.textContent = (isMv ? '🎬 ' : '') + (attr.name || 'Unknown');

        const artistEl = document.createElement('p');
        artistEl.className = 'dl-search-artist';
        artistEl.textContent = attr.artistName || '';

        infoEl.appendChild(titleEl);
        infoEl.appendChild(artistEl);
        itemEl.appendChild(imgEl);
        itemEl.appendChild(infoEl);
        
        itemEl.addEventListener('click', () => {
          setLoading(true);
          btnText.textContent = t('loading_download');
          downloadTrack(item.id, attr.name, isMv);
        });
        
        searchResultsEl.appendChild(itemEl);
      });
      
      searchResultsEl.classList.remove('hidden');

    } catch (e) {
      console.error(e);
      setStatus(e.message || t('error'), true);
      setLoading(false);
    }
  };

  fetchBtn.addEventListener('click', processDownload);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') processDownload();
  });
});

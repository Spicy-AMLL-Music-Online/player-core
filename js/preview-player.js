/**
 * Spicy AMLL Player — Album Preview Audio Player
 * Plays 30s audio previews from Apple Music album data JSON with a sleek mini player
 * at the bottom, MediaSession OS controls, and native AMLL icons.
 */

import { escapeHTML } from './security-utils.js';
import { t } from './i18n.js';

export class PreviewPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isMuted = false;
    this.albumTitle = '';
    this.albumArt = '';
    this.container = null;
    this.wakeLock = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._initDOM());
    } else {
      this._initDOM();
    }
    this._bindAudioEvents();
    this._initMediaSession();
  }

  _initDOM() {
    let el = document.getElementById('am-preview-mini-player');
    if (!el) {
      el = document.createElement('div');
      el.id = 'am-preview-mini-player';
      el.className = 'am-preview-mini-player hidden';
      el.innerHTML = `
        <div class="am-preview-progress-container" id="am-preview-progress-wrap">
          <div class="am-preview-progress-bar" id="am-preview-progress-bar"></div>
        </div>
        <div class="am-preview-inner">
          <!-- Left: Artwork & Info -->
          <div class="am-preview-info-col">
            <img src="favicon.svg" class="am-preview-art" id="am-preview-art" alt="Cover" onerror="this.src='favicon.svg'">
            <div class="am-preview-text">
              <div class="am-preview-title" id="am-preview-title">Track Title</div>
              <div class="am-preview-sub" id="am-preview-sub">Artist • Album</div>
            </div>
          </div>

          <!-- Center: Controls & Timeline -->
          <div class="am-preview-controls-col">
            <div class="am-preview-btn-row">
              <button class="am-preview-btn" id="am-preview-prev-btn" title="Previous Preview" aria-label="Previous">
                <img src="icons/rewind.png" alt="Prev">
              </button>
              <button class="am-preview-btn am-preview-play-btn" id="am-preview-play-btn" title="Play / Pause" aria-label="Play / Pause">
                <img src="icons/paused.png" id="am-preview-play-icon" alt="Play">
              </button>
              <button class="am-preview-btn" id="am-preview-next-btn" title="Next Preview" aria-label="Next">
                <img src="icons/forward.png" alt="Next">
              </button>
            </div>
            <div class="am-preview-timeline">
              <span class="am-preview-time" id="am-preview-curr-time">0:00</span>
              <input type="range" class="am-preview-seek-slider" id="am-preview-seek" min="0" max="100" value="0" step="0.1">
              <span class="am-preview-time" id="am-preview-dur-time">0:30</span>
            </div>
          </div>

          <!-- Right: Badge, Volume & Close -->
          <div class="am-preview-actions-col">
            <span class="am-preview-badge">30s Preview</span>
            <button class="am-preview-btn am-preview-vol-btn" id="am-preview-vol-btn" title="Mute / Unmute" aria-label="Volume">
              <img src="icons/volume_full.png" id="am-preview-vol-icon" alt="Volume">
            </button>
            <button class="am-preview-btn am-preview-close-btn" id="am-preview-close-btn" title="Close Preview Player" aria-label="Close">
              ✕
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }
    this.container = el;

    // Cache elements
    this.artEl = el.querySelector('#am-preview-art');
    this.titleEl = el.querySelector('#am-preview-title');
    this.subEl = el.querySelector('#am-preview-sub');
    this.playIcon = el.querySelector('#am-preview-play-icon');
    this.playBtn = el.querySelector('#am-preview-play-btn');
    this.prevBtn = el.querySelector('#am-preview-prev-btn');
    this.nextBtn = el.querySelector('#am-preview-next-btn');
    this.volBtn = el.querySelector('#am-preview-vol-btn');
    this.volIcon = el.querySelector('#am-preview-vol-icon');
    this.closeBtn = el.querySelector('#am-preview-close-btn');
    this.currTimeEl = el.querySelector('#am-preview-curr-time');
    this.durTimeEl = el.querySelector('#am-preview-dur-time');
    this.seekSlider = el.querySelector('#am-preview-seek');
    this.progressBar = el.querySelector('#am-preview-progress-bar');
    this.progressWrap = el.querySelector('#am-preview-progress-wrap');

    // Attach DOM Events with event listeners
    if (this.playBtn) {
      this.playBtn.onclick = (e) => {
        e.stopPropagation();
        this.togglePlay();
      };
    }
    if (this.prevBtn) {
      this.prevBtn.onclick = (e) => {
        e.stopPropagation();
        this.prev();
      };
    }
    if (this.nextBtn) {
      this.nextBtn.onclick = (e) => {
        e.stopPropagation();
        this.next();
      };
    }
    if (this.volBtn) {
      this.volBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleMute();
      };
    }
    if (this.closeBtn) {
      this.closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      };
    }

    // Direct event listener on container to handle close delegation safely
    el.addEventListener('click', (e) => {
      const closeTarget = e.target.closest('#am-preview-close-btn') || e.target.closest('.am-preview-close-btn');
      if (closeTarget) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });

    if (this.seekSlider) {
      this.seekSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (this.audio.duration) {
          const seekTime = (val / 100) * this.audio.duration;
          this.audio.currentTime = seekTime;
        }
      };
    }

    if (this.progressWrap) {
      this.progressWrap.onclick = (e) => {
        const rect = this.progressWrap.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        if (this.audio.duration) {
          this.audio.currentTime = Math.max(0, Math.min(pos * this.audio.duration, this.audio.duration));
        }
      };
    }
  }

  _bindAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this._updatePlayButton(true);
      this._updateMediaSessionState('playing');
      this._requestWakeLock();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._updatePlayButton(false);
      this._updateMediaSessionState('paused');
      this._releaseWakeLock();
    });

    this.audio.addEventListener('ended', () => {
      this.next(true);
    });

    this.audio.addEventListener('timeupdate', () => {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || 30;
      const percent = (cur / dur) * 100;

      if (this.progressBar) this.progressBar.style.width = `${percent}%`;
      if (this.seekSlider) this.seekSlider.value = percent;
      if (this.currTimeEl) this.currTimeEl.textContent = this._formatTime(cur);
      if (this.durTimeEl) this.durTimeEl.textContent = this._formatTime(dur);
    });

    this.audio.addEventListener('error', (err) => {
      console.warn('[PreviewPlayer] Audio error on track, skipping to next:', err);
      setTimeout(() => this.next(true), 500);
    });
  }

  _initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.audio.currentTime = details.seekTime;
        }
      });
    } catch (e) {
      console.warn('[PreviewPlayer] MediaSession init error:', e);
    }
  }

  _updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${track.title || 'Preview'} (Preview)`,
        artist: track.artist || 'Apple Music',
        album: track.album || this.albumTitle || 'Preview Album',
        artwork: track.artUrl ? [
          { src: track.artUrl, sizes: '512x512', type: 'image/jpeg' },
          { src: track.artUrl, sizes: '256x256', type: 'image/jpeg' }
        ] : []
      });
    } catch (e) {}
  }

  _updateMediaSessionState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  async _requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }

  _releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  _updatePlayButton(isPlaying) {
    if (!this.playIcon) this.playIcon = document.getElementById('am-preview-play-icon');
    if (this.playIcon) {
      this.playIcon.src = isPlaying ? 'icons/play.png' : 'icons/paused.png';
      this.playIcon.alt = isPlaying ? 'Pause' : 'Play';
    }
    if (this.container) {
      if (isPlaying) this.container.classList.add('playing');
      else this.container.classList.remove('playing');
    }
  }

  _formatTime(sec) {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  /**
   * Start preview playback of an entire album
   * @param {Object} albumData - Album response containing raw_data / parsed_tracks
   * @param {number} startIndex - Starting track index
   */
  playAlbum(albumData, startIndex = 0) {
    const albumObj = albumData?.raw_data?.data?.[0] || albumData?.data?.[0] || albumData?.results?.albums?.data?.[0] || albumData || {};
    const attr = albumObj.attributes || albumObj;
    this.albumTitle = attr.name || 'Album';
    this.albumArt = attr.artwork?.url ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600').replace('{c}', '').replace('{f}', 'jpg') : 'favicon.svg';

    const relTracks = albumObj.relationships?.tracks?.data || [];
    const parsed = albumData.parsed_tracks || [];

    let queue = [];

    // Parse tracks with preview URLs
    if (relTracks.length > 0) {
      queue = relTracks.map(t => {
        const tAttr = t.attributes || {};
        const previewUrl = tAttr.previews?.[0]?.url || tAttr.previewUrl || '';
        const art = tAttr.artwork?.url ? tAttr.artwork.url.replace('{w}', '300').replace('{h}', '300').replace('{c}', '').replace('{f}', 'jpg') : this.albumArt;
        return {
          id: t.id,
          title: tAttr.name || 'Unknown Track',
          artist: tAttr.artistName || attr.artistName || '',
          album: tAttr.albumName || this.albumTitle,
          artUrl: art,
          previewUrl: previewUrl,
          durationMs: tAttr.durationInMillis || 30000
        };
      });
    } else if (parsed.length > 0) {
      queue = parsed.map(t => ({
        id: t.id,
        title: t.title || t.name || 'Unknown Track',
        artist: t.artist || t.artistName || attr.artistName || '',
        album: t.album || this.albumTitle,
        artUrl: t.artwork_url || this.albumArt,
        previewUrl: t.preview_url || t.previewUrl || '',
        durationMs: t.duration_ms || 30000
      }));
    }

    if (queue.length === 0) {
      alert(t('error') || 'No preview tracks found for this album.');
      return;
    }

    this.queue = queue;
    this.currentIndex = Math.max(0, Math.min(startIndex, queue.length - 1));
    this.loadCurrentTrack(true);
  }

  /**
   * Play a specific track or custom track list
   */
  playTrack(track, queue = []) {
    if (queue && queue.length > 0) {
      this.queue = queue;
      const foundIdx = this.queue.findIndex(x => String(x.id) === String(track.id));
      this.currentIndex = foundIdx >= 0 ? foundIdx : 0;
    } else {
      this.queue = [track];
      this.currentIndex = 0;
    }
    this.loadCurrentTrack(true);
  }

  loadCurrentTrack(autoPlay = true) {
    if (!this.queue || this.queue.length === 0) return;
    const track = this.queue[this.currentIndex];
    if (!track) return;

    if (!this.container) this._initDOM();

    // Update UI elements
    if (this.artEl) this.artEl.src = track.artUrl || 'favicon.svg';
    if (this.titleEl) this.titleEl.textContent = track.title || 'Track';
    if (this.subEl) this.subEl.textContent = `${track.artist || ''}${track.album ? ' • ' + track.album : ''}`;

    // Highlight row in active album grid
    this._highlightTrackRow(track.id);

    // Show mini player
    if (this.container) {
      this.container.style.display = 'block';
      this.container.classList.remove('hidden');
      this.container.classList.add('visible');
    }

    // Update MediaSession metadata
    this._updateMediaSessionMetadata(track);

    // Set audio source
    if (track.previewUrl) {
      this.audio.src = track.previewUrl;
      if (autoPlay) {
        this.audio.play().catch(e => {
          console.warn('[PreviewPlayer] Autoplay prevented:', e);
        });
      }
    } else {
      // If previewUrl is missing on track object, fetch song preview directly
      this._fetchAndPlayPreview(track.id, autoPlay);
    }
  }

  async _fetchAndPlayPreview(songId, autoPlay = true) {
    try {
      const res = await fetch(`https://spicyamllplayer-api.hf.space/song?song=${songId}`);
      if (res.ok) {
        const d = await res.json();
        const sObj = d.data?.[0] || d.results?.songs?.data?.[0];
        const previewUrl = sObj?.attributes?.previews?.[0]?.url;
        if (previewUrl) {
          if (this.queue[this.currentIndex]) {
            this.queue[this.currentIndex].previewUrl = previewUrl;
          }
          this.audio.src = previewUrl;
          if (autoPlay) this.audio.play().catch(() => {});
          return;
        }
      }
    } catch (e) {}

    // Fallback: Skip to next track with preview
    setTimeout(() => this.next(true), 500);
  }

  _highlightTrackRow(trackId) {
    document.querySelectorAll('.am-track-row').forEach(row => {
      if (String(row.dataset.id) === String(trackId)) {
        row.classList.add('preview-active');
      } else {
        row.classList.remove('preview-active');
      }
    });
  }

  play() {
    if (this.audio.src) {
      this.audio.play().catch(() => {});
    } else if (this.queue.length > 0) {
      this.loadCurrentTrack(true);
    }
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  next(auto = false) {
    if (this.queue.length === 0) return;
    if (this.currentIndex < this.queue.length - 1) {
      this.currentIndex++;
      this.loadCurrentTrack(true);
    } else if (!auto) {
      // Loop to start if manually pressed next
      this.currentIndex = 0;
      this.loadCurrentTrack(true);
    } else {
      // Ended last track
      this.pause();
      this.audio.currentTime = 0;
    }
  }

  prev() {
    if (this.queue.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
    } else if (this.currentIndex > 0) {
      this.currentIndex--;
      this.loadCurrentTrack(true);
    } else {
      this.audio.currentTime = 0;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    if (this.volIcon) {
      this.volIcon.src = this.isMuted ? 'icons/volume_low.png' : 'icons/volume_full.png';
    }
  }

  close() {
    this.pause();
    this.audio.src = '';
    if (this.container) {
      this.container.classList.remove('visible');
      this.container.classList.add('hidden');
      this.container.style.display = 'none';
    }
    this._highlightTrackRow(null);
    this._updateMediaSessionState('none');
    this._releaseWakeLock();
  }
}

// Global Singleton Instance
export const previewPlayer = new PreviewPlayer();

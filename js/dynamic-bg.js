import dybg from 'https://nurislamaibekuly.github.io/dybg/dybg.js';

let _dybg = null;
let _videoUpdateTimer = null;

// Hidden canvas for frame capture fallback
const _sourceCanvas = document.createElement('canvas');
const _sourceCtx = _sourceCanvas.getContext('2d', { alpha: false });
_sourceCanvas.width = 128;
_sourceCanvas.height = 128;

export async function extractColors(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size).data;
      const colors = [];

      for (let i = 0; i < imageData.length; i += 16) {
        colors.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
      }

      colors.sort((a, b) => {
        const satA = getColorSaturation(a);
        const satB = getColorSaturation(b);
        return satB - satA;
      });

      resolve({
        vibrant: colors[0] || [80, 80, 80],
        dark: darkenColor(colors[Math.floor(colors.length * 0.6)] || [30, 30, 30], 0.4),
        muted: colors[Math.floor(colors.length * 0.3)] || [60, 60, 60],
      });
    };
    img.onerror = () => {
      resolve({
        vibrant: [80, 80, 80],
        dark: [20, 20, 20],
        muted: [50, 50, 50],
      });
    };
    img.src = imageUrl;
  });
}

function getColorSaturation(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function darkenColor(rgb, amount) {
  return rgb.map(c => Math.floor(c * amount));
}

export async function applyLegacyBackground(bgContainer, img) {
  stopKawarp();

  bgContainer.innerHTML = "";
  bgContainer.className = "spicy-dynamic-bg";

  // Create canvas matching index.html (#bgCanvas)
  const canvas = document.createElement('canvas');
  canvas.className = "spicy-dybg-canvas";
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
  bgContainer.appendChild(canvas);

  try {
    _dybg = new dybg(canvas);
  } catch (e) {
    console.error("Failed to initialize dybg:", e);
    return;
  }

  // Configure parameters for active fluid animation
  if (typeof _dybg.setFlowSpeed === 'function') {
    _dybg.setFlowSpeed(0.8);
  }
  if (typeof _dybg.setRenderScale === 'function') {
    _dybg.setRenderScale(0.5);
  }
  if (typeof _dybg.resume === 'function') {
    _dybg.resume();
  } else if (typeof _dybg.play === 'function') {
    _dybg.play();
  }

  const loadSource = async () => {
    if (!_dybg) return;
    try {
      if (typeof _dybg.setAlbum === 'function') {
        await _dybg.setAlbum(img, img instanceof HTMLVideoElement);
      } else if (typeof _dybg.setAlbumImage === 'function') {
        await _dybg.setAlbumImage(img);
      } else if (typeof _dybg.load === 'function') {
        await _dybg.load(img);
      }
    } catch (err) {
      console.warn("dybg setAlbum failed:", img, err);
    }
  };

  await loadSource();

  requestAnimationFrame(() => {
    bgContainer.classList.add('loaded', 'active');
  });

  if (img instanceof HTMLVideoElement) {
    const updateFrame = () => {
      if (!_dybg) return;
      if (img.readyState >= 2 && img.videoWidth > 0 && img.videoHeight > 0) {
        if (typeof _dybg.setAlbum === 'function') {
          _dybg.setAlbum(img, true);
        } else if (typeof _dybg.setAlbumImage === 'function') {
          _dybg.setAlbumImage(img);
        }
      }
      _videoUpdateTimer = setTimeout(updateFrame, 200);
    };

    _videoUpdateTimer = setTimeout(updateFrame, 200);
  }
}

export function stopKawarp() {
  const bgContainer = document.querySelector('.spicy-dynamic-bg');
  if (bgContainer) {
    bgContainer.classList.remove('loaded', 'active');
  }
  if (_videoUpdateTimer) {
    clearTimeout(_videoUpdateTimer);
    _videoUpdateTimer = null;
  }
  if (_dybg) {
    try {
      if (typeof _dybg.dispose === 'function') {
        _dybg.dispose();
      } else if (typeof _dybg.destroy === 'function') {
        _dybg.destroy();
      }
    } catch (e) {
      console.warn("[dybg] Error disposing:", e);
    }
    _dybg = null;
  }
}

export function setKawarpPlaybackState(isPlaying) {
  if (_dybg) {
    if (isPlaying) {
      if (typeof _dybg.resume === 'function') {
        _dybg.resume();
      } else if (typeof _dybg.play === 'function') {
        _dybg.play();
      }
    } else {
      if (typeof _dybg.pause === 'function') {
        _dybg.pause();
      }
    }
  }
}

/**
 * Drive the dybg low-frequency volume effect (bass-reactive twist/zoom).
 * @param {number} level01 Normalized beat envelope 0..1 from
 *   AudioPlayer.getLowFreqLevel(). Fall back to 0 when no tape is running.
 *
 * NOTE: dybg scales this by 1/10 internally, so to make a full-strength beat
 * visibly punch (roughly 70% zoom) the value must go in an order of magnitude
 * hotter than a raw 0..1 level.
 */
export function setKawarpVolume(level01) {
  if (_dybg && typeof _dybg.setLowFreqVolume === 'function') {
    const raw = Math.max(0, Math.min(0.6, level01 || 0));
    _dybg.setLowFreqVolume(raw * 0.8);
  }
}

/**
 * Apply a simple color gradient background.
 * @param {HTMLElement} bgContainer
 * @param {{vibrant: number[], dark: number[]}} colors
 */
export function applyColorBackground(bgContainer, colors) {
  stopKawarp();
  bgContainer.className = "spicy-dynamic-bg ColorBackground";
  bgContainer.style.setProperty('--MinContrastColor', colors.dark.join(', '));
  bgContainer.style.setProperty('--HighContrastColor', colors.vibrant.map(c => Math.floor(c * 0.3)).join(', '));
}

/**
 * Create a default dark background when no image is available.
 * @param {HTMLElement} bgContainer
 */
export function applyDefaultBackground(bgContainer) {
  stopKawarp();
  bgContainer.className = "spicy-dynamic-bg ColorBackground";
  bgContainer.style.setProperty('--MinContrastColor', '18, 18, 18');
  bgContainer.style.setProperty('--HighContrastColor', '8, 8, 8');
}

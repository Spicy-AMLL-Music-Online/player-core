import Dybg from 'https://nurislamaibekuly.github.io/dybg/dybg.js';

let _dybg = null;
let _videoUpdateTimer = null;

// Hidden canvas for frame capture (reused for video)
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

  _dybg = new Dybg({
    container: bgContainer,
    blur: 100,
    layers: 3,
    speed: 0.8,
    twist: 1,
  });

  if (_dybg._outCanvas) _dybg._outCanvas.style.filter = 'none';
  if (_dybg._fbCanvas) _dybg._fbCanvas.style.filter = 'none';

  const loadSource = async () => {
    if (!_dybg) return;
    if (img instanceof HTMLVideoElement) {
      if (img.readyState >= 2 && img.videoWidth > 0 && img.videoHeight > 0) {
        _sourceCanvas.width = img.videoWidth;
        _sourceCanvas.height = img.videoHeight;
        _sourceCtx.drawImage(img, 0, 0, _sourceCanvas.width, _sourceCanvas.height);
        _sourceCanvas.toBlob((blob) => {
          if (_dybg) _dybg.load(blob);
        }, 'image/jpeg', 0.5);
      }
    } else if (typeof img === 'string') {
      try {
        await _dybg.load(img);
      } catch (err) {
        console.warn("Dybg failed to load image URL:", img, err);
      }
    } else if (img instanceof HTMLImageElement) {
      _dybg.load(img);
    }
  };

  await loadSource();

  if (img instanceof HTMLVideoElement) {
    const updateFrame = () => {
      if (!_dybg) return;
      if (img.readyState >= 2 && img.videoWidth > 0 && img.videoHeight > 0) {
        if (_sourceCanvas.width !== img.videoWidth || _sourceCanvas.height !== img.videoHeight) {
          _sourceCanvas.width = img.videoWidth;
          _sourceCanvas.height = img.videoHeight;
        }
        _sourceCtx.drawImage(img, 0, 0, _sourceCanvas.width, _sourceCanvas.height);
        _sourceCanvas.toBlob((blob) => {
          if (_dybg) _dybg.load(blob);
        }, 'image/jpeg', 0.5);
      }
      _videoUpdateTimer = setTimeout(updateFrame, 100);
    };

    _videoUpdateTimer = setTimeout(updateFrame, 100);
  }
}

export function stopKawarp() {
  if (_videoUpdateTimer) {
    clearTimeout(_videoUpdateTimer);
    _videoUpdateTimer = null;
  }
  if (_dybg) {
    try {
      _dybg.destroy();
    } catch (e) {
      console.warn("[Dybg] Error disposing:", e);
    }
    _dybg = null;
  }
}

export function setKawarpPlaybackState(isPlaying) {
  if (_dybg) {
    if (isPlaying) {
      _dybg.play();
    } else {
      _dybg.pause();
    }
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

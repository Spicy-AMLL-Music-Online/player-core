/**
 * Spicy AMLL Player — User Profile & Setup Wizard
 * Manages user profile, macOS styled Setup Assistant modal,
 * and Index.html Profile Settings modal with Player Settings iframe.
 */

import { SUPPORTED_LANGUAGES, getCurrentLang, setLanguage, t, detectBrowserLanguage } from './i18n.js';
import { settingsUI } from './settings-ui.js';

const PROFILE_KEY = 'spicy_user_profile';
const SETUP_KEY = 'spicy_user_setup_done';

const DEFAULT_PFP = 'icons/account_avatar.png';
const DEFAULT_NAME = 'Listener';

export const PRESET_AVATARS = [
  'icons/account_avatar.png',
  'favicon.svg',
  'icon.png'
];

export function getUserProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        name: p.name || DEFAULT_NAME,
        pfp: p.pfp || DEFAULT_PFP,
        lang: p.lang || getCurrentLang()
      };
    }
  } catch (e) {
    console.error('[Profile] Failed to read profile:', e);
  }
  return {
    name: DEFAULT_NAME,
    pfp: DEFAULT_PFP,
    lang: getCurrentLang()
  };
}

export function saveUserProfile(profile) {
  try {
    const curr = getUserProfile();
    const merged = { ...curr, ...profile };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
    if (profile.lang && profile.lang !== getCurrentLang()) {
      setLanguage(profile.lang);
    }
    updateProfileUI();
    window.dispatchEvent(new CustomEvent('spicy-profile-updated', { detail: merged }));
  } catch (e) {
    console.error('[Profile] Failed to save profile:', e);
  }
}

export function updateProfileUI() {
  const profile = getUserProfile();
  // Update header profile button avatar
  const avatarImgs = document.querySelectorAll('.user-profile-avatar-img');
  avatarImgs.forEach(img => {
    img.src = profile.pfp || DEFAULT_PFP;
  });

  // Update greeting text if present
  const greetEls = document.querySelectorAll('.user-profile-name-text');
  greetEls.forEach(el => {
    el.textContent = profile.name || DEFAULT_NAME;
  });

  const homeGreetingHeading = document.getElementById('home-greeting-heading');
  if (homeGreetingHeading) {
    homeGreetingHeading.textContent = `${t('home_welcome', { name: profile.name || DEFAULT_NAME })} 👋`;
  }

  const homeRecommendedTitle = document.getElementById('home-recommended-title');
  if (homeRecommendedTitle) {
    homeRecommendedTitle.textContent = t('home_recommended_for', { name: profile.name || DEFAULT_NAME });
  }
}

/**
 * Checks if first-time setup is needed and displays macOS style modal.
 */
export function checkFirstTimeSetup() {
  const isDone = localStorage.getItem(SETUP_KEY);
  if (!isDone) {
    showSetupAssistant();
  } else {
    updateProfileUI();
  }
}

/**
 * macOS Window Style Setup Assistant
 */
export function showSetupAssistant() {
  // Check if existing modal is open
  const existing = document.getElementById('spicy-setup-modal');
  if (existing) existing.remove();

  const detectedLang = detectBrowserLanguage();
  setLanguage(detectedLang);

  let currentStep = 1;
  let tempLang = detectedLang;
  let tempName = '';
  let tempPfp = DEFAULT_PFP;

  const overlay = document.createElement('div');
  overlay.className = 'am-macos-modal-overlay';
  overlay.id = 'spicy-setup-modal';

  const windowBox = document.createElement('div');
  windowBox.className = 'am-macos-window';

  function renderStep() {
    windowBox.innerHTML = '';

    // macOS Titlebar with traffic lights
    const titleBar = document.createElement('div');
    titleBar.className = 'am-macos-titlebar';
    titleBar.innerHTML = `
      <div class="am-macos-traffic-lights">
        <span class="am-tl-btn am-tl-red" id="setup-tl-close" title="Close"></span>
        <span class="am-tl-btn am-tl-yellow" title="Minimize"></span>
        <span class="am-tl-btn am-tl-green" title="Maximize"></span>
      </div>
      <div class="am-macos-title">${t('setup_title')}</div>
      <div style="width: 52px;"></div>
    `;
    windowBox.appendChild(titleBar);

    // Step content container
    const content = document.createElement('div');
    content.className = 'am-macos-content';

    if (currentStep === 1) {
      // Step 1: Language
      content.innerHTML = `
        <div class="am-setup-step-icon">🌐</div>
        <h2 class="am-setup-step-title">${t('setup_welcome')}</h2>
        <p class="am-setup-step-desc">${t('setup_welcome_sub')}</p>
        
        <div class="am-setup-field">
          <label class="am-setup-label">${t('setup_lang_label')}</label>
          <select id="setup-lang-select" class="am-macos-select">
            ${SUPPORTED_LANGUAGES.map(l => `
              <option value="${l.code}" ${l.code === tempLang ? 'selected' : ''}>
                ${l.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="am-macos-actions">
          <button id="setup-step1-next" class="am-macos-btn primary">${t('setup_btn_next')}</button>
        </div>
      `;

      const select = content.querySelector('#setup-lang-select');
      select.addEventListener('change', (e) => {
        tempLang = e.target.value;
        setLanguage(tempLang);
        renderStep();
      });

      const nextBtn = content.querySelector('#setup-step1-next');
      nextBtn.addEventListener('click', () => {
        currentStep = 2;
        renderStep();
      });

    } else if (currentStep === 2) {
      // Step 2: Name (Skippable)
      content.innerHTML = `
        <div class="am-setup-step-icon">👋</div>
        <h2 class="am-setup-step-title">${t('setup_name_label')}</h2>
        <p class="am-setup-step-desc">${t('setup_name_hint')}</p>
        
        <div class="am-setup-field">
          <input type="text" id="setup-name-input" class="am-macos-input" placeholder="${t('setup_name_placeholder')}" value="${tempName}" autofocus autocomplete="off">
        </div>

        <div class="am-macos-actions">
          <button id="setup-step2-skip" class="am-macos-btn secondary">${t('setup_btn_skip')}</button>
          <button id="setup-step2-next" class="am-macos-btn primary">${t('setup_btn_next')}</button>
        </div>
      `;

      const input = content.querySelector('#setup-name-input');
      const skipBtn = content.querySelector('#setup-step2-skip');
      const nextBtn = content.querySelector('#setup-step2-next');

      skipBtn.addEventListener('click', () => {
        tempName = DEFAULT_NAME;
        currentStep = 3;
        renderStep();
      });

      nextBtn.addEventListener('click', () => {
        const val = input.value.trim();
        tempName = val || DEFAULT_NAME;
        currentStep = 3;
        renderStep();
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const val = input.value.trim();
          tempName = val || DEFAULT_NAME;
          currentStep = 3;
          renderStep();
        }
      });

    } else if (currentStep === 3) {
      // Step 3: Greeting & Profile Picture (Skippable)
      content.innerHTML = `
        <div class="am-setup-avatar-preview-wrap">
          <img id="setup-avatar-preview" src="${tempPfp}" class="am-setup-avatar-preview" alt="Avatar">
        </div>
        <h2 class="am-setup-step-title">${t('setup_greet', { name: tempName || DEFAULT_NAME })}</h2>
        <p class="am-setup-step-desc">${t('setup_greet_sub')}</p>

        <div class="am-avatar-picker-row">
          ${PRESET_AVATARS.map(av => `
            <div class="am-avatar-choice ${av === tempPfp ? 'active' : ''}" data-src="${av}">
              <img src="${av}" alt="">
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 15px; display: flex; justify-content: center;">
          <label class="am-macos-btn secondary" style="cursor: pointer; font-size: 0.85rem; padding: 6px 14px;">
            ${t('setup_custom_pfp')}
            <input type="file" id="setup-pfp-file" accept="image/*" style="display: none;">
          </label>
        </div>

        <div class="am-macos-actions">
          <button id="setup-step3-skip" class="am-macos-btn secondary">${t('setup_btn_skip')}</button>
          <button id="setup-step3-finish" class="am-macos-btn primary">${t('setup_btn_finish')}</button>
        </div>
      `;

      const avatarPreview = content.querySelector('#setup-avatar-preview');
      const choices = content.querySelectorAll('.am-avatar-choice');
      choices.forEach(c => {
        c.addEventListener('click', () => {
          choices.forEach(x => x.classList.remove('active'));
          c.classList.add('active');
          tempPfp = c.dataset.src;
          avatarPreview.src = tempPfp;
        });
      });

      const fileInput = content.querySelector('#setup-pfp-file');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              tempPfp = evt.target.result;
              avatarPreview.src = tempPfp;
              choices.forEach(x => x.classList.remove('active'));
            };
            reader.readAsDataURL(file);
          }
        });
      }

      const finishSetup = () => {
        saveUserProfile({
          name: tempName || DEFAULT_NAME,
          pfp: tempPfp || DEFAULT_PFP,
          lang: tempLang
        });
        localStorage.setItem(SETUP_KEY, 'true');
        overlay.remove();
      };

      const skipBtn = content.querySelector('#setup-step3-skip');
      skipBtn.addEventListener('click', () => {
        tempPfp = DEFAULT_PFP;
        finishSetup();
      });

      const finishBtn = content.querySelector('#setup-step3-finish');
      finishBtn.addEventListener('click', finishSetup);
    }

    windowBox.appendChild(content);

    // Red dot close button handler
    const closeDot = windowBox.querySelector('#setup-tl-close');
    if (closeDot) {
      closeDot.addEventListener('click', () => {
        saveUserProfile({
          name: tempName || DEFAULT_NAME,
          pfp: tempPfp || DEFAULT_PFP,
          lang: tempLang
        });
        localStorage.setItem(SETUP_KEY, 'true');
        overlay.remove();
      });
    }
  }

  renderStep();
  overlay.appendChild(windowBox);
  document.body.appendChild(overlay);
}

/**
 * Profile & Preferences Modal (for index.html)
 */
export function openProfileSettingsModal() {
  const existing = document.getElementById('spicy-profile-modal');
  if (existing) existing.remove();

  const profile = getUserProfile();
  let tempName = profile.name;
  let tempPfp = profile.pfp;
  let tempLang = profile.lang;

  const overlay = document.createElement('div');
  overlay.className = 'am-macos-modal-overlay';
  overlay.id = 'spicy-profile-modal';

  const modalBox = document.createElement('div');
  modalBox.className = 'am-macos-window am-profile-settings-window';

  modalBox.innerHTML = `
    <div class="am-macos-titlebar">
      <div class="am-macos-traffic-lights">
        <span class="am-tl-btn am-tl-red" id="profile-modal-close" title="Close"></span>
        <span class="am-tl-btn am-tl-yellow"></span>
        <span class="am-tl-btn am-tl-green"></span>
      </div>
      <div class="am-macos-title">${t('profile_settings_title')}</div>
      <div style="width: 52px;"></div>
    </div>

    <div class="am-macos-content">
      <!-- PFP Editor -->
      <div class="am-profile-edit-avatar-section">
        <img id="prof-modal-avatar-preview" src="${tempPfp}" class="am-profile-modal-avatar" alt="Avatar">
        <div class="am-avatar-picker-row mini">
          ${PRESET_AVATARS.map(av => `
            <div class="am-avatar-choice ${av === tempPfp ? 'active' : ''}" data-src="${av}">
              <img src="${av}" alt="">
            </div>
          `).join('')}
        </div>
        <label class="am-macos-btn secondary" style="cursor: pointer; font-size: 0.8rem; margin-top: 10px;">
          ${t('setup_custom_pfp')}
          <input type="file" id="prof-modal-pfp-input" accept="image/*" style="display: none;">
        </label>
      </div>

      <!-- Name Editor -->
      <div class="am-setup-field" style="margin-top: 20px;">
        <label class="am-setup-label">${t('profile_name_label')}</label>
        <input type="text" id="prof-modal-name-input" class="am-macos-input" value="${tempName}" autocomplete="off">
      </div>

      <!-- Language Selector -->
      <div class="am-setup-field" style="margin-top: 14px;">
        <label class="am-setup-label">${t('profile_lang_label')}</label>
        <select id="prof-modal-lang-select" class="am-macos-select">
          ${SUPPORTED_LANGUAGES.map(l => `
            <option value="${l.code}" ${l.code === tempLang ? 'selected' : ''}>
              ${l.name}
            </option>
          `).join('')}
        </select>
      </div>

      <!-- Actions -->
      <div class="am-macos-actions" style="margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px;">
        <button id="prof-modal-player-settings-btn" class="am-macos-btn secondary" style="display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          ${t('profile_player_settings_btn')}
        </button>
        <button id="prof-modal-save-btn" class="am-macos-btn primary">${t('profile_save')}</button>
      </div>
    </div>
  `;

  overlay.appendChild(modalBox);
  document.body.appendChild(overlay);

  // Close handlers
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  modalBox.querySelector('#profile-modal-close').addEventListener('click', () => overlay.remove());

  // Avatar presets
  const preview = modalBox.querySelector('#prof-modal-avatar-preview');
  const choices = modalBox.querySelectorAll('.am-avatar-choice');
  choices.forEach(c => {
    c.addEventListener('click', () => {
      choices.forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      tempPfp = c.dataset.src;
      preview.src = tempPfp;
    });
  });

  // Custom PFP upload
  const fileInput = modalBox.querySelector('#prof-modal-pfp-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          tempPfp = evt.target.result;
          preview.src = tempPfp;
          choices.forEach(x => x.classList.remove('active'));
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Save changes
  const nameInput = modalBox.querySelector('#prof-modal-name-input');
  const langSelect = modalBox.querySelector('#prof-modal-lang-select');
  const saveBtn = modalBox.querySelector('#prof-modal-save-btn');

  saveBtn.addEventListener('click', () => {
    const newName = nameInput.value.trim() || DEFAULT_NAME;
    const newLang = langSelect.value;
    saveUserProfile({
      name: newName,
      pfp: tempPfp,
      lang: newLang
    });
    overlay.remove();
  });

  // Open Player Settings directly
  const playerSettingsBtn = modalBox.querySelector('#prof-modal-player-settings-btn');
  playerSettingsBtn.addEventListener('click', () => {
    overlay.remove();
    settingsUI.show();
  });
}

/**
 * Open Player Settings directly using settingsUI
 */
export function openPlayerSettingsModal() {
  settingsUI.show();
}


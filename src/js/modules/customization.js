import { els } from "../core/dom.js";
import { 
  AVAILABLE_THEMES, getCurrentTheme, setTheme, 
  getCustomAccent, setCustomAccent, 
  getFontStyle, setFontStyle, 
  getFontScale, setFontScale 
} from "../ui/theme.js";
import { 
  getSfxVolume, setSfxVolume, 
  getTypingVolume, setTypingVolume, 
  playClickSound, playTypingSound 
} from "../ui/audio.js";
import { getOverscrollEnabled, setOverscrollEnabled } from "../ui/overscroll.js";
import { showFeedback } from "../utils/utils.js";
import { navigateTo } from "../ui/ui.js";
import { populateLanguageSelector, setLanguage, onLanguageChange, t } from "../i18n/i18n.js";

onLanguageChange(() => {
  renderThemeCards();
});

export function renderThemeCards() {
  if (!els.themeCardsContainer) return;
  const currentTheme = getCurrentTheme();
  
  els.themeCardsContainer.innerHTML = AVAILABLE_THEMES.map(theme => {
    const isActive = theme.id === currentTheme;
    const activeLabel = (t("status.active") || "ACTIVO").toUpperCase();
    const selectLabel = (t("common.accept") || "SELECCIONAR").toUpperCase();

    return `
      <div class="theme-card ${isActive ? 'active' : ''}" data-theme-id="${theme.id}">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <h4 style="margin: 0; color: var(--mc-yellow); font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-title);">${theme.name}</h4>
          ${isActive ? `<span class="theme-card-badge">${activeLabel}</span>` : ''}
        </div>
        <p class="hint" style="margin: 6px 0 0 0; font-size: 0.85rem; line-height: 1.35; flex: 1;">${theme.description}</p>
        
        <div class="theme-card-bar">
          <div style="flex: 1; background-color: ${theme.previewBg};" title="Fondo"></div>
          <div style="flex: 1; background-color: ${theme.previewAccent};" title="Acento"></div>
          <div style="flex: 1; background-color: ${theme.previewText};" title="Texto"></div>
        </div>

        <button type="button" class="${isActive ? 'mc-btn-primary' : 'mc-btn-secondary'} btn-small" style="width: 100%; margin: 0; font-size: 0.95rem;">
          ${isActive ? activeLabel : selectLabel}
        </button>
      </div>
    `;
  }).join('');

  els.themeCardsContainer.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const themeId = card.dataset.themeId;
      setTheme(themeId);
      renderThemeCards();
      showFeedback(`Tema cambiado a: ${AVAILABLE_THEMES.find(t => t.id === themeId).name}`, "info");
    });
  });
}

export function initSfxVolumeControl() {
  const sfxVol = getSfxVolume();
  const sfxPct = Math.round(sfxVol * 100);
  if (els.inputSfxVolume) els.inputSfxVolume.value = sfxPct;
  if (els.labelSfxVolume) els.labelSfxVolume.textContent = `${sfxPct}%`;

  const typingVol = getTypingVolume();
  const typingPct = Math.round(typingVol * 100);
  if (els.inputTypingVolume) els.inputTypingVolume.value = typingPct;
  if (els.labelTypingVolume) els.labelTypingVolume.textContent = `${typingPct}%`;

  if (els.checkOverscrollEnabled) els.checkOverscrollEnabled.checked = getOverscrollEnabled();
}

export function initCustomizationEvents() {
  if (els.btnHomeCustomization) {
    els.btnHomeCustomization.addEventListener("click", () => {
      renderThemeCards();
      initSfxVolumeControl();
      populateLanguageSelector(els.selectAppLanguage);
      navigateTo("customization");
      showFeedback("Personaliza la paleta de colores y el volumen de efectos de sonido.", "info");
    });
  }

  if (els.btnCustomizationBack) {
    els.btnCustomizationBack.addEventListener("click", () => {
      navigateTo("home");
    });
  }

  if (els.inputSfxVolume) {
    els.inputSfxVolume.addEventListener("input", (e) => {
      const pct = parseInt(e.target.value);
      setSfxVolume(pct / 100);
      if (els.labelSfxVolume) els.labelSfxVolume.textContent = `${pct}%`;
      playClickSound();
    });
  }

  if (els.inputTypingVolume) {
    els.inputTypingVolume.addEventListener("input", (e) => {
      const pct = parseInt(e.target.value);
      setTypingVolume(pct / 100);
      if (els.labelTypingVolume) els.labelTypingVolume.textContent = `${pct}%`;
      playTypingSound();
    });
  }

  if (els.btnTestSfx) {
    els.btnTestSfx.addEventListener("click", () => {
      playClickSound();
    });
  }

  if (els.inputTestTyping) {
    els.inputTestTyping.addEventListener("input", () => {
      playTypingSound();
    });
  }

  if (els.checkOverscrollEnabled) {
    els.checkOverscrollEnabled.addEventListener("change", (e) => {
      setOverscrollEnabled(e.target.checked);
      showFeedback(`Resplandor al scrollear ${e.target.checked ? 'activado' : 'desactivado'}.`, "info");
    });
  }

  // --- Personalización de Acento, Fuente y Escala ---
  if (els.inputCustomAccentColor) {
    const currentAccent = getCustomAccent();
    if (currentAccent) els.inputCustomAccentColor.value = currentAccent;
    els.inputCustomAccentColor.addEventListener("input", (e) => {
      setCustomAccent(e.target.value);
    });
  }

  document.querySelectorAll(".btn-preset-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.getAttribute("data-color");
      setCustomAccent(color);
      if (els.inputCustomAccentColor) els.inputCustomAccentColor.value = color || "#4a8f29";
      showFeedback(color ? `Color de acento aplicado.` : `Color de acento restablecido al tema.`, "success");
    });
  });

  if (els.selectFontStyle) {
    els.selectFontStyle.value = getFontStyle();
    els.selectFontStyle.addEventListener("change", (e) => {
      setFontStyle(e.target.value);
      showFeedback(`Estilo de fuente cambiado a ${e.target.value === "modern" ? "Moderna Sans" : "Pixel Arcade"}.`, "info");
    });
  }

  if (els.selectFontScale) {
    els.selectFontScale.value = getFontScale();
    els.selectFontScale.addEventListener("change", (e) => {
      setFontScale(e.target.value);
      showFeedback(`Escala de texto ajustada a ${e.target.value}.`, "info");
    });
  }

  if (els.selectAppLanguage) {
    els.selectAppLanguage.addEventListener("change", (e) => {
      setLanguage(e.target.value);
      showFeedback(`Idioma cambiado / Language changed.`, "success");
    });
  }
}

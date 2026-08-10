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

export function renderThemeCards() {
  if (!els.themeCardsContainer) return;
  const currentTheme = getCurrentTheme();
  
  els.themeCardsContainer.innerHTML = AVAILABLE_THEMES.map(theme => {
    const isActive = theme.id === currentTheme;
    return `
      <div class="minecraft-table theme-card" data-theme-id="${theme.id}" style="width: 230px; min-width: 230px; max-width: 230px; height: 175px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; border: 2px solid ${isActive ? 'var(--mc-green)' : 'var(--mc-border)'}; background-color: var(--bg-panel); cursor: pointer; border-radius: 4px; box-sizing: border-box; flex-shrink: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="margin: 0; color: var(--mc-yellow); font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${theme.name}</h4>
          ${isActive ? '<span class="status-badge" data-status="running" style="padding: 2px 6px; font-size: 0.75rem; flex-shrink: 0;">ACTIVO</span>' : ''}
        </div>
        <p class="hint" style="margin: 4px 0 0 0; font-size: 0.8rem; height: 36px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${theme.description}</p>
        
        <div style="display: flex; height: 24px; border: 2px solid #111; border-radius: 4px; overflow: hidden; margin-top: 4px;">
          <div style="flex: 1; background-color: ${theme.previewBg};" title="Fondo"></div>
          <div style="flex: 1; background-color: ${theme.previewAccent};" title="Acento"></div>
          <div style="flex: 1; background-color: ${theme.previewText};" title="Texto"></div>
        </div>

        <button type="button" class="${isActive ? 'mc-btn-primary' : 'mc-btn-secondary'} btn-small" style="width: 100%; margin-top: 6px; padding: 4px 8px; font-size: 0.85rem;">
          ${isActive ? 'ACTIVADO' : 'SELECCIONAR'}
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
}

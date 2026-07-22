// ==========================================================================
// GESTOR DE TEMAS Y PERSONALIZACIÓN DE INTERFAZ (Minecraft Server GUI)
// Módulo independiente y desacoplado para alta personalización visual.
// ==========================================================================

const STORAGE_THEME_KEY = "mc_gui_theme";
const STORAGE_ACCENT_KEY = "mc_gui_custom_accent";
const STORAGE_FONT_STYLE_KEY = "mc_gui_font_style";
const STORAGE_FONT_SCALE_KEY = "mc_gui_font_scale";
const STORAGE_GLASS_KEY = "mc_gui_glass_effect";
const STORAGE_BORDER_KEY = "mc_gui_border_radius";

export const AVAILABLE_THEMES = [
  {
    id: "dark",
    name: "Oscuro Clásico",
    description: "Estilo nocturno inspirado en la piedra lisa y el carbón.",
    previewBg: "#1a1a1a",
    previewAccent: "#4a8f29",
    previewText: "#ffffff",
  },
  {
    id: "light",
    name: "Claro Cuarzo",
    description: "Estilo diurno inspirado en bloques de cuarzo y abedul.",
    previewBg: "#e2e7f0",
    previewAccent: "#3d7e22",
    previewText: "#181c24",
  },
  {
    id: "nether",
    name: "Inframundo Carmesí",
    description: "Estilo místico inspirado en los bosques carmesí del Nether.",
    previewBg: "#340f0f",
    previewAccent: "#298f6d",
    previewText: "#ffe3e3",
  },
  {
    id: "end",
    name: "End Místico",
    description: "Estilo místico inspirado en la dimensión del End y amatistas.",
    previewBg: "#1d1536",
    previewAccent: "#9333ea",
    previewText: "#f3e8ff",
  },
  {
    id: "emerald",
    name: "Esmeralda Neón",
    description: "Estilo cibernético inspirado en esmeraldas brillantes.",
    previewBg: "#0e3626",
    previewAccent: "#10b981",
    previewText: "#ecfdf5",
  },
];

const DEFAULT_THEMES_COUNT = 5;

export function loadCustomThemes() {
  // Truncar para mantener solo los temas por defecto y evitar duplicados
  AVAILABLE_THEMES.length = DEFAULT_THEMES_COUNT;

  try {
    const customThemesStr = localStorage.getItem("mc_gui_custom_themes");
    if (customThemesStr) {
      const customThemes = JSON.parse(customThemesStr);
      if (Array.isArray(customThemes)) {
        for (const theme of customThemes) {
          theme.isCustom = true;
          AVAILABLE_THEMES.push(theme);
        }
      }
    }
  } catch (e) {
    console.error("Error al cargar temas personalizados:", e);
  }
}

export function saveCustomTheme(theme) {
  try {
    const customThemesStr = localStorage.getItem("mc_gui_custom_themes") || "[]";
    const customThemes = JSON.parse(customThemesStr);
    
    if (!theme.id) {
      theme.id = `custom-${Date.now()}`;
    }
    theme.isCustom = true;

    const existingIndex = customThemes.findIndex(t => t.id === theme.id);
    if (existingIndex >= 0) {
      customThemes[existingIndex] = theme;
    } else {
      customThemes.push(theme);
    }

    localStorage.setItem("mc_gui_custom_themes", JSON.stringify(customThemes));
    loadCustomThemes();
    setTheme(theme.id);
    return theme.id;
  } catch (e) {
    console.error("Error al guardar tema personalizado:", e);
    return null;
  }
}

export function deleteCustomTheme(themeId) {
  try {
    const customThemesStr = localStorage.getItem("mc_gui_custom_themes") || "[]";
    let customThemes = JSON.parse(customThemesStr);
    customThemes = customThemes.filter(t => t.id !== themeId);
    localStorage.setItem("mc_gui_custom_themes", JSON.stringify(customThemes));
    
    loadCustomThemes();

    if (getCurrentTheme() === themeId) {
      setTheme("dark");
    }
    return true;
  } catch (e) {
    console.error("Error al eliminar tema personalizado:", e);
    return false;
  }
}

function applyCustomThemeStyles(theme) {
  let styleEl = document.getElementById("mc-custom-theme-styles");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "mc-custom-theme-styles";
    document.head.appendChild(styleEl);
  }

  if (theme && theme.isCustom && theme.colors) {
    let css = `[data-theme="${theme.id}"] {\n`;
    for (const [key, value] of Object.entries(theme.colors)) {
      css += `  ${key}: ${value};\n`;
    }
    // Si el tema claro personalizado es activo, añadir también el estilo del botón
    if (theme.id.includes("light") || theme.name.toLowerCase().includes("claro")) {
      css += `}\n[data-theme="${theme.id}"] .mc-btn-group-item:not(.active), [data-theme="${theme.id}"] .mc-btn-secondary {\n  color: ${theme.colors['--text-primary']} !important;\n  text-shadow: none !important;\n`;
    }
    css += `}`;
    styleEl.textContent = css;
  } else {
    styleEl.textContent = "";
  }
}

export function getCurrentTheme() {
  return localStorage.getItem(STORAGE_THEME_KEY) || "dark";
}

export function setTheme(themeId) {
  // Asegurarse de tener los temas personalizados cargados al cambiar
  loadCustomThemes();
  const validTheme = AVAILABLE_THEMES.find((t) => t.id === themeId);
  const selectedTheme = validTheme ? validTheme.id : "dark";

  document.documentElement.setAttribute("data-theme", selectedTheme);
  localStorage.setItem(STORAGE_THEME_KEY, selectedTheme);

  // Aplicar estilos personalizados si corresponde
  if (validTheme && validTheme.isCustom) {
    applyCustomThemeStyles(validTheme);
  } else {
    applyCustomThemeStyles(null);
  }

  // Si no hay un acento personalizado guardado expresamente, limpiar overrides inline
  const hasCustomAccent = localStorage.getItem(STORAGE_ACCENT_KEY);
  if (!hasCustomAccent) {
    document.documentElement.style.removeProperty("--mc-green");
    document.documentElement.style.removeProperty("--mc-green-hover");
    document.documentElement.style.removeProperty("--mc-green-shadow");
  } else {
    setCustomAccent(hasCustomAccent);
  }

  return selectedTheme;
}

export function getCustomAccent() {
  return localStorage.getItem(STORAGE_ACCENT_KEY) || "";
}

export function setCustomAccent(colorHex) {
  if (colorHex) {
    localStorage.setItem(STORAGE_ACCENT_KEY, colorHex);
    document.documentElement.style.setProperty("--mc-green", colorHex);
    document.documentElement.style.setProperty("--mc-green-hover", colorHex);
    document.documentElement.style.setProperty("--mc-green-shadow", colorHex);
  } else {
    localStorage.removeItem(STORAGE_ACCENT_KEY);
    document.documentElement.style.removeProperty("--mc-green");
    document.documentElement.style.removeProperty("--mc-green-hover");
    document.documentElement.style.removeProperty("--mc-green-shadow");
  }
}

export function getFontStyle() {
  return localStorage.getItem(STORAGE_FONT_STYLE_KEY) || "pixel";
}

export function setFontStyle(fontStyle) {
  const fontVar = fontStyle === "modern" ? "var(--font-modern)" : "var(--font-pixel)";
  document.documentElement.style.setProperty("--font-title", fontVar);
  document.documentElement.style.setProperty("--font-body", fontVar);
  localStorage.setItem(STORAGE_FONT_STYLE_KEY, fontStyle);
}

export function getFontScale() {
  return localStorage.getItem(STORAGE_FONT_SCALE_KEY) || "100%";
}

export function setFontScale(scaleValue) {
  document.documentElement.style.setProperty("--app-font-scale", scaleValue);
  localStorage.setItem(STORAGE_FONT_SCALE_KEY, scaleValue);
}

export function getGlassEffect() {
  return localStorage.getItem(STORAGE_GLASS_KEY) || "off";
}

export function setGlassEffect(glassLevel) {
  const blurMap = { off: "0px", light: "6px", deep: "14px" };
  const blurVal = blurMap[glassLevel] || "0px";
  document.documentElement.style.setProperty("--panel-backdrop-blur", blurVal);
  localStorage.setItem(STORAGE_GLASS_KEY, glassLevel);
}

export function getBorderRadius() {
  return localStorage.getItem(STORAGE_BORDER_KEY) || "0px";
}

export function setBorderRadius(radiusValue) {
  document.documentElement.style.setProperty("--panel-border-radius", radiusValue);
  localStorage.setItem(STORAGE_BORDER_KEY, radiusValue);
}

export function initTheme() {
  loadCustomThemes();
  const savedTheme = getCurrentTheme();
  setTheme(savedTheme);

  setFontStyle(getFontStyle());
  setFontScale(getFontScale());
  setGlassEffect(getGlassEffect());
  setBorderRadius(getBorderRadius());
}

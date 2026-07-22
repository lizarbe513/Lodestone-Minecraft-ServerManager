import { els } from "../core/dom.js";
import { saveCustomTheme } from "../ui/theme.js";
import { showFeedback } from "../utils/utils.js";
import { navigateTo } from "../ui/ui.js";

const KEYWORD_MAP = {
  bgDark: ['bg-dark', 'bgdark', 'dark', 'background', 'fondo-general', 'fondogeneral', 'app-bg', 'appbg'],
  bgSlate: ['bg-slate', 'bgslate', 'slate', 'midground', 'list', 'lista', 'fondo-lista', 'fondolista'],
  bgPanel: ['bg-panel', 'bgpanel', 'panel', 'card', 'tarjeta', 'dialog', 'dialogo', 'fondo-panel', 'fondopanel'],
  mcBorder: ['border', 'border-color', 'bordercolor', 'borde', 'bordes', 'stroke'],
  mcGreen: ['mc-green', 'mcgreen', 'green', 'accent', 'acento', 'primary', 'primario', 'boton-primario', 'botonprimario', 'verde'],
  mcGray: ['mc-gray', 'mcgray', 'gray', 'grey', 'secondary', 'secundario', 'boton-secundario', 'botonsecundario', 'gris'],
  mcRed: ['mc-red', 'mcred', 'red', 'danger', 'error', 'peligro', 'rojo'],
  mcYellow: ['mc-yellow', 'mcyellow', 'yellow', 'warning', 'warn', 'advertencia', 'amarillo'],
  mcWhite: ['mc-white', 'mcwhite', 'white', 'text-btn', 'inverse', 'inverso', 'blanco'],
  textPrimary: ['text-primary', 'textprimary', 'text', 'foreground', 'texto-principal', 'textoprincipal', 'texto'],
  textSecondary: ['text-secondary', 'textsecondary', 'hint', 'desc', 'description', 'texto-secundario', 'textosecundario']
};

function adjustColorBrightness(hex, percent) {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);

  R = parseInt((R * (100 + percent)) / 100);
  G = parseInt((G * (100 + percent)) / 100);
  B = parseInt((B * (100 + percent)) / 100);

  R = Math.max(0, Math.min(255, R));
  G = Math.max(0, Math.min(255, G));
  B = Math.max(0, Math.min(255, B));

  const rHex = R.toString(16).padStart(2, '0');
  const gHex = G.toString(16).padStart(2, '0');
  const bHex = B.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

export function updatePreview() {
  const container = els.themeCreatorPreviewContainer;
  if (!container) return;

  const bgDark = els.colorThemeDark.value;
  const bgPanel = els.colorThemePanel.value;
  const bgSlate = els.colorThemeSlate.value;
  const border = els.colorThemeBorder.value;
  const textPrimary = els.colorThemeTextPrimary.value;
  const textSecondary = els.colorThemeTextSecondary.value;
  const green = els.colorThemeGreen.value;
  const gray = els.colorThemeGray.value;
  const red = els.colorThemeRed.value;
  const yellow = els.colorThemeYellow.value;
  const white = els.colorThemeWhite.value;

  // Calcular variantes dinámicamente
  const greenHover = adjustColorBrightness(green, 15);
  const greenShadow = adjustColorBrightness(green, -40);
  const grayHover = adjustColorBrightness(gray, 15);
  const grayShadow = adjustColorBrightness(gray, -40);
  const redHover = adjustColorBrightness(red, 15);
  const redShadow = adjustColorBrightness(red, -40);
  const yellowShadow = adjustColorBrightness(yellow, -40);

  // Inyectar variables inline en el contenedor de vista previa
  container.style.setProperty("--bg-dark", bgDark);
  container.style.setProperty("--bg-panel", bgPanel);
  container.style.setProperty("--bg-slate", bgSlate);
  container.style.setProperty("--mc-border", border);
  container.style.setProperty("--text-primary", textPrimary);
  container.style.setProperty("--text-secondary", textSecondary);
  container.style.setProperty("--mc-green", green);
  container.style.setProperty("--mc-green-hover", greenHover);
  container.style.setProperty("--mc-green-shadow", greenShadow);
  container.style.setProperty("--mc-gray", gray);
  container.style.setProperty("--mc-gray-hover", grayHover);
  container.style.setProperty("--mc-gray-shadow", grayShadow);
  container.style.setProperty("--mc-red", red);
  container.style.setProperty("--mc-red-hover", redHover);
  container.style.setProperty("--mc-red-shadow", redShadow);
  container.style.setProperty("--mc-yellow", yellow);
  container.style.setProperty("--mc-yellow-shadow", yellowShadow);
  container.style.setProperty("--mc-white", white);
}

function importPalette(text) {
  if (!text || !text.trim()) {
    showFeedback("El texto de la paleta está vacío.", "error");
    return;
  }

  const hexRegex = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})\b/g;
  const hexMatches = text.match(hexRegex) || [];

  if (hexMatches.length === 0) {
    showFeedback("No se encontraron códigos de color HEX en el texto.", "error");
    return;
  }

  // Intentar mapeo semántico clave-valor
  const keyValueRegex = /([-\w]+)\s*[:=]\s*["']?(#[a-fA-F0-9]{3,6})\b["']?/g;
  let match;
  const matchedValues = {};
  let semanticCount = 0;

  while ((match = keyValueRegex.exec(text)) !== null) {
    const key = match[1].toLowerCase().replace(/['"_-]/g, "");
    const value = match[2];

    for (const [varName, keywords] of Object.entries(KEYWORD_MAP)) {
      const matchKeyword = keywords.some(kw => {
        const normKw = kw.replace(/[-_]/g, "").toLowerCase();
        return key.includes(normKw) || normKw.includes(key);
      });
      if (matchKeyword) {
        matchedValues[varName] = value;
        semanticCount++;
        break;
      }
    }
  }

  // Asignar colores detectados semánticamente
  if (matchedValues.bgDark) els.colorThemeDark.value = matchedValues.bgDark;
  if (matchedValues.bgPanel) els.colorThemePanel.value = matchedValues.bgPanel;
  if (matchedValues.bgSlate) els.colorThemeSlate.value = matchedValues.bgSlate;
  if (matchedValues.mcBorder) els.colorThemeBorder.value = matchedValues.mcBorder;
  if (matchedValues.textPrimary) els.colorThemeTextPrimary.value = matchedValues.textPrimary;
  if (matchedValues.textSecondary) els.colorThemeTextSecondary.value = matchedValues.textSecondary;
  if (matchedValues.mcGreen) els.colorThemeGreen.value = matchedValues.mcGreen;
  if (matchedValues.mcGray) els.colorThemeGray.value = matchedValues.mcGray;
  if (matchedValues.mcRed) els.colorThemeRed.value = matchedValues.mcRed;
  if (matchedValues.mcYellow) els.colorThemeYellow.value = matchedValues.mcYellow;
  if (matchedValues.mcWhite) els.colorThemeWhite.value = matchedValues.mcWhite;

  // Si se mapearon pocos elementos, usar la asignación secuencial
  if (semanticCount < 3) {
    const fields = [
      els.colorThemeDark,
      els.colorThemePanel,
      els.colorThemeSlate,
      els.colorThemeBorder,
      els.colorThemeTextPrimary,
      els.colorThemeTextSecondary,
      els.colorThemeGreen,
      els.colorThemeGray,
      els.colorThemeRed,
      els.colorThemeYellow,
      els.colorThemeWhite
    ];

    const limit = Math.min(hexMatches.length, fields.length);
    for (let i = 0; i < limit; i++) {
      if (fields[i]) {
        fields[i].value = hexMatches[i];
      }
    }
    showFeedback(`Se importaron ${limit} colores de forma secuencial.`, "success");
  } else {
    showFeedback(`Se importaron ${semanticCount} colores mediante mapeo semántico.`, "success");
  }

  updatePreview();
}

export function resetThemeCreatorForm() {
  if (els.themeCreatorName) els.themeCreatorName.value = "";
  if (els.themeCreatorDesc) els.themeCreatorDesc.value = "";
  if (els.textareaImportPalette) els.textareaImportPalette.value = "";

  if (els.colorThemeDark) els.colorThemeDark.value = "#111111";
  if (els.colorThemePanel) els.colorThemePanel.value = "#262626";
  if (els.colorThemeSlate) els.colorThemeSlate.value = "#1a1a1a";
  if (els.colorThemeBorder) els.colorThemeBorder.value = "#3b3b3b";
  if (els.colorThemeTextPrimary) els.colorThemeTextPrimary.value = "#e8eef7";
  if (els.colorThemeTextSecondary) els.colorThemeTextSecondary.value = "#aeb9c8";
  if (els.colorThemeGreen) els.colorThemeGreen.value = "#4a8f29";
  if (els.colorThemeGray) els.colorThemeGray.value = "#4a4a4a";
  if (els.colorThemeRed) els.colorThemeRed.value = "#b02e26";
  if (els.colorThemeYellow) els.colorThemeYellow.value = "#f8c52d";
  if (els.colorThemeWhite) els.colorThemeWhite.value = "#ffffff";

  updatePreview();
}

export function initThemeCreatorEvents() {
  // Escuchar inputs de color para actualizar la vista previa en tiempo real
  const colorPickers = [
    els.colorThemeDark,
    els.colorThemePanel,
    els.colorThemeSlate,
    els.colorThemeBorder,
    els.colorThemeTextPrimary,
    els.colorThemeTextSecondary,
    els.colorThemeGreen,
    els.colorThemeGray,
    els.colorThemeRed,
    els.colorThemeYellow,
    els.colorThemeWhite
  ];

  for (const picker of colorPickers) {
    if (picker) {
      picker.addEventListener("input", updatePreview);
    }
  }

  // Cancelar / Volver
  if (els.btnThemeCreatorBack) {
    els.btnThemeCreatorBack.addEventListener("click", () => {
      navigateTo("customization");
    });
  }

  // Restablecer
  if (els.btnThemeCreatorReset) {
    els.btnThemeCreatorReset.addEventListener("click", () => {
      resetThemeCreatorForm();
      showFeedback("Valores del tema restablecidos.", "info");
    });
  }

  // Importar
  if (els.btnDoImportPalette && els.textareaImportPalette) {
    els.btnDoImportPalette.addEventListener("click", () => {
      importPalette(els.textareaImportPalette.value);
    });
  }

  // Guardar y Aplicar
  if (els.btnThemeCreatorSave) {
    els.btnThemeCreatorSave.addEventListener("click", () => {
      const name = els.themeCreatorName ? els.themeCreatorName.value.trim() : "";
      const desc = els.themeCreatorDesc ? els.themeCreatorDesc.value.trim() : "";

      if (!name) {
        showFeedback("Por favor, ingresa un nombre para el tema.", "error");
        return;
      }

      const colors = {
        "--bg-dark": els.colorThemeDark.value,
        "--bg-panel": els.colorThemePanel.value,
        "--bg-slate": els.colorThemeSlate.value,
        "--mc-border": els.colorThemeBorder.value,
        "--text-primary": els.colorThemeTextPrimary.value,
        "--text-secondary": els.colorThemeTextSecondary.value,
        "--mc-green": els.colorThemeGreen.value,
        "--mc-green-hover": adjustColorBrightness(els.colorThemeGreen.value, 15),
        "--mc-green-shadow": adjustColorBrightness(els.colorThemeGreen.value, -40),
        "--mc-gray": els.colorThemeGray.value,
        "--mc-gray-hover": adjustColorBrightness(els.colorThemeGray.value, 15),
        "--mc-gray-shadow": adjustColorBrightness(els.colorThemeGray.value, -40),
        "--mc-red": els.colorThemeRed.value,
        "--mc-red-hover": adjustColorBrightness(els.colorThemeRed.value, 15),
        "--mc-red-shadow": adjustColorBrightness(els.colorThemeRed.value, -40),
        "--mc-yellow": els.colorThemeYellow.value,
        "--mc-yellow-shadow": adjustColorBrightness(els.colorThemeYellow.value, -40),
        "--mc-white": els.colorThemeWhite.value
      };

      const theme = {
        name,
        description: desc || "Tema personalizado creado por el usuario.",
        previewBg: els.colorThemeDark.value,
        previewAccent: els.colorThemeGreen.value,
        previewText: els.colorThemeTextPrimary.value,
        colors
      };

      const themeId = saveCustomTheme(theme);
      if (themeId) {
        showFeedback(`Tema "${name}" guardado y aplicado correctamente.`, "success");
        
        // Limpiar formulario para futuros usos
        resetThemeCreatorForm();

        // Volver a la página de personalización
        navigateTo("customization");
      } else {
        showFeedback("Hubo un error al guardar el tema.", "error");
      }
    });
  }
}

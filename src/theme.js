// ==========================================================================
// GESTOR DE TEMAS Y PERSONALIZACIÓN DE INTERFAZ (Minecraft Server GUI)
// Módulo independiente y desacoplado para alta escalabilidad.
// ==========================================================================

const STORAGE_KEY = "mc_gui_theme";

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
    previewBg: "#e8ecf2",
    previewAccent: "#3d7e22",
    previewText: "#181c24",
  },
  {
    id: "nether",
    name: "Inframundo Carmesí",
    description: "Estilo místico inspirado en los bosques carmesí del Nether.",
    previewBg: "#2b0d0d",
    previewAccent: "#298f6d",
    previewText: "#ffe3e3",
  },
];

export function getCurrentTheme() {
  return localStorage.getItem(STORAGE_KEY) || "dark";
}

export function setTheme(themeId) {
  const validTheme = AVAILABLE_THEMES.find((t) => t.id === themeId);
  const selectedTheme = validTheme ? validTheme.id : "dark";

  document.documentElement.setAttribute("data-theme", selectedTheme);
  localStorage.setItem(STORAGE_KEY, selectedTheme);
  return selectedTheme;
}

export function initTheme() {
  const savedTheme = getCurrentTheme();
  setTheme(savedTheme);
}

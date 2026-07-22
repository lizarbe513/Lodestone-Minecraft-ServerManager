import { initDom } from "./core/dom.js";
import { initMetrics } from "./features/metrics.js";
import { setupEvents, registerTauriEvents } from "./core/events.js";
import { invoke } from "./core/api.js";
import { applySnapshot, navigateTo } from "./ui/ui.js";
import { showFeedback, appendLog, normalizeError } from "./utils/utils.js";
import { appState } from "./core/state.js";
import { initAudio } from "./ui/audio.js";
import { initTheme } from "./ui/theme.js";
import { initOverscrollGlow } from "./ui/overscroll.js";

async function loadInitialState() {
  const snapshot = await invoke("obtener_estado_aplicacion");
  applySnapshot(snapshot);

  navigateTo("home");
  showFeedback("Selecciona una opción para comenzar.", "info");
}
async function loadViews() {
  const container = document.getElementById("app-container");
  if (!container) return;
  const views = ["home", "create", "control", "customization", "theme_creator"];
  for (const view of views) {
    try {
      const response = await fetch(`views/${view}.html?v=${Date.now()}`);
      if (response.ok) {
        const html = await response.text();
        container.insertAdjacentHTML('beforeend', html);
      }
    } catch (e) {
      console.error(`Error loading view ${view}:`, e);
    }
  }

  const configViews = ["eula", "players", "worlds", "config", "properties", "extensions", "backups"];
  for (const view of configViews) {
    try {
      const response = await fetch(`views/configurations/${view}.html?v=${Date.now()}`);
      if (response.ok) {
        const html = await response.text();
        container.insertAdjacentHTML('beforeend', html);
      }
    } catch (e) {
      console.error(`Error loading configuration view ${view}:`, e);
    }
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await loadViews();
  initDom();
  initMetrics();
  initAudio();
  initOverscrollGlow();
  setupEvents();

  try {
    await registerTauriEvents();
    await loadInitialState();
    appendLog("system", "Aplicación lista.");
  } catch (error) {
    const message = normalizeError(error);
    showFeedback(`No se pudo inicializar la aplicación: ${message}`, "error");
    appendLog("stderr", message);
  }
});

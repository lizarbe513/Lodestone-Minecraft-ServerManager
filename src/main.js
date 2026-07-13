import { initDom } from "./dom.js";
import { initMetrics } from "./metrics.js";
import { setupEvents, registerTauriEvents } from "./events.js";
import { invoke } from "./api.js";
import { applySnapshot, navigateTo } from "./ui.js";
import { showFeedback, appendLog, normalizeError } from "./utils.js";
import { appState } from "./state.js";

async function loadInitialState() {
  const snapshot = await invoke("obtener_estado_aplicacion");
  applySnapshot(snapshot);

  if (appState.activeSession) {
    navigateTo("control");
    showFeedback(
      `Se cargó el panel de control del último servidor usado: ${appState.activeSession.server_name}.`,
      "info",
    );
  } else {
    navigateTo("home");
    showFeedback("Selecciona una opción para comenzar.", "info");
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  initDom();
  initMetrics();
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

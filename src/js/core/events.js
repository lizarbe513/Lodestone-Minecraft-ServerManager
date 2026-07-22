import { listen } from "./api.js";
import { appState } from "./state.js";
import { setStatus, updateControls } from "../ui/ui.js";
import { showFeedback, appendLog } from "../utils/utils.js";
import { handleServerLogLine } from "../features/server.js";

import { initCreateServerEvents } from "../modules/create_server.js";
import { initServerControlEvents } from "../modules/server_control.js";
import { initModpacksEvents } from "../modules/modpacks.js";
import { initCustomizationEvents } from "../modules/customization.js";
import { initThemeCreatorEvents } from "../modules/theme_creator.js";

export async function registerTauriEvents() {
  await listen("server-status", async (event) => {
    setStatus(event.payload.status);

    if (event.payload.status === "running") {
      showFeedback("Servidor en ejecución.", "success");
    } else if (event.payload.status === "offline") {
      showFeedback("Servidor detenido.", "info");
    } else if (event.payload.status === "starting") {
      showFeedback("Iniciando servidor...", "info");
    } else if (event.payload.status === "waiting_eula") {
      appState.eulaPending = true;
      showFeedback(
        "El servidor requiere aceptar el EULA. Pulsa `Aceptar EULA y reiniciar` para continuar.",
        "info",
      );
      updateControls();
    }
  });

  await listen("server-log", (event) => {
    appendLog(event.payload.kind, event.payload.message);
    handleServerLogLine(event.payload.message);
  });
}

export function setupEvents() {
  try {
    initCreateServerEvents();
    initServerControlEvents();
    initModpacksEvents();
    initCustomizationEvents();
    initThemeCreatorEvents();
  } catch (e) {
    console.error(e);
    alert("Error en setupEvents: " + e.stack);
  }
}

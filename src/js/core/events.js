import { listen } from "./api.js";
import { appState } from "./state.js";
import { setStatus, updateControls } from "../ui/ui.js";
import { showFeedback, appendLog } from "../utils/utils.js";
import { handleServerLogLine } from "../features/server.js";
import { t } from "../i18n/i18n.js";

import { initCreateServerEvents } from "../modules/create_server.js";
import { initServerControlEvents } from "../modules/server_control.js";
import { initModpacksEvents } from "../modules/modpacks.js";
import { initCustomizationEvents } from "../modules/customization.js";

export async function registerTauriEvents() {
  await listen("server-status", async (event) => {
    setStatus(event.payload.status);

    if (event.payload.status === "running") {
      showFeedback(t("status.running"), "success");
    } else if (event.payload.status === "offline") {
      showFeedback(t("status.offline"), "info");
    } else if (event.payload.status === "starting") {
      showFeedback(t("status.starting"), "info");
    } else if (event.payload.status === "waiting_eula") {
      appState.eulaPending = true;
      showFeedback(t("terminal.eula_required"), "info");
      updateControls();
    }
  });

  await listen("server-log", (event) => {
    let message = event.payload.message;
    if (event.payload.i18n_key) {
      message = t(event.payload.i18n_key, event.payload.i18n_params || {});
    }
    appendLog(event.payload.kind, message);
    handleServerLogLine(event.payload.message);
  });
}

export function setupEvents() {
  try {
    initCreateServerEvents();
    initServerControlEvents();
    initModpacksEvents();
    initCustomizationEvents();
  } catch (e) {
    console.error(e);
    alert("Error en setupEvents: " + e.stack);
  }
}

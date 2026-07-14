import { invoke, open, getPaperDownloadUrl, getVanillaDownloadUrl, getPurpurDownloadUrl, getFabricDownloadUrl } from "./api.js";
import { els } from "./dom.js";
import { appState, connectedPlayers } from "./state.js";
import { triggerStartTasks } from "./backups.js";
import { navigateTo, updateControls, applySnapshot, renderJavaOptions, renderPlayersList } from "./ui.js";
import { showFeedback, clearLogs, suggestedServerName, normalizeError, appendLog, normalizeMessage } from "./utils.js";

export function collectNewServerPayload() {
  const memoryGb = Number.parseInt(els.memoryGb.value, 10);

  if (!Number.isFinite(memoryGb) || memoryGb <= 0) {
    throw new Error("La RAM debe ser un valor en GB mayor que cero.");
  }

  const maxPlayers = Number.parseInt(els.createMaxPlayers.value, 10);

  return {
    server_name: els.serverName.value.trim(),
    server_jar_path: els.serverJarPath.value.trim(),
    parent_dir: els.serverParentDir.value.trim(),
    java_path: els.javaVersion.value.trim(),
    memory_gb: memoryGb,
    world_name: els.createWorldName.value.trim() || "world",
    gamemode: els.btnCreateGamemodeCycle.dataset.value || "survival",
    difficulty: els.btnCreateDifficultyCycle.dataset.value || "normal",
    max_players: Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : 20,
    online_mode: els.createOnlineMode.checked,
    hardcore: els.createHardcore.checked,
    pvp: els.createPvp.checked,
    allow_flight: els.createAllowFlight.checked,
  };
}

export function resetNewServerForm() {
  if (els.serverJarPath) els.serverJarPath.value = "";
  if (els.serverParentDir) els.serverParentDir.value = "";
  if (els.serverName) els.serverName.value = "";
  if (els.radioJarSourceLocal) els.radioJarSourceLocal.checked = false;
  if (els.radioJarSourceDownload) {
    els.radioJarSourceDownload.checked = true;
    els.radioJarSourceDownload.dispatchEvent(new Event('change'));
  }
  if (els.downloadStatusHint) els.downloadStatusHint.textContent = "";
  if (els.memoryGb) els.memoryGb.value = "4";

  // Reset tabs
  if (els.btnTabCreateGame) {
    els.btnTabCreateGame.classList.add("active");
    els.btnTabCreateServer.classList.remove("active");
    els.tabCreateGameContent.hidden = false;
    els.tabCreateServerContent.hidden = true;
  }

  // Reset new game controls
  if (els.createWorldName) els.createWorldName.value = "world";
  if (els.btnCreateGamemodeCycle) {
    els.btnCreateGamemodeCycle.dataset.value = "survival";
    els.btnCreateGamemodeCycle.textContent = "Modo: Supervivencia";
    els.createGamemodeDesc.textContent = "Consigue recursos, fabrica herramientas, gana niveles de experiencia y cuida tu salud.";
  }
  if (els.btnCreateDifficultyCycle) {
    els.btnCreateDifficultyCycle.dataset.value = "normal";
    els.btnCreateDifficultyCycle.textContent = "Dificultad: Normal";
    els.btnCreateDifficultyCycle.disabled = false;
    els.createDifficultyDesc.textContent = "Aparecen monstruos. Daño estándar.";
  }
  if (els.createMaxPlayers) els.createMaxPlayers.value = "20";
  if (els.createOnlineMode) els.createOnlineMode.checked = true;
  if (els.createHardcore) els.createHardcore.checked = false;
  if (els.createPvp) els.createPvp.checked = true;
  if (els.createAllowFlight) els.createAllowFlight.checked = false;

  renderJavaOptions();
  updateControls();
}

export async function browseServerJar(targetInput = null) {
  const selectedPath = await open({
    directory: false,
    multiple: false,
    title: "Selecciona el archivo .jar del servidor",
    filters: [{ name: "Java Archive", extensions: ["jar"] }],
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  if (targetInput === "control") {
    els.controlServerJarPath.value = selectedPath;
    return;
  }

  els.serverJarPath.value = selectedPath;
  if (!els.serverName.value.trim()) {
    els.serverName.value = suggestedServerName(selectedPath);
  }
  updateControls();
}

export async function browseServerParentDir() {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    defaultPath: els.serverParentDir.value.trim() || undefined,
    title: "Selecciona el directorio donde se creará la carpeta del servidor",
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  els.serverParentDir.value = selectedPath;
  updateControls();
}

export async function openExistingServer() {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    defaultPath: appState.activeSession?.server_dir || undefined,
    title: "Selecciona la carpeta de un servidor existente",
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  appState.pendingCreateFlow = false;
  clearLogs();
  const snapshot = await invoke("abrir_servidor_existente", {
    serverDir: selectedPath,
  });
  applySnapshot(snapshot);
  navigateTo("control");
  showFeedback("Servidor existente abierto correctamente.", "success");
}

export async function createServer() {
  const isDownload = els.radioJarSourceDownload && els.radioJarSourceDownload.checked;
  let payload = collectNewServerPayload();

  let minecraft_version = null;
  if (isDownload) {
    minecraft_version = els.selectDownloadVersion.value;
  } else {
    const jarPath = els.serverJarPath.value.trim();
    const match = jarPath.match(/1\.\d+(?:\.\d+)?/);
    if (match) minecraft_version = match[0];
  }
  payload.minecraft_version = minecraft_version;

  appState.pendingCreateFlow = true;
  clearLogs();

  if (isDownload) {
    showFeedback("Obteniendo información de descarga...", "info");
    const software = els.btnCreateSoftwareCycle.dataset.value;
    const version = els.selectDownloadVersion.value;
    let url = "";
    let jarName = "";

    try {
      if (software === "paper") {
        url = await getPaperDownloadUrl(version);
        jarName = `paper-${version}.jar`;
      } else if (software === "vanilla") {
        url = await getVanillaDownloadUrl(version);
        jarName = `vanilla-${version}.jar`;
      } else if (software === "purpur") {
        url = await getPurpurDownloadUrl(version);
        jarName = `purpur-${version}.jar`;
      } else if (software === "fabric") {
        url = await getFabricDownloadUrl(version);
        jarName = `fabric-${version}.jar`;
      }

      if (!url) throw new Error("No se pudo obtener la URL de descarga.");

      const tempDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + jarName;
      showFeedback(`Descargando ${software} ${version}... Esto puede tardar dependiendo de tu conexión.`, "info");

      await invoke("descargar_servidor_jar", { url: url, destino: tempDest });

      payload.server_jar_path = tempDest;
    } catch (err) {
      appState.pendingCreateFlow = false;
      showFeedback(`Error durante la descarga: ${err.message || err}`, "error");
      appendLog("stderr", err.message || err);
      return;
    }
  }

  showFeedback("Creando servidor y ejecutando el arranque inicial...", "info");
  const snapshot = await invoke("crear_e_iniciar_servidor", {
    request: payload,
  });
  applySnapshot(snapshot);
  appState.pendingCreateFlow = false;
  navigateTo("control");
  showFeedback("Servidor creado. Revisa la terminal para ver el progreso de inicio.", "success");
}

export async function startCurrentServer() {
  appState.pendingCreateFlow = false;
  clearLogs();
  showFeedback("Iniciando servidor...", "info");
  
  // Disparar las tareas programadas de tipo "Al iniciar"
  triggerStartTasks();

  const snapshot = await invoke("iniciar_servidor_actual");
  applySnapshot(snapshot);
}

export async function stopServer() {
  showFeedback("Enviando señal de apagado al servidor...", "info");
  await invoke("detener_servidor");
}

export async function sendCommand() {
  const comando = els.inputCommand.value.trim();
  if (!comando) {
    return;
  }

  await invoke("enviar_comando", { comando });
  appendLog("system", `> ${comando}`);
  els.inputCommand.value = "";
}

export async function continueAfterEulaAcceptance() {
  showFeedback("Aceptando EULA y reiniciando servidor...", "info");
  const snapshot = await invoke("aceptar_eula_y_reiniciar");
  applySnapshot(snapshot);
}

export async function saveServerConfig() {
  if (!appState.activeSession) {
    showFeedback("No hay un servidor activo para configurar.", "info");
    return;
  }

  const memoryGb = Number.parseInt(els.controlMemoryGb.value, 10);
  if (!Number.isFinite(memoryGb) || memoryGb <= 0) {
    showFeedback("La RAM debe ser un valor en GB mayor que cero.", "error");
    return;
  }

  let jarSelection = "";
  const isDownload = els.controlSourceDownload && els.controlSourceDownload.checked;

  if (isDownload) {
    showFeedback("Preparando descarga del software...", "info");
    const software = els.controlEngineSelect.value;
    const version = els.controlVersionSelect.value;

    if (!version) {
      showFeedback("Por favor, selecciona una versión para descargar.", "error");
      return;
    }

    let url = "";
    let jarName = "";

    try {
      if (software === "paper") {
        url = await getPaperDownloadUrl(version);
        jarName = `paper-${version}.jar`;
      } else if (software === "vanilla") {
        url = await getVanillaDownloadUrl(version);
        jarName = `vanilla-${version}.jar`;
      } else if (software === "purpur") {
        url = await getPurpurDownloadUrl(version);
        jarName = `purpur-${version}.jar`;
      } else if (software === "fabric") {
        url = await getFabricDownloadUrl(version);
        jarName = `fabric-${version}.jar`;
      }

      if (!url) throw new Error("No se pudo obtener la URL de descarga.");

      const serverDir = appState.activeSession.server_dir;
      const tempDest = serverDir + (serverDir.endsWith("/") || serverDir.endsWith("\\") ? "" : "/") + "temp_" + jarName;
      
      showFeedback(`Descargando ${software} ${version}... Esto puede tardar dependiendo de tu conexión.`, "info");
      await invoke("descargar_servidor_jar", { url: url, destino: tempDest });
      
      jarSelection = tempDest;
    } catch (err) {
      showFeedback(`Error durante la descarga: ${err.message || err}`, "error");
      appendLog("stderr", err.message || err);
      return;
    }
  } else {
    const jarSelectionValue = els.controlServerJarPath.value.trim();
    jarSelection =
      jarSelectionValue &&
        (jarSelectionValue.includes("/") || jarSelectionValue.includes("\\"))
        ? jarSelectionValue
        : "";
  }

  const payload = {
    server_name: els.controlServerName.value.trim(),
    server_jar_path: jarSelection,
    java_path: els.controlJavaVersion.value.trim(),
    memory_gb: memoryGb,
  };

  try {
    const snapshot = await invoke("actualizar_configuracion_servidor", {
      request: payload,
    });
    applySnapshot(snapshot);
    navigateTo("control");
    showFeedback("Configuración guardada correctamente.", "success");
  } catch (err) {
    showFeedback(`Error al guardar configuración: ${err}`, "error");
  }
}

export async function acceptEulaAndRestart() {
  if (!appState.eulaPending) {
    showFeedback("No hay un EULA pendiente por aceptar.", "info");
    return;
  }

  try {
    await continueAfterEulaAcceptance();
    navigateTo("control");
  } catch (error) {
    const message = normalizeError(error);
    showFeedback(message, "error");
    appendLog("stderr", message);
  }
}

export async function loadAndShowEula() {
  els.eulaTextContainer.textContent = "Cargando el acuerdo de licencia (EULA) desde internet...";
  els.checkboxAcceptEula.checked = false;
  els.btnEulaAcceptContinue.disabled = true;
  navigateTo("eula");
  try {
    const text = await invoke("obtener_eula_texto");
    els.eulaTextContainer.textContent = text;
  } catch (error) {
    const message = normalizeError(error);
    showFeedback(`Error al obtener el EULA: ${message}`, "error");
    els.eulaTextContainer.textContent = "Error al descargar el EULA de Minecraft. Por favor, asegúrate de estar conectado a internet o inténtalo de nuevo.";
  }
}

export function handleServerLogLine(message) {
  let text = normalizeMessage(message);
  text = text.replace(/\x1b\[[0-9;]*m/g, "");

  const joinMatch = text.match(/INFO\]:\s+([a-zA-Z0-9_]{1,16})\s+joined the game/i);
  if (joinMatch) {
    connectedPlayers.add(joinMatch[1]);
    renderPlayersList();
    return;
  }
  const leaveMatch = text.match(/INFO\]:\s+([a-zA-Z0-9_]{1,16})\s+left the game/i);
  if (leaveMatch) {
    connectedPlayers.delete(leaveMatch[1]);
    renderPlayersList();
    return;
  }
}

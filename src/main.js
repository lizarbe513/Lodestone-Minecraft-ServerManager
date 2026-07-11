const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open } = window.__TAURI__.dialog;

const statusLabels = {
  offline: "Apagado",
  starting: "Iniciando",
  running: "Encendido",
  waiting_eula: "Esperando EULA",
};

const appState = {
  status: "offline",
  activeSession: null,
  javaVersions: [],
  eulaPending: false,
  currentPage: "home",
  pendingCreateFlow: false,
};

let pageHomeEl;
let pageCreateEl;
let pageControlEl;
let homeSessionHintEl;
let serverStatusEl;
let feedbackEl;
let logOutputEl;
let btnHomeCreateEl;
let btnHomeOpenExistingEl;
let btnHomeOpenLastEl;
let btnCreateBackEl;
let btnSelectServerJarEl;
let btnSelectServerParentDirEl;
let btnCreateServerEl;
let btnCreateAcceptEulaEl;
let btnControlBackEl;
let btnControlStartEl;
let btnControlStopEl;
let btnControlOpenFolderEl;
let btnControlAcceptEulaEl;
let btnToggleConfigPanelEl;
let btnSendCommandEl;
let serverJarPathEl;
let serverParentDirEl;
let serverNameEl;
let javaVersionEl;
let memoryGbEl;
let inputCommandEl;
let summaryServerNameEl;
let summaryServerDirEl;
let summaryJarFileEl;
let summaryJavaPathEl;
let summaryMemoryEl;
let controlServerNameEl;
let controlServerJarPathEl;
let controlJavaVersionEl;
let controlMemoryGbEl;
let pageConfigEl;
let btnConfigBackEl;
let btnControlSelectJarEl;
let btnControlSaveConfigEl;

let radioJarSourceLocalEl;
let radioJarSourceDownloadEl;
let sectionJarLocalEl;
let sectionJarDownloadEl;
let selectDownloadTypeEl;
let selectDownloadVersionEl;
let downloadStatusHintEl;
let cachedVanillaVersions = null;

let pagePropertiesEl;
let btnOpenPropertiesEl;
let btnPropertiesSaveEl;
let btnPropertiesBackEl;
let propertiesContainerEl;

let pagePlayersEl;
let btnOpenPlayersEl;
let btnPlayersBackEl;
let listOpsEl, listWhitelistEl, listBannedPlayersEl, listBannedIpsEl;
let inputAddOpEl, btnAddOpEl;
let inputAddWhitelistEl, btnAddWhitelistEl;
let inputAddBannedPlayerEl, btnAddBannedPlayerEl;
let inputAddBannedIpEl, btnAddBannedIpEl;
let whitelistStatusBadgeEl;

let statRamEl;
let statCpuEl;
let statsInterval = null;

let connectedPlayers = new Set();
let playersCountEl;
let playersListEl;
let confirmDialogEl;
let confirmTitleEl;
let confirmMessageEl;
let btnConfirmCancelEl;
let btnConfirmAcceptEl;
let pendingConfirmAction = null;

let parsedProperties = {};
let rawPropertiesLines = [];

const EXCLUDED_PROPERTIES = [];

const PROPERTY_GROUPS = {
  "Mundo y Generación": ["motd", "max-players", "max-world-size", "view-distance", "simulation-distance", "max-build-height", "allow-nether", "generate-structures"],
  "Reglas del Juego": ["gamemode", "difficulty", "hardcore", "pvp", "allow-flight", "force-gamemode"],
  "Generación de Entidades": ["spawn-monsters", "spawn-animals", "spawn-npcs"],
  "Seguridad y Accesos": ["enforce-whitelist", "white-list", "online-mode", "function-permission-level", "op-permission-level", "hide-online-players", "prevent-proxy-connections"],
  "Avanzado / Red": ["server-ip", "server-port", "network-compression-threshold", "entity-broadcast-range-percentage", "enable-command-block", "enable-rcon", "enable-query", "rate-limit", "player-idle-timeout", "sync-chunk-writes", "enable-status"],
  "Mundo (Avanzado)": ["level-name", "level-seed", "level-type", "generator-settings"],
  "Paquetes de Recursos": ["require-resource-pack", "resource-pack", "resource-pack-id", "resource-pack-prompt", "resource-pack-sha1", "initial-enabled-packs", "initial-disabled-packs"],
  "Gestión Remota (Management)": ["management-server-enabled", "management-server-host", "management-server-port", "management-server-secret", "management-server-allowed-origins", "management-server-tls-enabled", "management-server-tls-keystore", "management-server-tls-keystore-password"]
};

let lastRenderedSessionDir = null;

function showFeedback(message, type = "info") {
  feedbackEl.textContent = message;
  feedbackEl.dataset.type = type;
}

function normalizeError(error) {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `${error}`;
}

function normalizeMessage(message) {
  return `${message}`.replace(/\r/g, "").trimEnd();
}

function appendLog(kind, message) {
  const text = normalizeMessage(message);
  if (!text) {
    return;
  }

  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  line.textContent = text;
  logOutputEl.appendChild(line);
  logOutputEl.scrollTop = logOutputEl.scrollHeight;
}

function clearLogs() {
  logOutputEl.innerHTML = "";
}

function fileNameFromPath(filePath) {
  return filePath.split(/[\\/]/).pop() ?? "";
}

function suggestedServerName(filePath) {
  return fileNameFromPath(filePath).replace(/\.jar$/i, "");
}

function navigateTo(page) {
  appState.currentPage = page;
  pageHomeEl.hidden = page !== "home";
  pageCreateEl.hidden = page !== "create";
  pageControlEl.hidden = page !== "control";
  if (pagePropertiesEl) pagePropertiesEl.hidden = page !== "properties";
  if (pageConfigEl) pageConfigEl.hidden = page !== "config";
  if (pagePlayersEl) pagePlayersEl.hidden = page !== "players";
  updateControls();
}

function renderHomeHint() {
  const hasLastSession = Boolean(appState.activeSession);

  btnHomeOpenLastEl.hidden = !hasLastSession;

  if (!hasLastSession) {
    btnHomeOpenLastEl.textContent = "Abrir último servidor encendido";
    homeSessionHintEl.hidden = true;
    homeSessionHintEl.textContent = "";
    return;
  }

  btnHomeOpenLastEl.textContent = `Abrir último servidor: ${appState.activeSession.server_name}`;
  homeSessionHintEl.hidden = false;
  homeSessionHintEl.textContent = `Último servidor guardado: ${appState.activeSession.server_name}`;
}

function renderJavaOptions(selectedPath = null, targetSelect = null) {
  const select = targetSelect || javaVersionEl;
  const rememberedPath = selectedPath || select.value || "";
  select.innerHTML = "";

  if (appState.javaVersions.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No se detectaron versiones de Java";
    option.value = "";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;

  for (const javaVersion of appState.javaVersions) {
    const option = document.createElement("option");
    option.value = javaVersion.path;
    option.textContent = javaVersion.label;
    select.appendChild(option);
  }

  if (
    rememberedPath &&
    appState.javaVersions.some((option) => option.path === rememberedPath)
  ) {
    select.value = rememberedPath;
  } else {
    select.selectedIndex = 0;
  }
}

function syncControlConfigForm() {
  if (!appState.activeSession) {
    controlServerNameEl.value = "";
    controlServerJarPathEl.value = "";
    controlMemoryGbEl.value = "4";
    renderJavaOptions(null, controlJavaVersionEl);
    return;
  }

  controlServerNameEl.value = appState.activeSession.server_name;
  controlServerJarPathEl.value = appState.activeSession.jar_file_name;
  controlMemoryGbEl.value = `${appState.activeSession.memory_gb}`;
  renderJavaOptions(appState.activeSession.java_path, controlJavaVersionEl);
}

function renderActiveSession() {
  const session = appState.activeSession;

  if (!session) {
    summaryServerNameEl.textContent = "—";
    summaryServerDirEl.textContent = "—";
    summaryJarFileEl.textContent = "—";
    summaryJavaPathEl.textContent = "—";
    summaryMemoryEl.textContent = "—";
    lastRenderedSessionDir = null;
    renderHomeHint();
    return;
  }

  summaryServerNameEl.textContent = session.server_name;
  summaryServerDirEl.textContent = session.server_dir;
  summaryJarFileEl.textContent = session.jar_file_name;
  summaryJavaPathEl.textContent = session.java_path;
  summaryMemoryEl.textContent = `${session.memory_gb} GB`;

  if (lastRenderedSessionDir !== session.server_dir) {
    clearLogs();
    lastRenderedSessionDir = session.server_dir;
  }

  renderHomeHint();
  syncControlConfigForm();
}

function setStatus(status) {
  appState.status = status;

  serverStatusEl.textContent = statusLabels[status] ?? status;
  serverStatusEl.dataset.status = status;
  updateControls();

  if (status === "running") {
    if (!statsInterval) {
      statsInterval = setInterval(async () => {
        try {
          const stats = await invoke("obtener_estadisticas_servidor");
          if (statRamEl) statRamEl.textContent = `${stats.ram_mb} MB`;
          if (statCpuEl) statCpuEl.textContent = `${stats.cpu.toFixed(1)}%`;
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
  } else {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    if (statRamEl) statRamEl.textContent = "--";
    if (statCpuEl) statCpuEl.textContent = "--";
    
    if (status === "offline" || status === "starting") {
        connectedPlayers.clear();
        renderPlayersList();
    }
  }
}

function renderPlayersList() {
    if (!playersCountEl || !playersListEl) return;
    
    playersCountEl.textContent = connectedPlayers.size;
    playersListEl.innerHTML = "";
    if (connectedPlayers.size === 0) {
        playersListEl.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No hay jugadores conectados.</p>';
        return;
    }
    
    for (const player of connectedPlayers) {
        const item = document.createElement('div');
        item.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-hover);";
        
        const name = document.createElement('strong');
        name.style.fontSize = "1rem";
        name.textContent = player;
        
        const row = document.createElement('div');
        row.className = "row";
        row.style.gap = "8px";
        
        const btnKick = document.createElement('button');
        btnKick.className = "secondary";
        btnKick.style = "padding: 4px 12px; font-size: 0.85rem;";
        btnKick.textContent = "Expulsar";
        btnKick.onclick = () => { invoke("enviar_comando", { comando: `kick ${player}` }); };
        
        const btnOp = document.createElement('button');
        btnOp.className = "secondary";
        btnOp.style = "padding: 4px 12px; font-size: 0.85rem;";
        btnOp.textContent = "Convertir en OP";
        btnOp.onclick = () => requestConfirm(`Convertir en OP a ${player}`, `¿Estás seguro de que quieres darle permisos de operador a ${player}?`, `op ${player}`);
        
        const btnBan = document.createElement('button');
        btnBan.className = "warning";
        btnBan.style = "padding: 4px 12px; font-size: 0.85rem;";
        btnBan.textContent = "Banear";
        btnBan.onclick = () => requestConfirm(`Banear a ${player}`, `¿Estás seguro de que quieres banear a ${player} del servidor?`, `ban ${player}`);
        
        row.appendChild(btnKick);
        row.appendChild(btnOp);
        row.appendChild(btnBan);
        item.appendChild(name);
        item.appendChild(row);
        playersListEl.appendChild(item);
    }
}

function requestConfirm(title, message, command) {
    if (!confirmDialogEl) return;
    confirmTitleEl.textContent = title;
    confirmMessageEl.textContent = message;
    pendingConfirmAction = command;
    confirmDialogEl.showModal();
}

function handleServerLogLine(message) {
    let text = normalizeMessage(message);
    // Strip ANSI escape codes that might interfere with regex
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

function formIsValid() {
  const memoryGb = Number.parseInt(memoryGbEl.value, 10);

  const isLocal = radioJarSourceLocalEl && radioJarSourceLocalEl.checked;
  const jarValid = isLocal 
      ? serverJarPathEl.value.trim() !== ""
      : selectDownloadVersionEl && selectDownloadVersionEl.value !== "";

  return (
    jarValid &&
    serverParentDirEl.value.trim() !== "" &&
    serverNameEl.value.trim() !== "" &&
    javaVersionEl.value.trim() !== "" &&
    Number.isFinite(memoryGb) &&
    memoryGb > 0
  );
}

function updateControls() {
  const busy = appState.status === "starting" || appState.status === "running";
  const waitingEula = appState.status === "waiting_eula";
  const hasSession = Boolean(appState.activeSession);
  const canNavigateBack = !busy && !waitingEula;

  btnHomeCreateEl.disabled = busy || waitingEula;
  btnHomeOpenExistingEl.disabled = busy || waitingEula;
  btnHomeOpenLastEl.disabled = busy || waitingEula || !hasSession;

  btnCreateBackEl.disabled = !canNavigateBack;
  btnSelectServerJarEl.disabled = busy || waitingEula;
  btnSelectServerParentDirEl.disabled = busy || waitingEula;
  btnCreateServerEl.disabled = busy || waitingEula || !formIsValid();
  btnCreateAcceptEulaEl.hidden = !waitingEula || !appState.pendingCreateFlow;
  btnCreateAcceptEulaEl.disabled = !waitingEula;

  btnControlBackEl.disabled = !canNavigateBack;
  btnControlStartEl.disabled = !hasSession || busy || waitingEula;
  btnControlStopEl.disabled = !(
    appState.status === "starting" || appState.status === "running"
  );
  btnControlOpenFolderEl.disabled = !hasSession;
  if (btnToggleConfigPanelEl) btnToggleConfigPanelEl.disabled = !hasSession || busy;
  if (btnOpenPropertiesEl) btnOpenPropertiesEl.disabled = !hasSession || busy;
  btnControlAcceptEulaEl.hidden = !waitingEula || appState.pendingCreateFlow;
  btnControlAcceptEulaEl.disabled = !waitingEula;
  inputCommandEl.disabled = appState.status !== "running";
  btnSendCommandEl.disabled = appState.status !== "running";
}

function collectNewServerPayload() {
  const memoryGb = Number.parseInt(memoryGbEl.value, 10);

  if (!Number.isFinite(memoryGb) || memoryGb <= 0) {
    throw new Error("La RAM debe ser un valor en GB mayor que cero.");
  }
  
  // Note: if it's download mode, server_jar_path will be replaced dynamically during createServer()
  return {
    server_name: serverNameEl.value.trim(),
    server_jar_path: serverJarPathEl.value.trim(),
    parent_dir: serverParentDirEl.value.trim(),
    java_path: javaVersionEl.value.trim(),
    memory_gb: memoryGb,
  };
}

function resetNewServerForm() {
  serverJarPathEl.value = "";
  serverParentDirEl.value = "";
  serverNameEl.value = "";
  if (radioJarSourceLocalEl) radioJarSourceLocalEl.checked = true;
  if (sectionJarLocalEl) sectionJarLocalEl.hidden = false;
  if (sectionJarDownloadEl) sectionJarDownloadEl.hidden = true;
  if (downloadStatusHintEl) downloadStatusHintEl.textContent = "";
  memoryGbEl.value = "4";
  renderJavaOptions();
  updateControls();
}

async function browseServerJar(targetInput = null) {
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
    controlServerJarPathEl.value = selectedPath;
    return;
  }

  serverJarPathEl.value = selectedPath;
  if (!serverNameEl.value.trim()) {
    serverNameEl.value = suggestedServerName(selectedPath);
  }
  updateControls();
}

async function browseServerParentDir() {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    defaultPath: serverParentDirEl.value.trim() || undefined,
    title: "Selecciona el directorio donde se creará la carpeta del servidor",
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  serverParentDirEl.value = selectedPath;
  updateControls();
}

async function openExistingServer() {
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

async function getPaperDownloadUrl(version) {
    const res = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
    const data = await res.json();
    const build = data.builds[data.builds.length - 1];
    return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/paper-${version}-${build}.jar`;
}

async function getVanillaDownloadUrl(versionId) {
    if (!cachedVanillaVersions) return null;
    const version = cachedVanillaVersions.find(v => v.id === versionId);
    if (!version) return null;
    const res = await fetch(version.url);
    const data = await res.json();
    return data.downloads.server.url;
}

async function createServer() {
  const isDownload = radioJarSourceDownloadEl && radioJarSourceDownloadEl.checked;
  let payload = collectNewServerPayload();
  
  appState.pendingCreateFlow = true;
  clearLogs();
  
  if (isDownload) {
      showFeedback("Obteniendo información de descarga...", "info");
      const software = selectDownloadTypeEl.value;
      const version = selectDownloadVersionEl.value;
      let url = "";
      let jarName = "";
      
      try {
          if (software === "paper") {
              url = await getPaperDownloadUrl(version);
              jarName = `paper-${version}.jar`;
          } else if (software === "vanilla") {
              url = await getVanillaDownloadUrl(version);
              jarName = `vanilla-${version}.jar`;
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
  try {
      const snapshot = await invoke("crear_e_iniciar_servidor", {
        request: payload,
      });
      applySnapshot(snapshot);
  } finally {
      // Intento de borrar el archivo temporal si existe y era descarga
      if (isDownload && payload.server_jar_path.includes("temp_")) {
          // No necesitamos bloquear ni mostrar error si falla el borrado
          try {
              // Aquí usaríamos una API de fs si la tuviéramos, 
              // pero como tauri-plugin-fs no está, el archivo temporal se quedará en parent_dir.
              // Como es la carpeta padre y no la del server, es aceptable, 
              // o podríamos modificar Rust para que use un temp dir real,
              // pero esto funciona bien de momento.
          } catch(e) {}
      }
  }
}

async function startCurrentServer() {
  appState.pendingCreateFlow = false;
  clearLogs();
  showFeedback("Iniciando servidor...", "info");
  const snapshot = await invoke("iniciar_servidor_actual");
  applySnapshot(snapshot);
}

async function stopServer() {
  showFeedback("Enviando señal de apagado al servidor...", "info");
  await invoke("detener_servidor");
}

async function sendCommand() {
  const comando = inputCommandEl.value.trim();
  if (!comando) {
    return;
  }

  await invoke("enviar_comando", { comando });
  appendLog("system", `> ${comando}`);
  inputCommandEl.value = "";
}

async function continueAfterEulaAcceptance() {
  showFeedback("Aceptando EULA y reiniciando servidor...", "info");
  const snapshot = await invoke("aceptar_eula_y_reiniciar");
  applySnapshot(snapshot);

  if (appState.pendingCreateFlow) {
    appState.pendingCreateFlow = false;
    navigateTo("control");
  }
}

async function saveServerConfig() {
  if (!appState.activeSession) {
    showFeedback("No hay un servidor activo para configurar.", "info");
    return;
  }

  const memoryGb = Number.parseInt(controlMemoryGbEl.value, 10);
  if (!Number.isFinite(memoryGb) || memoryGb <= 0) {
    showFeedback("La RAM debe ser un valor en GB mayor que cero.", "error");
    return;
  }

  const jarSelectionValue = controlServerJarPathEl.value.trim();
  const jarSelection =
    jarSelectionValue &&
    (jarSelectionValue.includes("/") || jarSelectionValue.includes("\\"))
      ? jarSelectionValue
      : "";

  const payload = {
    server_name: controlServerNameEl.value.trim(),
    server_jar_path: jarSelection,
    java_path: controlJavaVersionEl.value.trim(),
    memory_gb: memoryGb,
  };

  const snapshot = await invoke("actualizar_configuracion_servidor", {
    request: payload,
  });
  applySnapshot(snapshot);
  navigateTo("control");
  showFeedback("Configuración guardada correctamente.", "success");
}

async function acceptEulaAndRestart() {
  if (!appState.eulaPending) {
    showFeedback("No hay un EULA pendiente por aceptar.", "info");
    return;
  }

  try {
    await continueAfterEulaAcceptance();
  } catch (error) {
    const message = normalizeError(error);
    showFeedback(message, "error");
    appendLog("stderr", message);
  }
}

function applySnapshot(snapshot) {
  appState.activeSession = snapshot.active_session ?? null;
  appState.javaVersions = snapshot.java_versions ?? [];
  appState.eulaPending = snapshot.eula_pending ?? false;

  renderJavaOptions(appState.activeSession?.java_path ?? null);
  renderActiveSession();
  setStatus(snapshot.status ?? "offline");

  if (!appState.activeSession && appState.currentPage === "control") {
    navigateTo("home");
  }
}

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

async function registerEvents() {
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

// --- Properties Management Logic ---

function parsePropertiesContent(content) {
  rawPropertiesLines = content.split('\n');
  parsedProperties = {};
  
  for (let i = 0; i < rawPropertiesLines.length; i++) {
    const line = rawPropertiesLines[i].trim();
    if (!line || line.startsWith('#')) continue;
    
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.substring(0, eqIdx).trim();
      const val = line.substring(eqIdx + 1).trim();
      parsedProperties[key] = { value: val, lineIndex: i };
    }
  }
}

function buildPropertiesPayload() {
  const newLines = [...rawPropertiesLines];
  
  for (const key of Object.keys(parsedProperties)) {
    const prop = parsedProperties[key];
    const newLine = `${key}=${prop.value}`;
    if (prop.lineIndex !== -1) {
      newLines[prop.lineIndex] = newLine;
    } else {
      newLines.push(newLine);
    }
  }
  
  return newLines.join('\n');
}

function renderPropertiesUI() {
  propertiesContainerEl.innerHTML = '';
  
  const groupsToRender = Object.assign({}, PROPERTY_GROUPS);
  const renderedKeys = new Set();
  
  for (const [groupName, keys] of Object.entries(groupsToRender)) {
    const validKeys = keys.filter(k => !EXCLUDED_PROPERTIES.includes(k));
    if (validKeys.length === 0) continue;
    
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.marginBottom = '0';
    
    const heading = document.createElement('h3');
    heading.textContent = groupName;
    heading.style.marginTop = '0';
    panel.appendChild(heading);
    
    const formGrid = document.createElement('div');
    formGrid.className = 'grid-form';
    panel.appendChild(formGrid);
    
    for (const key of validKeys) {
      const val = parsedProperties[key] ? parsedProperties[key].value : "";
      const field = createPropertyField(key, val);
      if (field) {
        formGrid.appendChild(field);
      }
      renderedKeys.add(key);
    }
    
    propertiesContainerEl.appendChild(panel);
  }
  
  // Render remaining properties that are not excluded and not in groups
  const otherKeys = Object.keys(parsedProperties).filter(k => !EXCLUDED_PROPERTIES.includes(k) && !renderedKeys.has(k));
  if (otherKeys.length > 0) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.marginBottom = '0';
    const heading = document.createElement('h3');
    heading.textContent = 'Otras configuraciones';
    heading.style.marginTop = '0';
    panel.appendChild(heading);
    
    const formGrid = document.createElement('div');
    formGrid.className = 'grid-form';
    panel.appendChild(formGrid);
    
    for (const key of otherKeys) {
      const val = parsedProperties[key].value;
      const field = createPropertyField(key, val);
      if (field) {
        formGrid.appendChild(field);
      }
    }
    propertiesContainerEl.appendChild(panel);
  }
}

function createPropertyField(key, initialValue) {
  const container = document.createElement('div');
  container.className = 'field-group';
  
  const label = document.createElement('label');
  label.textContent = key;
  
  if (initialValue === 'true' || initialValue === 'false' || key === 'hardcore' || key === 'pvp' || key === 'allow-flight' || key === 'allow-nether' || key === 'spawn-monsters' || key === 'spawn-animals' || key === 'spawn-npcs' || key === 'enforce-whitelist' || key === 'online-mode' || key === 'hide-online-players' || key === 'enable-command-block' || key === 'enable-rcon' || key === 'enable-query' || key === 'sync-chunk-writes' || key === 'enable-status' || key === 'generate-structures' || key === 'require-resource-pack' || key === 'management-server-enabled' || key === 'management-server-tls-enabled') {
    container.className = 'switch-label-wrapper';
    const wrapperLabel = document.createElement('label');
    wrapperLabel.textContent = key;
    
    const labelSwitch = document.createElement('label');
    labelSwitch.className = 'switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = initialValue === 'true';
    checkbox.addEventListener('change', () => {
      if (!parsedProperties[key]) parsedProperties[key] = { value: "", lineIndex: -1 };
      parsedProperties[key].value = checkbox.checked ? 'true' : 'false';
    });
    
    const slider = document.createElement('span');
    slider.className = 'slider';
    
    labelSwitch.appendChild(checkbox);
    labelSwitch.appendChild(slider);
    
    container.appendChild(wrapperLabel);
    container.appendChild(labelSwitch);
    return container;
  }
  
  if (key === 'difficulty') {
    const select = document.createElement('select');
    ['peaceful', 'easy', 'normal', 'hard'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (initialValue === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      if (!parsedProperties[key]) parsedProperties[key] = { value: "", lineIndex: -1 };
      parsedProperties[key].value = select.value;
    });
    container.appendChild(label);
    container.appendChild(select);
    return container;
  }
  
  if (key === 'gamemode') {
    const select = document.createElement('select');
    ['survival', 'creative', 'adventure', 'spectator'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (initialValue === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      if (!parsedProperties[key]) parsedProperties[key] = { value: "", lineIndex: -1 };
      parsedProperties[key].value = select.value;
    });
    container.appendChild(label);
    container.appendChild(select);
    return container;
  }
  
  if (key === 'function-permission-level' || key === 'op-permission-level') {
    const select = document.createElement('select');
    const levels = [
      {val: '1', text: 'Moderador (=1)'},
      {val: '2', text: 'Default (=2)'},
      {val: '3', text: 'Administrador (=3)'},
      {val: '4', text: 'Dueño (=4)'}
    ];
    levels.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.text;
      if (initialValue === opt.val) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      if (!parsedProperties[key]) parsedProperties[key] = { value: "", lineIndex: -1 };
      parsedProperties[key].value = select.value;
    });
    container.appendChild(label);
    container.appendChild(select);
    return container;
  }
  
  if (key === 'entity-broadcast-range-percentage') {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '10';
    input.value = initialValue || '100';
    input.addEventListener('input', () => {
      if (!parsedProperties[key]) parsedProperties[key] = { value: "", lineIndex: -1 };
      parsedProperties[key].value = input.value;
    });
    container.appendChild(label);
    container.appendChild(input);
    return container;
  }
  
  const isNumber = !isNaN(Number(initialValue)) && initialValue !== "";
  const input = document.createElement('input');
  input.type = isNumber && key !== 'motd' && key !== 'server-ip' ? 'number' : 'text';
  input.value = initialValue;
  input.addEventListener('input', () => {
      if (!parsedProperties[key]) parsedProperties[key] = { value: "", lineIndex: -1 };
      parsedProperties[key].value = input.value;
  });
  container.appendChild(label);
  container.appendChild(input);
  return container;
}

async function checkWhitelistStatus() {
    try {
        const content = await invoke("leer_server_properties");
        if (!content) return;
        const match = content.match(/^white-list\s*=\s*(true|false)/m);
        if (match && match[1] === "false") {
            if (inputAddWhitelistEl) inputAddWhitelistEl.disabled = true;
            if (btnAddWhitelistEl) btnAddWhitelistEl.disabled = true;
            if (whitelistStatusBadgeEl) whitelistStatusBadgeEl.textContent = "(Desactivada en server.properties)";
            
            // Disable remove buttons in list if disabled
            const removeBtns = listWhitelistEl.querySelectorAll("button");
            removeBtns.forEach(btn => btn.disabled = true);
        } else {
            if (inputAddWhitelistEl) inputAddWhitelistEl.disabled = false;
            if (btnAddWhitelistEl) btnAddWhitelistEl.disabled = false;
            if (whitelistStatusBadgeEl) whitelistStatusBadgeEl.textContent = "";
        }
    } catch (e) {
        // Fallback to active if error
    }
}

async function loadAllPlayerLists() {
    await loadPlayerList("ops.json", listOpsEl, handleRemoveOp);
    await loadPlayerList("whitelist.json", listWhitelistEl, handleRemoveWhitelist);
    await loadPlayerList("banned-players.json", listBannedPlayersEl, handleRemoveBannedPlayer);
    await loadPlayerList("banned-ips.json", listBannedIpsEl, handleRemoveBannedIp);
    await checkWhitelistStatus();
}

async function loadPlayerList(filename, containerEl, removeHandler) {
    if (!containerEl) return;
    try {
        const content = await invoke("leer_archivo_servidor", { archivo: filename });
        containerEl.innerHTML = "";
        if (!content) {
            containerEl.innerHTML = '<p class="hint" style="font-size: 0.9rem;">No hay registros.</p>';
            return;
        }
        
        let arr = [];
        try { arr = JSON.parse(content); } catch (e) { arr = []; }
        
        if (!Array.isArray(arr) || arr.length === 0) {
            containerEl.innerHTML = '<p class="hint" style="font-size: 0.9rem;">No hay registros.</p>';
            return;
        }
        
        arr.forEach(item => {
            const div = document.createElement("div");
            div.style = "display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-hover); border-radius: 6px; border: 1px solid var(--border-color);";
            
            const nameEl = document.createElement("strong");
            nameEl.style.fontSize = "0.95rem";
            nameEl.textContent = item.name || item.ip || "Desconocido";
            
            const btnRemove = document.createElement("button");
            btnRemove.className = "secondary";
            btnRemove.style.padding = "4px 8px";
            btnRemove.style.fontSize = "0.8rem";
            btnRemove.textContent = "Eliminar";
            btnRemove.onclick = () => removeHandler(item);
            
            div.appendChild(nameEl);
            div.appendChild(btnRemove);
            containerEl.appendChild(div);
        });
    } catch (err) {
        containerEl.innerHTML = `<p class="hint" style="color: var(--error);">Error: ${err}</p>`;
    }
}

async function addItemToList(filename, itemTemplate, containerEl, removeHandler) {
    try {
        const content = await invoke("leer_archivo_servidor", { archivo: filename });
        let arr = [];
        if (content) {
            try { arr = JSON.parse(content); } catch (e) { arr = []; }
        }
        if (!Array.isArray(arr)) arr = [];
        
        arr.push(itemTemplate);
        
        await invoke("guardar_archivo_servidor", { 
            archivo: filename, 
            contenido: JSON.stringify(arr, null, 2)
        });
        
        showFeedback("Lista actualizada correctamente.", "success");
        await loadPlayerList(filename, containerEl, removeHandler);
    } catch (err) {
        showFeedback(`Error al guardar: ${err}`, "error");
    }
}

async function removeItemFromList(filename, matchFn, containerEl, removeHandler) {
    try {
        const content = await invoke("leer_archivo_servidor", { archivo: filename });
        if (!content) return;
        
        let arr = [];
        try { arr = JSON.parse(content); } catch (e) { return; }
        if (!Array.isArray(arr)) return;
        
        arr = arr.filter(item => !matchFn(item));
        
        await invoke("guardar_archivo_servidor", { 
            archivo: filename, 
            contenido: JSON.stringify(arr, null, 2)
        });
        
        showFeedback("Elemento eliminado de la lista.", "success");
        await loadPlayerList(filename, containerEl, removeHandler);
    } catch (err) {
        showFeedback(`Error al guardar: ${err}`, "error");
    }
}

function handleRemoveOp(item) { removeItemFromList("ops.json", i => i.name === item.name, listOpsEl, handleRemoveOp); }
function handleRemoveWhitelist(item) { removeItemFromList("whitelist.json", i => i.name === item.name, listWhitelistEl, handleRemoveWhitelist); }
function handleRemoveBannedPlayer(item) { removeItemFromList("banned-players.json", i => i.name === item.name, listBannedPlayersEl, handleRemoveBannedPlayer); }
function handleRemoveBannedIp(item) { removeItemFromList("banned-ips.json", i => i.ip === item.ip, listBannedIpsEl, handleRemoveBannedIp); }

window.addEventListener("DOMContentLoaded", async () => {
  pageHomeEl = document.querySelector("#page-home");
  pageCreateEl = document.querySelector("#page-create");
  pageControlEl = document.querySelector("#page-control");
  pagePropertiesEl = document.querySelector("#page-properties");
  pageConfigEl = document.querySelector("#page-config");
  pagePlayersEl = document.querySelector("#page-players");
  homeSessionHintEl = document.querySelector("#home-session-hint");
  serverStatusEl = document.querySelector("#server-status");
  feedbackEl = document.querySelector("#app-feedback");
  logOutputEl = document.querySelector("#log-output");
  btnHomeCreateEl = document.querySelector("#btn-home-create");
  btnHomeOpenExistingEl = document.querySelector("#btn-home-open-existing");
  btnHomeOpenLastEl = document.querySelector("#btn-home-open-last");
  btnCreateBackEl = document.querySelector("#btn-create-back");
  btnSelectServerJarEl = document.querySelector("#btn-select-server-jar");
  btnSelectServerParentDirEl = document.querySelector(
    "#btn-select-server-parent-dir",
  );
  btnCreateServerEl = document.querySelector("#btn-create-server");
  btnCreateAcceptEulaEl = document.querySelector("#btn-create-accept-eula");
  btnControlBackEl = document.querySelector("#btn-control-back");
  btnControlStartEl = document.querySelector("#btn-control-start");
  btnControlStopEl = document.querySelector("#btn-control-stop");
  btnControlOpenFolderEl = document.querySelector("#btn-control-open-folder");
  btnOpenPropertiesEl = document.querySelector("#btn-open-properties");
  btnPropertiesSaveEl = document.querySelector("#btn-properties-save");
  btnPropertiesBackEl = document.querySelector("#btn-properties-back");
  propertiesContainerEl = document.querySelector("#properties-container");
  btnControlAcceptEulaEl = document.querySelector("#btn-control-accept-eula");
  btnToggleConfigPanelEl = document.querySelector("#btn-toggle-config-panel");
  btnSendCommandEl = document.querySelector("#btn-send-command");
  serverJarPathEl = document.querySelector("#server-jar-path");
  serverParentDirEl = document.querySelector("#server-parent-dir");
  serverNameEl = document.querySelector("#server-name");
  javaVersionEl = document.querySelector("#java-version");
  memoryGbEl = document.querySelector("#memory-gb");
  inputCommandEl = document.querySelector("#input-command");
  summaryServerNameEl = document.querySelector("#summary-server-name");
  summaryServerDirEl = document.querySelector("#summary-server-dir");
  summaryJarFileEl = document.querySelector("#summary-jar-file");
  summaryJavaPathEl = document.querySelector("#summary-java-path");
  summaryMemoryEl = document.querySelector("#summary-memory");
  controlServerNameEl = document.querySelector("#control-server-name");
  controlServerJarPathEl = document.querySelector("#control-server-jar-path");
  controlJavaVersionEl = document.querySelector("#control-java-version");
  controlMemoryGbEl = document.querySelector("#control-memory-gb");
  btnConfigBackEl = document.querySelector("#btn-config-back");
  btnControlSelectJarEl = document.querySelector("#btn-control-select-jar");
  btnControlSaveConfigEl = document.querySelector("#btn-control-save-config");
  
  radioJarSourceLocalEl = document.querySelector('input[name="jar-source"][value="local"]');
  radioJarSourceDownloadEl = document.querySelector('input[name="jar-source"][value="download"]');
  sectionJarLocalEl = document.querySelector("#section-jar-local");
  sectionJarDownloadEl = document.querySelector("#section-jar-download");
  selectDownloadTypeEl = document.querySelector("#download-software-type");
  selectDownloadVersionEl = document.querySelector("#download-software-version");
  downloadStatusHintEl = document.querySelector("#download-status-hint");
  statRamEl = document.querySelector("#stat-ram");
  statCpuEl = document.querySelector("#stat-cpu");
  playersCountEl = document.querySelector("#players-count");
  playersListEl = document.querySelector("#players-list");
  
  btnOpenPlayersEl = document.querySelector("#btn-open-players");
  btnPlayersBackEl = document.querySelector("#btn-players-back");
  listOpsEl = document.querySelector("#list-ops");
  listWhitelistEl = document.querySelector("#list-whitelist");
  listBannedPlayersEl = document.querySelector("#list-banned-players");
  listBannedIpsEl = document.querySelector("#list-banned-ips");
  inputAddOpEl = document.querySelector("#input-add-op");
  btnAddOpEl = document.querySelector("#btn-add-op");
  inputAddWhitelistEl = document.querySelector("#input-add-whitelist");
  btnAddWhitelistEl = document.querySelector("#btn-add-whitelist");
  inputAddBannedPlayerEl = document.querySelector("#input-add-banned-player");
  btnAddBannedPlayerEl = document.querySelector("#btn-add-banned-player");
  inputAddBannedIpEl = document.querySelector("#input-add-banned-ip");
  btnAddBannedIpEl = document.querySelector("#btn-add-banned-ip");
  whitelistStatusBadgeEl = document.querySelector("#whitelist-status-badge");

  confirmDialogEl = document.querySelector("#confirm-dialog");
  confirmTitleEl = document.querySelector("#confirm-title");
  confirmMessageEl = document.querySelector("#confirm-message");
  btnConfirmCancelEl = document.querySelector("#btn-confirm-cancel");
  btnConfirmAcceptEl = document.querySelector("#btn-confirm-accept");

  if (btnConfirmCancelEl) {
      btnConfirmCancelEl.addEventListener("click", () => {
          pendingConfirmAction = null;
          confirmDialogEl.close();
      });
  }

  if (btnConfirmAcceptEl) {
      btnConfirmAcceptEl.addEventListener("click", () => {
          if (pendingConfirmAction) {
              invoke("enviar_comando", { comando: pendingConfirmAction });
              pendingConfirmAction = null;
          }
          confirmDialogEl.close();
      });
  }

  if (btnOpenPlayersEl) {
      btnOpenPlayersEl.addEventListener("click", () => {
          navigateTo("players");
          showFeedback("Gestión avanzada de jugadores (Archivos locales).", "info");
          loadAllPlayerLists();
      });
  }

  if (btnPlayersBackEl) {
      btnPlayersBackEl.addEventListener("click", () => {
          navigateTo("control");
          showFeedback("Panel de control del servidor.", "info");
      });
  }

  if (btnAddOpEl) {
      btnAddOpEl.addEventListener("click", () => {
          const name = inputAddOpEl.value.trim();
          if (!name) return;
          addItemToList("ops.json", { uuid: "", name: name, level: 4, bypassesPlayerLimit: false }, listOpsEl, handleRemoveOp);
          inputAddOpEl.value = "";
      });
  }

  if (btnAddWhitelistEl) {
      btnAddWhitelistEl.addEventListener("click", () => {
          const name = inputAddWhitelistEl.value.trim();
          if (!name) return;
          addItemToList("whitelist.json", { uuid: "", name: name }, listWhitelistEl, handleRemoveWhitelist);
          inputAddWhitelistEl.value = "";
      });
  }

  if (btnAddBannedPlayerEl) {
      btnAddBannedPlayerEl.addEventListener("click", () => {
          const name = inputAddBannedPlayerEl.value.trim();
          if (!name) return;
          const formatter = new Date();
          addItemToList("banned-players.json", { uuid: "", name: name, created: formatter.toISOString().split('T')[0] + " 00:00:00 +0000", source: "Server", expires: "forever", reason: "Banned by an operator." }, listBannedPlayersEl, handleRemoveBannedPlayer);
          inputAddBannedPlayerEl.value = "";
      });
  }

  if (btnAddBannedIpEl) {
      btnAddBannedIpEl.addEventListener("click", () => {
          const ip = inputAddBannedIpEl.value.trim();
          if (!ip) return;
          const formatter = new Date();
          addItemToList("banned-ips.json", { ip: ip, created: formatter.toISOString().split('T')[0] + " 00:00:00 +0000", source: "Server", expires: "forever", reason: "Banned by an operator." }, listBannedIpsEl, handleRemoveBannedIp);
          inputAddBannedIpEl.value = "";
      });
  }

  btnHomeCreateEl.addEventListener("click", () => {
    resetNewServerForm();
    appState.pendingCreateFlow = false;
    navigateTo("create");
    showFeedback(
      "Configura el software, el directorio, el nombre, Java y la RAM del nuevo servidor.",
      "info",
    );
  });

  if (radioJarSourceLocalEl && radioJarSourceDownloadEl) {
      const toggleSource = () => {
          const isLocal = radioJarSourceLocalEl.checked;
          sectionJarLocalEl.hidden = !isLocal;
          sectionJarDownloadEl.hidden = isLocal;
          updateControls();
          if (!isLocal && selectDownloadVersionEl.options.length <= 1) {
              loadDownloadVersions();
          }
      };
      radioJarSourceLocalEl.addEventListener("change", toggleSource);
      radioJarSourceDownloadEl.addEventListener("change", toggleSource);
  }

  if (selectDownloadTypeEl) {
      selectDownloadTypeEl.addEventListener("change", loadDownloadVersions);
  }

  if (selectDownloadVersionEl) {
      selectDownloadVersionEl.addEventListener("change", updateControls);
  }

  async function loadDownloadVersions() {
      selectDownloadVersionEl.innerHTML = '<option value="">Cargando...</option>';
      selectDownloadVersionEl.disabled = true;
      downloadStatusHintEl.textContent = "Obteniendo versiones desde la red...";
      
      const type = selectDownloadTypeEl.value;
      try {
          if (type === "paper") {
              const res = await fetch("https://api.papermc.io/v2/projects/paper");
              const data = await res.json();
              const versions = data.versions.reverse(); // Newest first
              
              selectDownloadVersionEl.innerHTML = "";
              versions.forEach(v => {
                  const opt = document.createElement("option");
                  opt.value = v;
                  opt.textContent = v;
                  selectDownloadVersionEl.appendChild(opt);
              });
              downloadStatusHintEl.textContent = "Versiones de Paper obtenidas correctamente.";
          } else if (type === "vanilla") {
              const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
              const data = await res.json();
              cachedVanillaVersions = data.versions;
              const versions = data.versions.filter(v => v.type === "release");
              
              selectDownloadVersionEl.innerHTML = "";
              versions.forEach(v => {
                  const opt = document.createElement("option");
                  opt.value = v.id;
                  opt.textContent = v.id;
                  selectDownloadVersionEl.appendChild(opt);
              });
              downloadStatusHintEl.textContent = "Versiones de Vanilla obtenidas correctamente.";
          }
          selectDownloadVersionEl.disabled = false;
      } catch (err) {
          selectDownloadVersionEl.innerHTML = '<option value="">Error</option>';
          downloadStatusHintEl.textContent = "Error al obtener versiones: " + err;
      }
      updateControls();
  }

  btnHomeOpenExistingEl.addEventListener("click", async () => {
    try {
      await openExistingServer();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnHomeOpenLastEl.addEventListener("click", () => {
    if (!appState.activeSession) {
      return;
    }

    navigateTo("control");
    showFeedback(
      `Abriendo el último servidor guardado: ${appState.activeSession.server_name}.`,
      "info",
    );
  });

  btnCreateBackEl.addEventListener("click", () => {
    if (btnCreateBackEl.disabled) {
      return;
    }

    appState.pendingCreateFlow = false;
    navigateTo("home");
    showFeedback("Selecciona una opción para continuar.", "info");
  });

  btnSelectServerJarEl.addEventListener("click", async () => {
    try {
      await browseServerJar();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnSelectServerParentDirEl.addEventListener("click", async () => {
    try {
      await browseServerParentDir();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnCreateServerEl.addEventListener("click", async () => {
    try {
      await createServer();
    } catch (error) {
      appState.pendingCreateFlow = false;
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnCreateAcceptEulaEl.addEventListener("click", async () => {
    await acceptEulaAndRestart();
  });

  btnControlBackEl.addEventListener("click", () => {
    if (btnControlBackEl.disabled) {
      return;
    }

    navigateTo("home");
    showFeedback("Volviste a la pantalla principal.", "info");
  });

  btnToggleConfigPanelEl.addEventListener("click", () => {
    if (appState.status === "starting" || appState.status === "running") {
      return;
    }
    navigateTo("config");
  });

  if (btnConfigBackEl) {
    btnConfigBackEl.addEventListener("click", () => {
      navigateTo("control");
    });
  }

  btnControlStartEl.addEventListener("click", async () => {
    try {
      await startCurrentServer();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnControlStopEl.addEventListener("click", async () => {
    try {
      await stopServer();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnControlOpenFolderEl.addEventListener("click", async () => {
    try {
      await invoke("abrir_carpeta_servidor");
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnControlAcceptEulaEl.addEventListener("click", async () => {
    await acceptEulaAndRestart();
  });

  btnControlSelectJarEl.addEventListener("click", async () => {
    try {
      await browseServerJar("control");
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnControlSaveConfigEl.addEventListener("click", async () => {
    try {
      await saveServerConfig();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  btnSendCommandEl.addEventListener("click", async () => {
    try {
      await sendCommand();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  inputCommandEl.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    try {
      await sendCommand();
    } catch (error) {
      const message = normalizeError(error);
      showFeedback(message, "error");
      appendLog("stderr", message);
    }
  });

  serverNameEl.addEventListener("input", updateControls);
  javaVersionEl.addEventListener("change", updateControls);
  memoryGbEl.addEventListener("input", updateControls);
  controlServerNameEl.addEventListener("input", () => {});
  controlJavaVersionEl.addEventListener("change", () => {});
  controlMemoryGbEl.addEventListener("input", () => {});

  if (btnOpenPropertiesEl) {
    btnOpenPropertiesEl.addEventListener("click", async () => {
      try {
        showFeedback("Cargando propiedades...", "info");
        const content = await invoke("leer_server_properties");
        parsePropertiesContent(content);
        renderPropertiesUI();
        navigateTo("properties");
        showFeedback("Propiedades cargadas.", "success");
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (btnPropertiesSaveEl) {
    btnPropertiesSaveEl.addEventListener("click", async () => {
      try {
        showFeedback("Guardando propiedades...", "info");
        const newContent = buildPropertiesPayload();
        await invoke("guardar_server_properties", { contenido: newContent });
        navigateTo("control");
        showFeedback("Propiedades guardadas correctamente.", "success");
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (btnPropertiesBackEl) {
    btnPropertiesBackEl.addEventListener("click", () => {
      navigateTo("control");
    });
  }

  try {
    await registerEvents();
    await loadInitialState();
    appendLog("system", "Aplicación lista.");
  } catch (error) {
    const message = normalizeError(error);
    showFeedback(`No se pudo inicializar la aplicación: ${message}`, "error");
    appendLog("stderr", message);
  }
});

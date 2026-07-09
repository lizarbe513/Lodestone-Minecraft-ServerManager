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

let pagePropertiesEl;
let btnOpenPropertiesEl;
let btnPropertiesSaveEl;
let btnPropertiesBackEl;
let propertiesContainerEl;

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
}

function formIsValid() {
  const memoryGb = Number.parseInt(memoryGbEl.value, 10);

  return (
    serverJarPathEl.value.trim() !== "" &&
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

async function createServer() {
  const payload = collectNewServerPayload();
  appState.pendingCreateFlow = true;
  clearLogs();
  showFeedback("Creando servidor y ejecutando el arranque inicial...", "info");
  const snapshot = await invoke("crear_e_iniciar_servidor", {
    request: payload,
  });
  applySnapshot(snapshot);
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

window.addEventListener("DOMContentLoaded", async () => {
  pageHomeEl = document.querySelector("#page-home");
  pageCreateEl = document.querySelector("#page-create");
  pageControlEl = document.querySelector("#page-control");
  pagePropertiesEl = document.querySelector("#page-properties");
  pageConfigEl = document.querySelector("#page-config");
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

  btnHomeCreateEl.addEventListener("click", () => {
    resetNewServerForm();
    appState.pendingCreateFlow = false;
    navigateTo("create");
    showFeedback(
      "Configura el software, el directorio, el nombre, Java y la RAM del nuevo servidor.",
      "info",
    );
  });

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

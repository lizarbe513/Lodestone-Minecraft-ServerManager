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
let btnControlAcceptEulaEl;
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

function renderJavaOptions(selectedPath = null) {
  const rememberedPath = selectedPath || javaVersionEl.value || "";
  javaVersionEl.innerHTML = "";

  if (appState.javaVersions.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No se detectaron versiones de Java";
    option.value = "";
    javaVersionEl.appendChild(option);
    javaVersionEl.disabled = true;
    return;
  }

  javaVersionEl.disabled = false;

  for (const javaVersion of appState.javaVersions) {
    const option = document.createElement("option");
    option.value = javaVersion.path;
    option.textContent = `${javaVersion.label} — ${javaVersion.path}`;
    javaVersionEl.appendChild(option);
  }

  if (
    rememberedPath &&
    appState.javaVersions.some((option) => option.path === rememberedPath)
  ) {
    javaVersionEl.value = rememberedPath;
  } else {
    javaVersionEl.selectedIndex = 0;
  }
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
}

function setStatus(status) {
  appState.status = status;

  serverStatusEl.textContent = statusLabels[status] ?? status;
  serverStatusEl.dataset.status = status;
  updateControls();
}

function formIsValid() {
  return (
    serverJarPathEl.value.trim() !== "" &&
    serverParentDirEl.value.trim() !== "" &&
    serverNameEl.value.trim() !== "" &&
    javaVersionEl.value.trim() !== "" &&
    Number(memoryGbEl.value) > 0
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
  btnControlAcceptEulaEl.hidden = !waitingEula || appState.pendingCreateFlow;
  btnControlAcceptEulaEl.disabled = !waitingEula;
  inputCommandEl.disabled = appState.status !== "running";
  btnSendCommandEl.disabled = appState.status !== "running";
}

function collectNewServerPayload() {
  const memoryGb = Number.parseInt(memoryGbEl.value, 10);

  if (!Number.isFinite(memoryGb) || memoryGb <= 0) {
    throw new Error("La RAM debe ser un número entero mayor que cero.");
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

async function browseServerJar() {
  const selectedPath = await open({
    directory: false,
    multiple: false,
    title: "Selecciona el archivo .jar del servidor",
    filters: [{ name: "Java Archive", extensions: ["jar"] }],
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
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

window.addEventListener("DOMContentLoaded", async () => {
  pageHomeEl = document.querySelector("#page-home");
  pageCreateEl = document.querySelector("#page-create");
  pageControlEl = document.querySelector("#page-control");
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
  btnControlAcceptEulaEl = document.querySelector("#btn-control-accept-eula");
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

  btnControlAcceptEulaEl.addEventListener("click", async () => {
    await acceptEulaAndRestart();
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

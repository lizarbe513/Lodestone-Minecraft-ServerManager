import { appState, statusLabels, connectedPlayers, globals } from "./state.js";
import { els } from "./dom.js";
import { showFeedback, clearLogs, requestConfirm } from "./utils.js";
import { invoke, ask } from "./api.js";
import { updateMetrics, clearMetrics } from "./metrics.js";

export function navigateTo(page) {
  appState.currentPage = page;
  if (els.pageHome) els.pageHome.hidden = page !== "home";
  if (els.pageCreate) els.pageCreate.hidden = page !== "create";
  if (els.pageControl) els.pageControl.hidden = page !== "control";
  if (els.pageProperties) els.pageProperties.hidden = page !== "properties";
  if (els.pageConfig) els.pageConfig.hidden = page !== "config";
  if (els.pagePlayers) els.pagePlayers.hidden = page !== "players";
  if (els.pageWorlds) els.pageWorlds.hidden = page !== "worlds";
  if (els.pageEula) els.pageEula.hidden = page !== "eula";
  if (els.pageExtensions) els.pageExtensions.hidden = page !== "extensions";
  if (els.pageBackups) els.pageBackups.hidden = page !== "backups";
  updateControls();
}

export function renderHomeHint() {
  if (!els.btnHomeOpenLastEl && !els.btnHomeOpenLast) return;
  const btn = els.btnHomeOpenLast || els.btnHomeOpenLastEl;
  const hint = els.homeSessionHint;
  if (!btn || !hint) return;

  const hasLastSession = Boolean(appState.activeSession);
  btn.hidden = !hasLastSession;

  if (!hasLastSession) {
    btn.textContent = "Abrir último servidor encendido";
    hint.hidden = true;
    hint.textContent = "";
    return;
  }

  btn.textContent = `Abrir último servidor: ${appState.activeSession.server_name}`;
  hint.hidden = false;
  hint.textContent = `Último servidor guardado: ${appState.activeSession.server_name}`;
}

export function renderJavaOptions(selectedPath = null, targetSelect = null) {
  const select = targetSelect || els.javaVersion;
  if (!select) return;

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

export async function syncControlConfigForm() {
  if (!els.controlServerName) return;

  if (!appState.activeSession) {
    els.controlServerName.value = "";
    els.controlServerJarPath.value = "";
    els.controlMemoryGb.value = "4";
    renderJavaOptions(null, els.controlJavaVersion);
    return;
  }

  els.controlServerName.value = appState.activeSession.server_name;
  els.controlServerJarPath.value = appState.activeSession.jar_file_name;
  els.controlMemoryGb.value = `${appState.activeSession.memory_gb}`;
  renderJavaOptions(appState.activeSession.java_path, els.controlJavaVersion);

  // Set default view to "Local File"
  if (els.controlSourceLocal) {
    els.controlSourceLocal.checked = true;
    els.controlLocalContainer.style.display = "flex";
    els.controlDownloadContainer.style.display = "none";
    els.controlEngineSelect.disabled = true;
    els.controlVersionSelect.disabled = true;
    els.controlVersionSelect.innerHTML = '<option value="">Cargando versiones...</option>';

    try {
      const engine = await invoke("detectar_motor_servidor", {
        serverDir: appState.activeSession.server_dir,
        jarName: appState.activeSession.jar_file_name
      });
      
      const supportedEngines = ["vanilla", "paper", "purpur", "fabric"];
      if (supportedEngines.includes(engine)) {
        els.controlEngineSelect.value = engine;
        els.controlSourceDownload.disabled = false;
      } else {
        els.controlSourceDownload.disabled = true;
        els.controlEngineSelect.value = "vanilla";
      }
    } catch (e) {
      console.error("Error detecting engine for config:", e);
      els.controlSourceDownload.disabled = true;
    }
  }
}

export function renderActiveSession() {
  if (!els.summaryServerName) return;

  const session = appState.activeSession;

  if (!session) {
    els.summaryServerName.textContent = "—";
    els.summaryServerDir.textContent = "—";
    els.summaryJarFile.textContent = "—";
    els.summaryJavaPath.textContent = "—";
    els.summaryMemory.textContent = "—";
    globals.lastRenderedSessionDir = null;
    renderHomeHint();
    return;
  }

  els.summaryServerName.textContent = session.server_name;
  els.summaryServerDir.textContent = session.server_dir;
  els.summaryJarFile.textContent = session.jar_file_name;
  els.summaryJavaPath.textContent = session.java_path;
  els.summaryMemory.textContent = `${session.memory_gb} GB`;

  if (globals.lastRenderedSessionDir !== session.server_dir) {
    clearLogs();
    globals.lastRenderedSessionDir = session.server_dir;
  }

  renderHomeHint();
  syncControlConfigForm();
}

export function setStatus(status) {
  appState.status = status;

  if (els.serverStatus) {
    els.serverStatus.textContent = statusLabels[status] ?? status;
    els.serverStatus.dataset.status = status;
  }
  
  updateControls();

  if (status === "running") {
    if (!globals.statsInterval) {
      globals.statsInterval = setInterval(async () => {
        try {
          const stats = await invoke("obtener_estadisticas_servidor");
          if (els.statRam) els.statRam.textContent = `${stats.ram_mb} MB`;
          if (els.statCpu) els.statCpu.textContent = `${stats.cpu.toFixed(1)}%`;
          updateMetrics(stats.cpu, stats.ram_mb);
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
  } else {
    if (globals.statsInterval) {
      clearInterval(globals.statsInterval);
      globals.statsInterval = null;
    }
    if (els.statRam) els.statRam.textContent = "--";
    if (els.statCpu) els.statCpu.textContent = "--";
    clearMetrics();

    if (status === "offline" || status === "starting") {
      connectedPlayers.clear();
      renderPlayersList();
    }
  }
}

export function renderPlayersList() {
  if (!els.playersCount || !els.playersList) return;

  els.playersCount.textContent = connectedPlayers.size;
  els.playersList.innerHTML = "";
  if (connectedPlayers.size === 0) {
    els.playersList.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No hay jugadores conectados.</p>';
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
    els.playersList.appendChild(item);
  }
}

export function formIsValid() {
  if (!els.memoryGb || !els.serverJarPath) return false;
  
  const memoryGb = Number.parseInt(els.memoryGb.value, 10);

  const isLocal = els.radioJarSourceLocal && els.radioJarSourceLocal.checked;
  const jarValid = isLocal
    ? els.serverJarPath.value.trim() !== ""
    : els.selectDownloadVersion && els.selectDownloadVersion.value !== "";

  return (
    jarValid &&
    els.serverParentDir.value.trim() !== "" &&
    els.serverName.value.trim() !== "" &&
    els.javaVersion.value.trim() !== "" &&
    Number.isFinite(memoryGb) &&
    memoryGb > 0
  );
}

export function updateControls() {
  if (!els.btnHomeCreate) return;
  const busy = appState.status === "starting" || appState.status === "running";
  const waitingEula = appState.status === "waiting_eula";
  const hasSession = Boolean(appState.activeSession);
  const canNavigateBack = !busy && !waitingEula;

  els.btnHomeCreate.disabled = busy || waitingEula;
  els.btnHomeOpenExisting.disabled = busy || waitingEula;
  if (els.btnHomeOpenLast) els.btnHomeOpenLast.disabled = busy || waitingEula || !hasSession;

  els.btnCreateBack.disabled = !canNavigateBack;
  els.btnSelectServerJar.disabled = busy || waitingEula;
  els.btnSelectServerParentDir.disabled = busy || waitingEula;
  els.btnCreateServer.disabled = busy || waitingEula || !formIsValid();

  els.btnControlBack.disabled = !canNavigateBack;
  els.btnControlStart.disabled = !hasSession || busy || waitingEula;
  els.btnControlStop.disabled = !(
    appState.status === "starting" || appState.status === "running"
  );
  els.btnControlOpenFolder.disabled = !hasSession;
  if (els.btnControlDeleteServer) {
    els.btnControlDeleteServer.disabled = !hasSession || busy || waitingEula;
  }
  if (els.btnToggleConfigPanel) els.btnToggleConfigPanel.disabled = !hasSession || busy;
  if (els.btnOpenProperties) els.btnOpenProperties.disabled = !hasSession || busy;
  if (els.btnOpenExtensions) els.btnOpenExtensions.disabled = !hasSession || busy;
  if (els.btnControlEula) {
    els.btnControlEula.hidden = !waitingEula;
    els.btnControlEula.disabled = !waitingEula;
  }
  if (els.inputCommand) els.inputCommand.disabled = appState.status !== "running";
  if (els.btnSendCommand) els.btnSendCommand.disabled = appState.status !== "running";
}

export function applySnapshot(snapshot) {
  appState.activeSession = snapshot.active_session ?? null;
  appState.javaVersions = snapshot.java_versions ?? [];
  appState.eulaPending = snapshot.eula_pending ?? false;
  appState.savedServers = snapshot.saved_servers ?? [];

  renderJavaOptions(appState.activeSession?.java_path ?? null);
  renderActiveSession();
  renderSavedServers();
  setStatus(snapshot.status ?? "offline");

  if (!appState.activeSession && appState.currentPage === "control") {
    navigateTo("home");
  }
}

export function renderSavedServers() {
  if (!els.listSavedServers) return;
  const servers = [...(appState.savedServers || [])].reverse();
  els.listSavedServers.innerHTML = "";

  if (servers.length === 0) {
    els.listSavedServers.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No tienes servidores guardados.</p>';
    return;
  }

  servers.forEach(server => {
    const card = document.createElement("div");
    card.style = "display: flex; flex-direction: column; padding: 16px; background: var(--bg-hover); border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 8px;";

    const header = document.createElement("div");
    header.style = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";

    const name = document.createElement("h3");
    name.style = "margin: 0; font-size: 1.1rem; color: #fff;";
    name.textContent = server.server_name;

    const actions = document.createElement("div");
    actions.style = "display: flex; gap: 8px;";

    const btnOpen = document.createElement("button");
    btnOpen.className = "primary";
    btnOpen.style = "padding: 6px 12px; font-size: 0.85rem; border-radius: 6px;";
    btnOpen.textContent = "Abrir";
    btnOpen.onclick = async () => {
      try {
        showFeedback(`Abriendo servidor "${server.server_name}"...`, "info");
        const snapshot = await invoke("abrir_servidor_existente", { serverDir: server.server_dir });
        applySnapshot(snapshot);
        navigateTo("control");
        showFeedback(`Servidor "${server.server_name}" abierto.`, "success");
      } catch (err) {
        showFeedback(`Error al abrir: ${err}`, "error");
      }
    };

    const btnRemove = document.createElement("button");
    btnRemove.className = "warning";
    btnRemove.style = "padding: 6px 12px; font-size: 0.85rem; border-radius: 6px;";
    btnRemove.textContent = "Ocultar";
    btnRemove.onclick = () => {
      requestConfirm(
        "Ocultar Servidor",
        `¿Estás seguro de que quieres quitar "${server.server_name}" de la lista de acceso rápido? (Sus archivos permanecerán intactos).`,
        async () => {
          try {
            showFeedback("Ocultando servidor...", "info");
            const snapshot = await invoke("remover_servidor_guardado", { serverDir: server.server_dir, deleteFiles: false });
            applySnapshot(snapshot);
            showFeedback("Servidor ocultado.", "success");
          } catch (e) {
            showFeedback(`Error: ${e}`, "error");
          }
        }
      );
    };

    const btnDelete = document.createElement("button");
    btnDelete.className = "danger";
    btnDelete.style = "padding: 6px 12px; font-size: 0.85rem; border-radius: 6px;";
    btnDelete.textContent = "Borrar";
    
    // Disable if it's the active server and it's busy
    const isActiveServer = appState.activeSession && appState.activeSession.server_dir === server.server_dir;
    const isBusy = appState.status === "starting" || appState.status === "running";
    if (isActiveServer && isBusy) {
        btnDelete.disabled = true;
        btnDelete.title = "No puedes borrar un servidor mientras está encendido.";
    }

    btnDelete.onclick = () => {
      requestConfirm(
        "Borrar Servidor",
        `¿Estás seguro de que quieres borrar el servidor "${server.server_name}"?\n\nLa carpeta del servidor y todos sus mundos se moverán a la papelera.`,
        async () => {
          try {
            showFeedback("Borrando servidor (moviendo a papelera)...", "info");
            const snapshot = await invoke("remover_servidor_guardado", { serverDir: server.server_dir, deleteFiles: true });
            
            // Clean up active session if it's the one we just deleted
            if (appState.activeSession && appState.activeSession.server_dir === server.server_dir) {
                appState.activeSession = null;
                navigateTo("home"); // Ensure we stay/go home
            }
            
            applySnapshot(snapshot);
            showFeedback("El servidor ha sido movido a la papelera.", "success");
          } catch (e) {
            showFeedback(`Error al borrar: ${e}`, "error");
          }
        }
      );
    };

    actions.appendChild(btnOpen);
    actions.appendChild(btnRemove);
    actions.appendChild(btnDelete);
    header.appendChild(name);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.style = "font-size: 0.9rem; color: #aeb9c8;";

    const dir = document.createElement("div");
    dir.style = "word-break: break-all; margin-bottom: 4px; font-family: monospace; font-size: 0.8rem; opacity: 0.7;";
    dir.textContent = server.server_dir;

    const details = document.createElement("div");
    details.style = "display: flex; gap: 12px; font-size: 0.85rem; flex-wrap: wrap;";
    details.innerHTML = `<span><strong>RAM:</strong> ${server.memory_gb} GB</span>
                         <span><strong>Java:</strong> ${server.java_path.split("/").pop()}</span>
                         <span><strong>Software:</strong> ${server.jar_file_name}</span>`;

    body.appendChild(dir);
    body.appendChild(details);
    card.appendChild(header);
    card.appendChild(body);
    els.listSavedServers.appendChild(card);
  });
}

import { invoke, listen, open } from "./api.js";
import { els } from "./dom.js";
import { appState, globals } from "./state.js";
import { setStatus, updateControls, navigateTo, applySnapshot } from "./ui.js";
import { showFeedback, appendLog, normalizeError, requestConfirm } from "./utils.js";
import { handleServerLogLine, resetNewServerForm, browseServerJar, browseServerParentDir, createServer, startCurrentServer, stopServer, sendCommand, saveServerConfig, acceptEulaAndRestart, loadAndShowEula, openExistingServer } from "./server.js";
import { parsePropertiesContent, renderPropertiesUI, buildPropertiesPayload } from "./properties.js";
import { loadAllPlayerLists, addItemToList, handleRemoveOp, handleRemoveWhitelist, handleRemoveBannedPlayer, handleRemoveBannedIp } from "./players.js";
import { loadWorlds } from "./worlds.js";
import { loadInstalledExtensions, searchModrinth, initExtensionsPage, setActiveCategory, setActiveSubTab, activeCategory, activeSubTab } from "./extensions.js";
import { loadBackupsList, loadTasksList, createFullBackup, addNewTask, startScheduler, setActiveAdminTab } from "./backups.js";

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
  if (els.btnConfirmCancel) {
    els.btnConfirmCancel.addEventListener("click", () => {
      globals.pendingConfirmAction = null;
      els.confirmDialog.close();
    });
  }

  if (els.btnConfirmAccept) {
    els.btnConfirmAccept.addEventListener("click", async () => {
      if (typeof globals.pendingConfirmAction === "function") {
        await globals.pendingConfirmAction();
      } else if (globals.pendingConfirmAction) {
        invoke("enviar_comando", { comando: globals.pendingConfirmAction });
      }
      globals.pendingConfirmAction = null;
      els.confirmDialog.close();
    });
  }

  if (els.btnOpenPlayers) {
    els.btnOpenPlayers.addEventListener("click", () => {
      navigateTo("players");
      showFeedback("Gestión avanzada de jugadores (Archivos locales).", "info");
      loadAllPlayerLists();
    });
  }

  if (els.btnPlayersBack) {
    els.btnPlayersBack.addEventListener("click", () => {
      navigateTo("control");
      showFeedback("Panel de control del servidor.", "info");
    });
  }

  // Pestañas de Jugadores
  if (els.tabViewOnlinePlayers) {
    els.tabViewOnlinePlayers.addEventListener("click", () => {
      els.tabViewOnlinePlayers.classList.add("active");
      els.tabViewOnlinePlayers.classList.remove("secondary");
      els.tabViewAccessManagement.classList.remove("active");
      els.tabViewAccessManagement.classList.add("secondary");
      
      els.sectionOnlinePlayers.hidden = false;
      els.sectionAccessManagement.hidden = true;
    });
  }

  if (els.tabViewAccessManagement) {
    els.tabViewAccessManagement.addEventListener("click", () => {
      els.tabViewAccessManagement.classList.add("active");
      els.tabViewAccessManagement.classList.remove("secondary");
      els.tabViewOnlinePlayers.classList.remove("active");
      els.tabViewOnlinePlayers.classList.add("secondary");
      
      els.sectionAccessManagement.hidden = false;
      els.sectionOnlinePlayers.hidden = true;
    });
  }

  if (els.btnOpenWorlds) {
    els.btnOpenWorlds.addEventListener("click", () => {
      navigateTo("worlds");
      showFeedback("Gestión de mundos locales.", "info");
      loadWorlds();
    });
  }

  if (els.btnWorldsBack) {
    els.btnWorldsBack.addEventListener("click", () => {
      navigateTo("control");
      showFeedback("Panel de control del servidor.", "info");
    });
  }

  if (els.btnImportWorld) {
    els.btnImportWorld.addEventListener("click", async () => {
      try {
        const selectedPath = await open({
          directory: false,
          multiple: false,
          title: "Selecciona el archivo .zip del mundo",
          filters: [{ name: "Zip Archive", extensions: ["zip"] }]
        });

        if (!selectedPath || Array.isArray(selectedPath)) {
          return;
        }

        const newName = window.prompt("Introduce un nombre para el mundo importado:", "world");
        if (newName && newName.trim() !== "") {
          showFeedback(`Importando el mundo "${newName.trim()}" desde archivo... Esto puede tardar unos segundos.`, "info");
          await invoke("importar_mundo_zip", { zipPath: selectedPath, mundo: newName.trim() });
          showFeedback(`Mundo "${newName.trim()}" importado correctamente.`, "success");
          loadWorlds();
        }
      } catch (e) {
        showFeedback(`Error al importar mundo: ${e}`, "error");
      }
    });
  }

  if (els.btnCreateWorld) {
    els.btnCreateWorld.addEventListener("click", async () => {
      try {
        const newName = window.prompt("Introduce un nombre para el mundo nuevo:", "nuevo_mundo");
        if (newName && newName.trim() !== "") {
          showFeedback(`Creando carpeta para nuevo mundo "${newName.trim()}"...`, "info");
          await invoke("crear_mundo_nuevo", { mundo: newName.trim() });
          showFeedback(`Mundo "${newName.trim()}" creado. Establécelo como activo para que se genere.`, "success");
          loadWorlds();
        }
      } catch (e) {
        showFeedback(`Error al crear mundo: ${e}`, "error");
      }
    });
  }

  if (els.btnAddOp) {
    els.btnAddOp.addEventListener("click", () => {
      const name = els.inputAddOp.value.trim();
      if (!name) return;
      addItemToList("ops.json", { uuid: "", name: name, level: 4, bypassesPlayerLimit: false }, els.listOps, handleRemoveOp);
      els.inputAddOp.value = "";
    });
  }

  if (els.btnAddWhitelist) {
    els.btnAddWhitelist.addEventListener("click", () => {
      const name = els.inputAddWhitelist.value.trim();
      if (!name) return;
      addItemToList("whitelist.json", { uuid: "", name: name }, els.listWhitelist, handleRemoveWhitelist);
      els.inputAddWhitelist.value = "";
    });
  }

  if (els.btnAddBannedPlayer) {
    els.btnAddBannedPlayer.addEventListener("click", () => {
      const name = els.inputAddBannedPlayer.value.trim();
      if (!name) return;
      const formatter = new Date();
      addItemToList("banned-players.json", { uuid: "", name: name, created: formatter.toISOString().split('T')[0] + " 00:00:00 +0000", source: "Server", expires: "forever", reason: "Banned by an operator." }, els.listBannedPlayers, handleRemoveBannedPlayer);
      els.inputAddBannedPlayer.value = "";
    });
  }

  if (els.btnAddBannedIp) {
    els.btnAddBannedIp.addEventListener("click", () => {
      const ip = els.inputAddBannedIp.value.trim();
      if (!ip) return;
      const formatter = new Date();
      addItemToList("banned-ips.json", { ip: ip, created: formatter.toISOString().split('T')[0] + " 00:00:00 +0000", source: "Server", expires: "forever", reason: "Banned by an operator." }, els.listBannedIps, handleRemoveBannedIp);
      els.inputAddBannedIp.value = "";
    });
  }

  if (els.btnHomeCreate) {
    els.btnHomeCreate.addEventListener("click", () => {
      resetNewServerForm();
      appState.pendingCreateFlow = false;
      navigateTo("create");
      showFeedback(
        "Configura el software, el directorio, el nombre, Java y la RAM del nuevo servidor.",
        "info",
      );
    });
  }
  if (els.btnTabCreateGame && els.btnTabCreateServer) {
    const setCreateTab = (tab) => {
      els.btnTabCreateGame.classList.toggle("active", tab === "game");
      els.btnTabCreateServer.classList.toggle("active", tab === "server");
      els.tabCreateGameContent.hidden = tab !== "game";
      els.tabCreateServerContent.hidden = tab !== "server";
    };
    els.btnTabCreateGame.addEventListener("click", () => setCreateTab("game"));
    els.btnTabCreateServer.addEventListener("click", () => setCreateTab("server"));
  }

  if (els.btnTabPropGame && els.btnTabPropServer) {
    const setPropTab = (tab) => {
      els.btnTabPropGame.classList.toggle("active", tab === "game");
      els.btnTabPropServer.classList.toggle("active", tab === "server");
      els.tabPropGameContent.hidden = tab !== "game";
      els.tabPropServerContent.hidden = tab !== "server";
    };
    els.btnTabPropGame.addEventListener("click", () => setPropTab("game"));
    els.btnTabPropServer.addEventListener("click", () => setPropTab("server"));
  }

  const gamemodes = ['survival', 'creative', 'adventure', 'spectator'];
  const gamemodeDescs = {
    survival: "Consigue recursos, fabrica herramientas, gana niveles de experiencia y cuida tu salud.",
    creative: "Recursos ilimitados, vuelo libre y destrucción instantánea de bloques.",
    adventure: "Igual que supervivencia, pero los bloques no se pueden colocar ni romper fácilmente.",
    spectator: "Puedes volar y ver el mundo sin interactuar con él."
  };

  if (els.btnCreateGamemodeCycle) {
    els.btnCreateGamemodeCycle.dataset.value = "survival";
    els.btnCreateGamemodeCycle.querySelectorAll('.mc-btn-group-item').forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        els.btnCreateGamemodeCycle.dataset.value = val;
        els.btnCreateGamemodeCycle.querySelectorAll('.mc-btn-group-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        els.createGamemodeDesc.textContent = gamemodeDescs[val];
      });
    });
  }

  const difficulties = ['peaceful', 'easy', 'normal', 'hard'];
  const difficultyDescs = {
    peaceful: "No aparecen monstruos. La salud se regenera automáticamente.",
    easy: "Aparecen monstruos pero hacen poco daño.",
    normal: "Aparecen monstruos. Daño estándar.",
    hard: "Monstruos más agresivos y letales. El hambre puede matarte."
  };

  if (els.btnCreateDifficultyCycle) {
    els.btnCreateDifficultyCycle.dataset.value = "normal";
    els.btnCreateDifficultyCycle.querySelectorAll('.mc-btn-group-item').forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        els.btnCreateDifficultyCycle.dataset.value = val;
        els.btnCreateDifficultyCycle.querySelectorAll('.mc-btn-group-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        els.createDifficultyDesc.textContent = difficultyDescs[val];
      });
    });
  }

  if (els.createHardcore) {
    els.createHardcore.addEventListener("change", () => {
      if (els.createHardcore.checked) {
        els.btnCreateDifficultyCycle.dataset.value = "hard";
        els.btnCreateDifficultyCycle.querySelectorAll('.mc-btn-group-item').forEach(b => {
          b.classList.toggle('active', b.dataset.value === 'hard');
          b.disabled = true;
        });
        els.createDifficultyDesc.textContent = difficultyDescs["hard"];
      } else {
        els.btnCreateDifficultyCycle.querySelectorAll('.mc-btn-group-item').forEach(b => {
          b.disabled = false;
        });
      }
    });
  }
  const groupJarSource = document.querySelector("#group-jar-source");
  if (groupJarSource) {
    groupJarSource.querySelectorAll('.mc-btn-group-item').forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        if (val === "local") {
          els.radioJarSourceLocal.checked = true;
          els.radioJarSourceLocal.dispatchEvent(new Event('change'));
        } else {
          els.radioJarSourceDownload.checked = true;
          els.radioJarSourceDownload.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  if (els.radioJarSourceLocal && els.radioJarSourceDownload) {
    const toggleSource = () => {
      const isLocal = els.radioJarSourceLocal.checked;
      if (groupJarSource) {
        groupJarSource.querySelectorAll('.mc-btn-group-item').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === (isLocal ? 'local' : 'download'));
        });
      }
      els.sectionJarLocal.hidden = !isLocal;
      els.sectionJarDownload.hidden = isLocal;
      updateControls();
      if (!isLocal && els.selectDownloadVersion.options.length <= 1) {
        loadDownloadVersions();
      }
    };
    els.radioJarSourceLocal.addEventListener("change", toggleSource);
    els.radioJarSourceDownload.addEventListener("change", toggleSource);
  }

  const swDescs = {
    vanilla: "Software oficial de Mojang. Ideal para juego base sin modificaciones.",
    paper: "Papermc optimizado. Soporta plugins de Bukkit/Spigot.",
    purpur: "Bifurcación de Paper de alto rendimiento con más de 250 opciones de optimización.",
    fabric: "Cargador de mods rápido y ligero. Ideal para servidores modded modernos."
  };

  if (els.btnCreateSoftwareCycle) {
    els.btnCreateSoftwareCycle.dataset.value = "vanilla";
    els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item').forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        els.btnCreateSoftwareCycle.dataset.value = val;
        els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const descEl = document.querySelector("#create-software-desc");
        if (descEl) descEl.textContent = swDescs[val];
        
        loadDownloadVersions();
      });
    });
  }

  if (els.selectDownloadVersion) {
    els.selectDownloadVersion.addEventListener("change", updateControls);
  }

  async function loadDownloadVersions() {
    els.selectDownloadVersion.innerHTML = '<option value="">Cargando...</option>';
    els.selectDownloadVersion.disabled = true;
    els.downloadStatusHint.textContent = "Obteniendo versiones desde la red...";

    const type = els.btnCreateSoftwareCycle.dataset.value;
    try {
      if (type === "paper") {
        const res = await fetch("https://fill.papermc.io/v3/projects/paper");
        const data = await res.json();
        const versions = Object.values(data.versions).flat();

        els.selectDownloadVersion.innerHTML = "";
        versions.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v;
          els.selectDownloadVersion.appendChild(opt);
        });
        els.downloadStatusHint.textContent = "Versiones de Paper obtenidas correctamente.";
      } else if (type === "vanilla") {
        const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
        const data = await res.json();
        globals.cachedVanillaVersions = data.versions;
        const versions = data.versions.filter(v => v.type === "release");

        els.selectDownloadVersion.innerHTML = "";
        versions.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v.id;
          opt.textContent = v.id;
          els.selectDownloadVersion.appendChild(opt);
        });
        els.downloadStatusHint.textContent = "Versiones de Vanilla obtenidas correctamente.";
      } else if (type === "purpur") {
        const res = await fetch("https://api.purpurmc.org/v2/purpur");
        const data = await res.json();
        const versions = [...data.versions].reverse();

        els.selectDownloadVersion.innerHTML = "";
        versions.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v;
          els.selectDownloadVersion.appendChild(opt);
        });
        els.downloadStatusHint.textContent = "Versiones de Purpur obtenidas correctamente.";
      } else if (type === "fabric") {
        const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
        const data = await res.json();
        globals.cachedVanillaVersions = data.versions;
        const versions = data.versions.filter(v => v.type === "release");

        els.selectDownloadVersion.innerHTML = "";
        versions.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v.id;
          opt.textContent = v.id;
          els.selectDownloadVersion.appendChild(opt);
        });
        els.downloadStatusHint.textContent = "Versiones de Fabric obtenidas correctamente.";
      }
      els.selectDownloadVersion.disabled = false;
    } catch (err) {
      els.selectDownloadVersion.innerHTML = '<option value="">Error</option>';
      els.downloadStatusHint.textContent = "Error al obtener versiones: " + err;
    }
    updateControls();
  }

  // Config Page File Source Selection
  const groupControlJarSource = document.querySelector("#group-control-jar-source");
  if (groupControlJarSource) {
    groupControlJarSource.querySelectorAll('.mc-btn-group-item').forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.value;
        if (val === "local") {
          els.controlSourceLocal.checked = true;
          els.controlSourceLocal.dispatchEvent(new Event('change'));
        } else {
          els.controlSourceDownload.checked = true;
          els.controlSourceDownload.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  // Config Page File Source Selection
  if (els.controlSourceLocal && els.controlSourceDownload) {
    const syncControlVisual = () => {
      const isLocal = els.controlSourceLocal.checked;
      if (groupControlJarSource) {
        groupControlJarSource.querySelectorAll('.mc-btn-group-item').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === (isLocal ? 'local' : 'download'));
        });
      }
      if (isLocal) {
        els.controlLocalContainer.style.display = "flex";
        els.controlDownloadContainer.style.display = "none";
      } else {
        els.controlLocalContainer.style.display = "none";
        els.controlDownloadContainer.style.display = "block";
        loadControlDownloadVersions();
      }
    };
    els.controlSourceLocal.addEventListener("change", syncControlVisual);
    els.controlSourceDownload.addEventListener("change", syncControlVisual);
  }
  
  if (els.controlEngineSelect) {
    els.controlEngineSelect.addEventListener("change", loadControlDownloadVersions);
  }

  async function loadControlDownloadVersions() {
    if (!els.controlVersionSelect) return;
    
    els.controlVersionSelect.innerHTML = '<option value="">Cargando versiones...</option>';
    els.controlVersionSelect.disabled = true;

    const type = els.controlEngineSelect.value;
    try {
      if (type === "paper") {
        const res = await fetch("https://fill.papermc.io/v3/projects/paper");
        const data = await res.json();
        const versions = Object.values(data.versions).flat();
        els.controlVersionSelect.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join("");
      } else if (type === "vanilla" || type === "fabric") {
        const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
        const data = await res.json();
        globals.cachedVanillaVersions = data.versions;
        const versions = data.versions.filter(v => v.type === "release");
        els.controlVersionSelect.innerHTML = versions.map(v => `<option value="${v.id}">${v.id}</option>`).join("");
      } else if (type === "purpur") {
        const res = await fetch("https://api.purpurmc.org/v2/purpur");
        const data = await res.json();
        const versions = [...data.versions].reverse();
        els.controlVersionSelect.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join("");
      }
      els.controlVersionSelect.disabled = false;
    } catch (e) {
      els.controlVersionSelect.innerHTML = '<option value="">Error al cargar</option>';
      console.error(e);
    }
  }

  if (els.btnHomeOpenExisting) {
    els.btnHomeOpenExisting.addEventListener("click", async () => {
      try {
        await openExistingServer();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnHomeOpenLast) {
    els.btnHomeOpenLast.addEventListener("click", () => {
      if (!appState.activeSession) {
        return;
      }

      navigateTo("control");
      showFeedback(
        `Abriendo el último servidor guardado: ${appState.activeSession.server_name}.`,
        "info",
      );
    });
  }

  if (els.btnCreateBack) {
    els.btnCreateBack.addEventListener("click", () => {
      if (els.btnCreateBack.disabled) {
        return;
      }

      appState.pendingCreateFlow = false;
      navigateTo("home");
      showFeedback("Selecciona una opción para continuar.", "info");
    });
  }

  if (els.btnSelectServerJar) {
    els.btnSelectServerJar.addEventListener("click", async () => {
      try {
        await browseServerJar();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnSelectServerParentDir) {
    els.btnSelectServerParentDir.addEventListener("click", async () => {
      try {
        await browseServerParentDir();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnCreateServer) {
    els.btnCreateServer.addEventListener("click", async () => {
      try {
        await createServer();
      } catch (error) {
        appState.pendingCreateFlow = false;
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnControlBack) {
    els.btnControlBack.addEventListener("click", () => {
      if (els.btnControlBack.disabled) {
        return;
      }

      navigateTo("home");
      showFeedback("Volviste a la pantalla principal.", "info");
    });
  }

  if (els.btnToggleConfigPanel) {
    els.btnToggleConfigPanel.addEventListener("click", () => {
      if (appState.status === "starting" || appState.status === "running") {
        return;
      }
      navigateTo("config");
    });
  }

  if (els.btnConfigBack) {
    els.btnConfigBack.addEventListener("click", () => {
      navigateTo("control");
    });
  }

  if (els.btnControlStart) {
    els.btnControlStart.addEventListener("click", async () => {
      try {
        await startCurrentServer();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnControlStop) {
    els.btnControlStop.addEventListener("click", async () => {
      try {
        await stopServer();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnControlOpenFolder) {
    els.btnControlOpenFolder.addEventListener("click", async () => {
      try {
        await invoke("abrir_carpeta_servidor");
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnControlDeleteServer) {
    els.btnControlDeleteServer.addEventListener("click", () => {
      const server = appState.activeSession;
      if (!server) return;
      requestConfirm(
        "Borrar Servidor",
        `¿Estás seguro de que quieres borrar el servidor "${server.server_name}"?\n\nLa carpeta del servidor y todos sus mundos se moverán a la papelera.`,
        async () => {
          try {
            showFeedback("Borrando servidor (moviendo a papelera)...", "info");
            const snapshot = await invoke("remover_servidor_guardado", { serverDir: server.server_dir, deleteFiles: true });
            
            appState.activeSession = null;
            navigateTo("home");
            
            applySnapshot(snapshot);
            showFeedback("El servidor ha sido movido a la papelera.", "success");
          } catch (e) {
            showFeedback(`Error al borrar: ${e}`, "error");
          }
        }
      );
    });
  }

  if (els.btnControlEula) {
    els.btnControlEula.addEventListener("click", async () => {
      await loadAndShowEula();
    });
  }

  if (els.checkboxAcceptEula) {
    els.checkboxAcceptEula.addEventListener("change", () => {
      if (els.btnEulaAcceptContinue) {
        els.btnEulaAcceptContinue.disabled = !els.checkboxAcceptEula.checked;
      }
    });
  }

  if (els.btnEulaAcceptContinue) {
    els.btnEulaAcceptContinue.addEventListener("click", async () => {
      await acceptEulaAndRestart();
    });
  }

  if (els.btnEulaCancel) {
    els.btnEulaCancel.addEventListener("click", () => {
      navigateTo("control");
    });
  }

  if (els.btnControlSelectJar) {
    els.btnControlSelectJar.addEventListener("click", async () => {
      try {
        await browseServerJar("control");
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnControlSaveConfig) {
    els.btnControlSaveConfig.addEventListener("click", async () => {
      try {
        await saveServerConfig();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.btnSendCommand) {
    els.btnSendCommand.addEventListener("click", async () => {
      try {
        await sendCommand();
      } catch (error) {
        const message = normalizeError(error);
        showFeedback(message, "error");
        appendLog("stderr", message);
      }
    });
  }

  if (els.inputCommand) {
    els.inputCommand.addEventListener("keydown", async (event) => {
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
  }

  if (els.serverName) els.serverName.addEventListener("input", updateControls);
  if (els.javaVersion) els.javaVersion.addEventListener("change", updateControls);
  if (els.memoryGb) els.memoryGb.addEventListener("input", updateControls);
  if (els.controlServerName) els.controlServerName.addEventListener("input", () => { });
  if (els.controlJavaVersion) els.controlJavaVersion.addEventListener("change", () => { });
  if (els.controlMemoryGb) els.controlMemoryGb.addEventListener("input", () => { });

  if (els.btnOpenProperties) {
    els.btnOpenProperties.addEventListener("click", async () => {
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

  if (els.btnPropertiesSave) {
    els.btnPropertiesSave.addEventListener("click", async () => {
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

  if (els.btnPropertiesBack) {
    els.btnPropertiesBack.addEventListener("click", () => {
      navigateTo("control");
    });
  }

  const refreshExtensionsList = () => {
    if (activeSubTab === "installed") {
      loadInstalledExtensions();
    } else {
      searchModrinth(els.inputSearchExtension.value);
    }
  };

  const selectCategoryTab = (activeButton) => {
    const buttons = [els.tabCategoryPlugins, els.tabCategoryMods, els.tabCategoryDatapacks];
    buttons.forEach(btn => {
      if (!btn) return;
      if (btn === activeButton) {
        btn.classList.add("active");
        btn.classList.remove("secondary");
      } else {
        btn.classList.remove("active");
        btn.classList.add("secondary");
      }
    });
  };

  const selectSubTab = (activeButton) => {
    const buttons = [els.tabViewInstalled, els.tabViewSearch];
    buttons.forEach(btn => {
      if (!btn) return;
      if (btn === activeButton) {
        btn.classList.add("active");
        btn.classList.remove("secondary");
      } else {
        btn.classList.remove("active");
        btn.classList.add("secondary");
      }
    });
  };

  if (els.btnOpenExtensions) {
    els.btnOpenExtensions.addEventListener("click", async () => {
      navigateTo("extensions");
      await initExtensionsPage();
    });
  }

  if (els.btnExtensionsBack) {
    els.btnExtensionsBack.addEventListener("click", () => {
      navigateTo("control");
      showFeedback("Panel de control del servidor.", "info");
    });
  }

  if (els.tabCategoryPlugins) {
    els.tabCategoryPlugins.addEventListener("click", () => {
      setActiveCategory("plugin");
      selectCategoryTab(els.tabCategoryPlugins);
      refreshExtensionsList();
    });
  }

  if (els.tabCategoryMods) {
    els.tabCategoryMods.addEventListener("click", () => {
      setActiveCategory("mod");
      selectCategoryTab(els.tabCategoryMods);
      refreshExtensionsList();
    });
  }

  if (els.tabCategoryDatapacks) {
    els.tabCategoryDatapacks.addEventListener("click", () => {
      setActiveCategory("datapack");
      selectCategoryTab(els.tabCategoryDatapacks);
      refreshExtensionsList();
    });
  }

  if (els.tabViewInstalled) {
    els.tabViewInstalled.addEventListener("click", () => {
      setActiveSubTab("installed");
      selectSubTab(els.tabViewInstalled);
      if (els.sectionInstalledExtensions) els.sectionInstalledExtensions.hidden = false;
      if (els.sectionSearchExtensions) els.sectionSearchExtensions.hidden = true;
      loadInstalledExtensions();
    });
  }

  if (els.tabViewSearch) {
    els.tabViewSearch.addEventListener("click", () => {
      setActiveSubTab("search");
      selectSubTab(els.tabViewSearch);
      if (els.sectionInstalledExtensions) els.sectionInstalledExtensions.hidden = true;
      if (els.sectionSearchExtensions) els.sectionSearchExtensions.hidden = false;
      searchModrinth(els.inputSearchExtension.value);
    });
  }

  if (els.btnSearchExtension) {
    els.btnSearchExtension.addEventListener("click", () => {
      searchModrinth(els.inputSearchExtension.value);
    });
  }

  if (els.inputSearchExtension) {
    els.inputSearchExtension.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchModrinth(els.inputSearchExtension.value);
      }
    });
  }

  if (els.btnExtDialogClose) {
    els.btnExtDialogClose.addEventListener("click", () => {
      els.extensionVersionsDialog.close();
    });
  }

  if (els.btnExtPreviewClose) {
    els.btnExtPreviewClose.addEventListener("click", () => {
      els.extensionPreviewDialog.close();
    });
  }

  if (els.tabPreviewDesc && els.tabPreviewVersions) {
    const setPreviewTab = (tab) => {
      els.tabPreviewDesc.classList.toggle("active", tab === "desc");
      els.tabPreviewVersions.classList.toggle("active", tab === "versions");
      els.panelPreviewDesc.hidden = tab !== "desc";
      els.panelPreviewVersions.hidden = tab !== "versions";
    };
    els.tabPreviewDesc.addEventListener("click", () => setPreviewTab("desc"));
    els.tabPreviewVersions.addEventListener("click", () => setPreviewTab("versions"));
  }

  if (els.selectSearchProvider) {
    els.selectSearchProvider.addEventListener("change", () => {
      searchModrinth(els.inputSearchExtension.value);
    });
  }

  // EVENTOS DE COPIAS DE SEGURIDAD Y TAREAS

  const selectAdminTab = (activeButton) => {
    const buttons = [els.tabBackupsList, els.tabTasksList];
    buttons.forEach(btn => {
      if (!btn) return;
      if (btn === activeButton) {
        btn.classList.add("active");
        btn.classList.remove("secondary");
      } else {
        btn.classList.remove("active");
        btn.classList.add("secondary");
      }
    });
  };

  if (els.btnOpenBackups) {
    els.btnOpenBackups.addEventListener("click", async () => {
      navigateTo("backups");
      setActiveAdminTab("backups");
      selectAdminTab(els.tabBackupsList);
      
      if (els.sectionBackupsList) els.sectionBackupsList.hidden = false;
      if (els.sectionTasksList) els.sectionTasksList.hidden = true;

      await loadBackupsList();
      await loadTasksList();
    });
  }

  if (els.btnBackupsBack) {
    els.btnBackupsBack.addEventListener("click", () => {
      navigateTo("control");
    });
  }

  if (els.tabBackupsList) {
    els.tabBackupsList.addEventListener("click", () => {
      setActiveAdminTab("backups");
      selectAdminTab(els.tabBackupsList);
      if (els.sectionBackupsList) els.sectionBackupsList.hidden = false;
      if (els.sectionTasksList) els.sectionTasksList.hidden = true;
      loadBackupsList();
    });
  }

  if (els.tabTasksList) {
    els.tabTasksList.addEventListener("click", () => {
      setActiveAdminTab("tasks");
      selectAdminTab(els.tabTasksList);
      if (els.sectionBackupsList) els.sectionBackupsList.hidden = true;
      if (els.sectionTasksList) els.sectionTasksList.hidden = false;
      loadTasksList();
    });
  }

  if (els.btnCreateBackup) {
    els.btnCreateBackup.addEventListener("click", () => {
      createFullBackup();
    });
  }

  if (els.btnOpenNewTaskModal) {
    els.btnOpenNewTaskModal.addEventListener("click", () => {
      els.newTaskDialog.showModal();
    });
  }

  if (els.btnNewTaskClose) {
    els.btnNewTaskClose.addEventListener("click", () => {
      els.newTaskDialog.close();
    });
  }

  if (els.btnNewTaskSave) {
    els.btnNewTaskSave.addEventListener("click", () => {
      addNewTask();
    });
  }

  if (els.taskType) {
    els.taskType.addEventListener("change", () => {
      if (els.groupTaskCommand) els.groupTaskCommand.hidden = els.taskType.value !== "command";
    });
  }

  if (els.taskTrigger) {
    els.taskTrigger.addEventListener("change", () => {
      if (els.groupTaskInterval) els.groupTaskInterval.hidden = els.taskTrigger.value !== "interval";
      if (els.groupTaskTime) els.groupTaskTime.hidden = els.taskTrigger.value !== "daily";
    });
  }

  // Iniciar el programador de tareas
  startScheduler();
  } catch (e) {
    console.error(e);
    alert("Error en setupEvents: " + e.stack);
  }
}

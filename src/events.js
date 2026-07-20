import { invoke, listen, open, fetchForgeVersions, fetchNeoForgeVersions } from "./api.js";
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
  const setupButtonGroup = (container) => {
    if (!container) return;
    const buttons = container.querySelectorAll('.mc-btn-group-item');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        container.dataset.value = btn.dataset.value;
        container.dispatchEvent(new Event('change'));
      });
    });
  };

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

  if (els.btnCreateJavaCycle && els.javaVersion) {
    els.btnCreateJavaCycle.addEventListener("click", () => {
      const select = els.javaVersion;
      if (select.options.length <= 1) return;
      let nextIndex = select.selectedIndex + 1;
      if (nextIndex >= select.options.length) {
        nextIndex = 0;
      }
      select.selectedIndex = nextIndex;
      select.dispatchEvent(new Event("change"));
      
      const activeOption = select.options[select.selectedIndex];
      if (activeOption) {
        els.btnCreateJavaCycle.textContent = activeOption.textContent;
      }
    });
  }

  if (els.btnHomeExit) {
    els.btnHomeExit.addEventListener("click", () => {
      invoke("salir_aplicacion");
    });
  }

  if (els.btnHomeOpenDir) {
    els.btnHomeOpenDir.addEventListener("click", () => {
      const dir = els.btnHomeOpenDir.dataset.serverDir;
      if (dir) {
        invoke("abrir_carpeta_por_ruta", { ruta: dir }).catch((e) =>
          showFeedback("No se pudo abrir el directorio: " + e, "error"),
        );
      }
    });
  }
  if (els.btnTabCreateGame && els.btnTabCreateServer && els.btnTabCreateModpacks) {
    const setCreateTab = (tab) => {
      els.btnTabCreateGame.classList.toggle("active", tab === "game");
      els.btnTabCreateServer.classList.toggle("active", tab === "server");
      els.btnTabCreateModpacks.classList.toggle("active", tab === "modpacks");
      
      els.tabCreateGameContent.hidden = tab !== "game";
      els.tabCreateServerContent.hidden = tab !== "server";
      els.tabCreateModpacksContent.hidden = tab !== "modpacks";
    };
    els.btnTabCreateGame.addEventListener("click", () => setCreateTab("game"));
    els.btnTabCreateServer.addEventListener("click", () => setCreateTab("server"));
    els.btnTabCreateModpacks.addEventListener("click", () => setCreateTab("modpacks"));
  }

  // Evento Hardcore Mode Thumbnail
  if (els.createHardcore && els.createWorldPreview) {
    els.createHardcore.addEventListener("change", (e) => {
      if (e.target.checked) {
        els.createWorldPreview.classList.add("hardcore-mode");
      } else {
        els.createWorldPreview.classList.remove("hardcore-mode");
      }
    });
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
    fabric: "Cargador de mods rápido y ligero. Ideal para servidores modded modernos.",
    forge: "El cargador de mods clásico y robusto para grandes Modpacks.",
    neoforge: "Bifurcación moderna de Forge con actualizaciones más rápidas e innovadoras."
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
      } else if (type === "forge") {
        const versions = await fetchForgeVersions();
        globals.cachedForgeVersions = versions;
        els.selectDownloadVersion.innerHTML = "";
        versions.forEach(v => {
          const opt = document.createElement("option");
          opt.value = `${v.mcVersion}|${v.forgeVersion}`;
          opt.textContent = `${v.mcVersion} (${v.forgeVersion})`;
          els.selectDownloadVersion.appendChild(opt);
        });
        els.downloadStatusHint.textContent = "Versiones de Forge obtenidas correctamente.";
      } else if (type === "neoforge") {
        const versions = await fetchNeoForgeVersions();
        globals.cachedNeoForgeVersions = versions;
        els.selectDownloadVersion.innerHTML = "";
        versions.forEach(v => {
          const opt = document.createElement("option");
          opt.value = v.neoVersion;
          opt.textContent = `${v.mcVersion} (${v.neoVersion})`;
          els.selectDownloadVersion.appendChild(opt);
        });
        els.downloadStatusHint.textContent = "Versiones de NeoForge obtenidas correctamente.";
      }

      // Filtrar versiones si hay un modpack seleccionado
      if (appState.selectedModpackId && appState.modpackGameVersions) {
        const options = Array.from(els.selectDownloadVersion.options);
        const originalCount = options.length;
        
        let removedCount = 0;
        options.forEach(opt => {
          let mcVer = opt.value;
          if (type === "forge") mcVer = opt.value.split('|')[0];
          
          if (!appState.modpackGameVersions.includes(mcVer) && opt.value !== "") {
            els.selectDownloadVersion.removeChild(opt);
            removedCount++;
          }
        });
        
        if (removedCount > 0 && removedCount < originalCount) {
          els.downloadStatusHint.textContent += ` (Filtrado para el modpack seleccionado)`;
        }
      }

      els.selectDownloadVersion.disabled = false;
      
      if (!els.selectDownloadVersion.value && els.selectDownloadVersion.options.length > 0) {
          els.selectDownloadVersion.selectedIndex = 0;
      }
      
    } catch (err) {
      els.selectDownloadVersion.innerHTML = '<option value="">Error al cargar</option>';
      els.downloadStatusHint.textContent = `Error: ${err.message || err}`;
    }
    updateControls();
  }

  // Max Players Increment/Decrement
  const maxPlayersInput = document.getElementById("create-max-players");
  const maxPlayersInc = document.getElementById("btn-create-max-players-inc");
  const maxPlayersDec = document.getElementById("btn-create-max-players-dec");
  if (maxPlayersInput && maxPlayersInc && maxPlayersDec) {
    maxPlayersInc.addEventListener("click", () => {
      maxPlayersInput.value = parseInt(maxPlayersInput.value || 0) + 1;
    });
    maxPlayersDec.addEventListener("click", () => {
      maxPlayersInput.value = Math.max(1, parseInt(maxPlayersInput.value || 0) - 1);
    });
  }

  // RAM Increment/Decrement
  const ramInput = document.getElementById("memory-gb");
  const ramInc = document.getElementById("btn-memory-gb-inc");
  const ramDec = document.getElementById("btn-memory-gb-dec");
  if (ramInput && ramInc && ramDec) {
    ramInc.addEventListener("click", () => {
      ramInput.value = parseInt(ramInput.value || 0) + 1;
    });
    ramDec.addEventListener("click", () => {
      ramInput.value = Math.max(1, parseInt(ramInput.value || 0) - 1);
    });
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

  // Eventos de Modpacks
  if (els.groupModpackSource) {
    setupButtonGroup(els.groupModpackSource);
    els.groupModpackSource.addEventListener("click", (e) => {
      const btn = e.target.closest(".mc-btn-group-item");
      if (btn) {
        const val = btn.dataset.value;
        if (val === "download") {
          if (els.sectionModpackDownloadLeft) els.sectionModpackDownloadLeft.style.display = "flex";
          if (els.sectionModpackLocalPreviewRight) els.sectionModpackLocalPreviewRight.style.display = "none";
          if (els.sectionModpackLocalLeft) els.sectionModpackLocalLeft.style.display = "none";
          if (els.createModpackSelectedInfo) {
            els.createModpackSelectedInfo.style.display = "flex";
          }
        } else {
          if (els.sectionModpackDownloadLeft) els.sectionModpackDownloadLeft.style.display = "none";
          if (els.sectionModpackLocalPreviewRight) els.sectionModpackLocalPreviewRight.style.display = "flex";
          if (els.sectionModpackLocalLeft) els.sectionModpackLocalLeft.style.display = "flex";
          if (els.createModpackSelectedInfo) els.createModpackSelectedInfo.style.display = "none";
        }
      }
    });
  }

  let modpackHits = [];
  let currentModpackPage = 0;
  const MODPACKS_PER_PAGE = 6;

  const renderModpackPage = () => {
    if (!els.createModpackSearchResults) return;
    els.createModpackSearchResults.innerHTML = "";
    
    if (modpackHits.length === 0) {
      els.createModpackSearchResults.innerHTML = '<p class="hint" style="grid-column: span 3; text-align: center;">No se encontraron modpacks.</p>';
      if (els.labelModpackPage) els.labelModpackPage.textContent = `Página 1`;
      return;
    }
    
    const totalPages = Math.ceil(modpackHits.length / MODPACKS_PER_PAGE);
    if (currentModpackPage >= totalPages) currentModpackPage = totalPages - 1;
    if (currentModpackPage < 0) currentModpackPage = 0;
    
    if (els.labelModpackPage) els.labelModpackPage.textContent = `Página ${currentModpackPage + 1} de ${totalPages}`;
    
    const start = currentModpackPage * MODPACKS_PER_PAGE;
    const pageHits = modpackHits.slice(start, start + MODPACKS_PER_PAGE);
    
    pageHits.forEach(modpack => {
      const div = document.createElement("div");
      div.className = "extension-card";
      div.innerHTML = `
        ${modpack.icon_url ? `<img src="${modpack.icon_url}" style="width: 64px; height: 64px; image-rendering: pixelated; border-radius: 4px; box-shadow: 0 4px 0 #111; flex-shrink: 0;" />` : `<div style="width: 64px; height: 64px; background: rgba(0,0,0,0.6); border-radius: 4px; box-shadow: 0 4px 0 #111; flex-shrink: 0;"></div>`}
        <div style="font-weight: bold; font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${modpack.title}</div>
      `;
      div.addEventListener("click", () => selectModpack(modpack, div));
      
      // Restaurar estado si ya estaba seleccionado
      if (appState.selectedModpackId === modpack.project_id) {
        div.style.border = "2px solid var(--mc-green)";
      }
      
      els.createModpackSearchResults.appendChild(div);
    });
  };

  if (els.btnModpackPagePrev) {
    els.btnModpackPagePrev.addEventListener("click", () => {
      if (currentModpackPage > 0) {
        currentModpackPage--;
        renderModpackPage();
      }
    });
  }
  if (els.btnModpackPageNext) {
    els.btnModpackPageNext.addEventListener("click", () => {
      const totalPages = Math.ceil(modpackHits.length / MODPACKS_PER_PAGE);
      if (currentModpackPage < totalPages - 1) {
        currentModpackPage++;
        renderModpackPage();
      }
    });
  }

  if (els.btnCreateModpackDoSearch) {
    const doSearch = async () => {
      const query = els.inputCreateModpackSearch ? els.inputCreateModpackSearch.value.trim() : "";
      
      els.createModpackSearchResults.innerHTML = '<p class="hint" style="grid-column: span 3; text-align: center; margin: 16px 0;">Buscando en Modrinth...</p>';
      
      try {
        const limit = 30; // 5 páginas de 6
        const queryPart = query ? `query=${encodeURIComponent(query)}&` : '';
        const indexPart = query ? `index=relevance` : `index=downloads`;
        const url = `https://api.modrinth.com/v2/search?${queryPart}facets=[["project_type:modpack"]]&limit=${limit}&${indexPart}`;
        const response = await fetch(url, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } });
        const data = await response.json();
        
        modpackHits = data.hits || [];
        currentModpackPage = 0;
        renderModpackPage();
      } catch (err) {
        els.createModpackSearchResults.innerHTML = `<p class="hint" style="grid-column: span 3; color: var(--error);">Error al buscar modpacks: ${err}</p>`;
      }
    };
    
    els.btnCreateModpackDoSearch.addEventListener("click", doSearch);
    if (els.inputCreateModpackSearch) {
      els.inputCreateModpackSearch.addEventListener("keyup", (e) => {
        if (e.key === "Enter") doSearch();
      });
    }
    
    if (els.btnTabCreateModpacks) {
      els.btnTabCreateModpacks.addEventListener("click", () => {
        // Si no hay modpacks cargados (solo está el texto de ayuda o está vacío), cargar los populares
        if (modpackHits.length === 0) {
          doSearch();
        }
      });
    }
  }

  let modpackConfirmed = false;

  const updateModpackUIState = () => {
      const hasFinalSelection = (appState.selectedModpackId && modpackConfirmed) || appState.localZipModpackPath;
      if (els.stateModpackExplore) {
          els.stateModpackExplore.style.display = hasFinalSelection ? "none" : "flex"; // Grid es roto por Flex
          if (!hasFinalSelection) els.stateModpackExplore.className = "grid-form two-cols";
      }
      if (els.stateModpackSelected) {
          els.stateModpackSelected.style.display = hasFinalSelection ? "flex" : "none";
      }
  };

  const clearModpackSelection = () => {
      appState.selectedModpackId = null;
      appState.modpackLoaders = null;
      appState.modpackGameVersions = null;
      appState.mrpackToInstall = null;
      appState.localZipModpackPath = null;
      appState.modpackGallery = [];
      appState.galleryIndex = -1;
      modpackConfirmed = false;
      
      if (els.createModpackLocalPath) els.createModpackLocalPath.value = "";
      
      // Resetear panel derecho de exploración
      if (els.createModpackTitle) els.createModpackTitle.textContent = "Ningún modpack seleccionado";
      if (els.createModpackAuthor) els.createModpackAuthor.style.display = "none";
      if (els.createModpackDesc) {
        els.createModpackDesc.textContent = "Selecciona un modpack de la lista para continuar.";
        els.createModpackDesc.style.display = "block";
      }
      
      if (els.createModpackGalleryImgWrapper) els.createModpackGalleryImgWrapper.style.display = "none";
      if (els.createModpackGalleryImg) els.createModpackGalleryImg.style.display = "none";
      if (els.createModpackGalleryTitle) els.createModpackGalleryTitle.style.display = "none";
      if (els.createModpackGalleryLine) els.createModpackGalleryLine.style.display = "none";
      if (els.createModpackGalleryControls) els.createModpackGalleryControls.style.display = "none";
      
      if (els.btnCreateModpackDownload) {
        els.btnCreateModpackDownload.disabled = true;
        els.btnCreateModpackDownload.style.opacity = "0.5";
      }
      
      // Limpiar bordes verdes de la cuadrícula
      if (els.createModpackSearchResults) {
        els.createModpackSearchResults.querySelectorAll('.extension-card').forEach(card => {
          card.style.border = "";
        });
      }
      
      if (els.btnCreateSoftwareCycle) {
          els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item').forEach(b => {
              b.disabled = false;
              b.style.opacity = "1";
          });
          els.btnCreateSoftwareCycle.dispatchEvent(new Event('change'));
      }
      
      updateModpackUIState();
  };

  if (els.btnCreateModpackClearFinal) {
      els.btnCreateModpackClearFinal.addEventListener("click", clearModpackSelection);
  }
  
  if (els.btnCreateModpackConfirm) {
      els.btnCreateModpackConfirm.addEventListener("click", () => {
          if (els.btnTabCreateServer) els.btnTabCreateServer.click();
      });
  }

  // Alerta temporal para guardar la información del modpack antes de confirmar
  let currentModpackData = null;

  if (els.btnCreateModpackDownload) {
      els.btnCreateModpackDownload.addEventListener("click", () => {
          if (!currentModpackData) return;
          
          modpackConfirmed = true;
          if (els.modpackSelectedTitleFinal) els.modpackSelectedTitleFinal.textContent = currentModpackData.title;
          if (els.modpackSelectedTitleLeft) els.modpackSelectedTitleLeft.textContent = currentModpackData.title;
          const authorName = currentModpackData.author || currentModpackData.publisher || "Desconocido";
          if (els.modpackSelectedAuthorLeft) {
              els.modpackSelectedAuthorLeft.textContent = `Creado por: ${authorName}`;
          }
          if (els.modpackSelectedAuthorFinal) {
              els.modpackSelectedAuthorFinal.textContent = `Creado por: ${authorName}`;
          }
          if (els.modpackSelectedSourceLabel) els.modpackSelectedSourceLabel.textContent = "Origen: Modrinth";
          if (els.modpackSelectedDescFinal) els.modpackSelectedDescFinal.textContent = `Soportado en: ${appState.modpackLoaders ? appState.modpackLoaders.join(', ') : 'Desconocido'}.\nPulsa "Configurar" para continuar.`;
          
          if (els.modpackSelectedThumbnailFinal) {
              if (currentModpackData.icon_url) {
                  els.modpackSelectedThumbnailFinal.style.backgroundImage = `url('${currentModpackData.icon_url}')`;
              } else {
                  els.modpackSelectedThumbnailFinal.style.backgroundImage = "none";
              }
          }
          
          updateModpackUIState();
      });
  }

  const selectModpack = async (modpack, div) => {
    appState.selectedModpackId = modpack.project_id;
    currentModpackData = modpack;
    
    // UI del Grid
    if (els.createModpackSearchResults) {
      els.createModpackSearchResults.querySelectorAll('.extension-card').forEach(card => {
        card.style.border = "";
      });
    }
    if (div) {
      div.style.border = "2px solid var(--mc-green)";
    }
    
    // UI del Panel Derecho de Exploración
    if (els.createModpackTitle) els.createModpackTitle.textContent = modpack.title;
    if (els.createModpackAuthor) {
      const author = modpack.author || modpack.publisher || "";
      if (author) {
        els.createModpackAuthor.textContent = `Creado por: ${author}`;
        els.createModpackAuthor.style.display = "block";
      } else {
        els.createModpackAuthor.style.display = "none";
      }
    }
    if (els.createModpackDesc) {
      els.createModpackDesc.textContent = modpack.description || "Sin descripción.";
      els.createModpackDesc.style.display = "block";
    }
    if (els.createModpackGalleryImgWrapper) els.createModpackGalleryImgWrapper.style.display = "none";
    if (els.createModpackGalleryImg) els.createModpackGalleryImg.style.display = "none";
    if (els.createModpackGalleryTitle) els.createModpackGalleryTitle.style.display = "none";
    if (els.createModpackGalleryLine) els.createModpackGalleryLine.style.display = "none";
    if (els.createModpackGalleryControls) els.createModpackGalleryControls.style.display = "none";
    
    appState.modpackGallery = [];
    appState.galleryIndex = -1;
    
    // Desbloquear botón Descargar
    if (els.btnCreateModpackDownload) {
      els.btnCreateModpackDownload.disabled = false;
      els.btnCreateModpackDownload.style.opacity = "1";
    }
    
    try {
        // Leer la galería de imágenes rápida (viene en los resultados de búsqueda de Modrinth como strings)
        if (modpack.gallery && modpack.gallery.length > 0) {
            appState.modpackGallery = modpack.gallery.map((img, idx) => {
                if (typeof img === 'string') return { url: img, title: "Imagen " + (idx + 1) };
                return { url: img.url, title: img.title || "Imagen " + (idx + 1) };
            }).filter(img => img.url);
            if (appState.modpackGallery.length > 0 && els.createModpackGalleryControls) {
                els.createModpackGalleryControls.style.display = "flex";
                updateGalleryUI();
            }
        }

        const [projRes, versionsRes] = await Promise.all([
            fetch(`https://api.modrinth.com/v2/project/${modpack.project_id}`, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } }),
            fetch(`https://api.modrinth.com/v2/project/${modpack.project_id}/version`, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } })
        ]);
        
        if (projRes.ok) {
            const projData = await projRes.json();
            if (projData.gallery && projData.gallery.length > 0) {
                appState.modpackGallery = projData.gallery.map((img, idx) => ({
                    url: img.url,
                    title: img.title || "Imagen " + (idx + 1)
                })).filter(img => img.url);
                if (appState.modpackGallery.length > 0 && els.createModpackGalleryControls) {
                    els.createModpackGalleryControls.style.display = "flex";
                    // Solo actualizamos si ya estamos viendo la galería
                    if (appState.galleryIndex !== -1) updateGalleryUI();
                }
            }
        }

        const projVersions = versionsRes.ok ? await versionsRes.json() : [];
        
        let supportedLoaders = new Set();
        let supportedGameVersions = new Set();
        
        projVersions.forEach(v => {
            v.loaders.forEach(l => supportedLoaders.add(l));
            v.game_versions.forEach(gv => supportedGameVersions.add(gv));
        });
        
        appState.modpackLoaders = Array.from(supportedLoaders);
        appState.modpackGameVersions = Array.from(supportedGameVersions);
        
        if (els.btnCreateSoftwareCycle) {
            const buttons = els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item');
            let firstSupported = null;
            buttons.forEach(b => {
                const val = b.dataset.value;
                if (appState.modpackLoaders.includes(val)) {
                    b.disabled = false;
                    b.style.opacity = "1";
                    if (!firstSupported) firstSupported = b;
                } else {
                    b.disabled = true;
                    b.style.opacity = "0.4";
                    b.classList.remove("active");
                }
            });
            
            const currentVal = els.btnCreateSoftwareCycle.dataset.value;
            if (!appState.modpackLoaders.includes(currentVal) && firstSupported) {
                firstSupported.click();
            } else {
                els.btnCreateSoftwareCycle.dispatchEvent(new Event('change'));
            }
        }
    } catch (e) {
        console.error(e);
    }
  };

  const updateGalleryUI = () => {
    if (appState.galleryIndex === -1) {
      if (els.createModpackDesc) els.createModpackDesc.style.display = "block";
      if (els.createModpackGalleryImgWrapper) els.createModpackGalleryImgWrapper.style.display = "none";
      if (els.createModpackGalleryImg) els.createModpackGalleryImg.style.display = "none";
      if (els.createModpackGalleryTitle) els.createModpackGalleryTitle.style.display = "none";
      if (els.createModpackGalleryLine) els.createModpackGalleryLine.style.display = "none";
      if (els.btnGalleryPrev) els.btnGalleryPrev.disabled = true;
    } else {
      if (els.createModpackDesc) els.createModpackDesc.style.display = "none";
      const imgData = appState.modpackGallery[appState.galleryIndex];
      if (els.createModpackGalleryImgWrapper) els.createModpackGalleryImgWrapper.style.display = "block";
      if (els.createModpackGalleryImg) {
        els.createModpackGalleryImg.style.display = "block";
        els.createModpackGalleryImg.src = imgData.url;
      }
      if (els.createModpackGalleryTitle) {
        els.createModpackGalleryTitle.style.display = imgData.title ? "block" : "none";
        els.createModpackGalleryTitle.textContent = imgData.title;
      }
      if (els.createModpackGalleryLine) els.createModpackGalleryLine.style.display = "block";
      if (els.btnGalleryPrev) els.btnGalleryPrev.disabled = false;
    }
    
    if (els.btnGalleryNext) {
      els.btnGalleryNext.disabled = appState.galleryIndex >= appState.modpackGallery.length - 1;
    }
  };

  if (els.btnGalleryPrev) {
    els.btnGalleryPrev.addEventListener("click", () => {
      if (appState.galleryIndex > -1) {
        appState.galleryIndex--;
        updateGalleryUI();
      }
    });
  }

  if (els.btnGalleryNext) {
    els.btnGalleryNext.addEventListener("click", () => {
      if (appState.galleryIndex < appState.modpackGallery.length - 1) {
        appState.galleryIndex++;
        updateGalleryUI();
      }
    });
  }

  if (els.btnCreateModpackSelectLocal) {
    els.btnCreateModpackSelectLocal.addEventListener("click", async () => {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Modpacks', extensions: ['zip', 'mrpack'] }],
        title: "Seleccionar archivo de Modpack",
      });
      if (selected) {
        els.createModpackLocalPath.value = selected;
        
        // Set local thumbnail
        if (els.modpackSelectedThumbnailFinal) {
            els.modpackSelectedThumbnailFinal.style.backgroundImage = "url('assets/world_preview.png')";
        }
        
        const fileName = selected.split(/[\/\\]/).pop();
        if (els.modpackSelectedTitleFinal) els.modpackSelectedTitleFinal.textContent = fileName;
        if (els.modpackSelectedSourceLabel) els.modpackSelectedSourceLabel.textContent = "Origen: Archivo Local";
        
        if (selected.endsWith(".mrpack")) {
          if (els.modpackSelectedDescFinal) els.modpackSelectedDescFinal.textContent = "Modpack local (.mrpack). Extrayendo información...";
          
          try {
            const mrpackIndexRaw = await invoke("parse_mrpack", { path: selected });
            const mrpackIndex = JSON.parse(mrpackIndexRaw);
            
            let supportedLoaders = new Set();
            let supportedGameVersions = new Set();
            
            if (mrpackIndex.dependencies.minecraft) supportedGameVersions.add(mrpackIndex.dependencies.minecraft);
            if (mrpackIndex.dependencies.fabric) supportedLoaders.add("fabric");
            if (mrpackIndex.dependencies["fabric-loader"]) supportedLoaders.add("fabric");
            if (mrpackIndex.dependencies.forge) supportedLoaders.add("forge");
            if (mrpackIndex.dependencies.neoforge) supportedLoaders.add("neoforge");
            
            appState.modpackLoaders = Array.from(supportedLoaders);
            appState.modpackGameVersions = Array.from(supportedGameVersions);
            appState.selectedModpackId = "local_mrpack";
            
            appState.mrpackToInstall = {
              mrpackPath: selected,
              files: mrpackIndex.files
            };
            
            if (els.btnCreateSoftwareCycle) {
              const buttons = els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item');
              let firstSupported = null;
              buttons.forEach(b => {
                const val = b.dataset.value;
                if (appState.modpackLoaders.includes(val)) {
                  b.disabled = false;
                  b.style.opacity = "1";
                  if (!firstSupported) firstSupported = b;
                } else {
                  b.disabled = true;
                  b.style.opacity = "0.4";
                  b.classList.remove("active");
                }
              });
              
              const currentVal = els.btnCreateSoftwareCycle.dataset.value;
              if (!appState.modpackLoaders.includes(currentVal) && firstSupported) {
                firstSupported.click();
              } else {
                els.btnCreateSoftwareCycle.dispatchEvent(new Event('change'));
              }
            }
            
            if (els.modpackSelectedDescFinal) els.modpackSelectedDescFinal.textContent = `Modpack local cargado. Soportado en: ${appState.modpackLoaders.join(', ')}.\nPulsa "Configurar" para continuar.`;
          } catch (e) {
            console.error(e);
            if (els.modpackSelectedDescFinal) els.modpackSelectedDescFinal.textContent = `Error al leer .mrpack: ${e}. Se intentará instalar de todos modos al crear.`;
          }
        } else {
          appState.selectedModpackId = "local_zip";
          appState.modpackLoaders = ["fabric", "forge", "neoforge", "vanilla"]; 
          appState.modpackGameVersions = null; 
          
          appState.mrpackToInstall = null;
          appState.localZipModpackPath = selected; 
          
          if (els.modpackSelectedDescFinal) els.modpackSelectedDescFinal.textContent = "Modpack local (.zip). Se extraerá en el servidor al crear.\nPulsa \"Configurar\" para continuar.";
        }
        
        modpackConfirmed = true;
        updateModpackUIState();
      }
    });
  }

  } catch (e) {
    console.error(e);
    alert("Error en setupEvents: " + e.stack);
  }
}

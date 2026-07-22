import { els } from "../core/dom.js";
import { appState, globals } from "../core/state.js";
import { invoke, open } from "../core/api.js";
import { updateControls, navigateTo, applySnapshot } from "../ui/ui.js";
import { showFeedback, appendLog, normalizeError, requestConfirm } from "../utils/utils.js";
import { startCurrentServer, stopServer, sendCommand, saveServerConfig, acceptEulaAndRestart, loadAndShowEula, openExistingServer, browseServerJar } from "../features/server.js";
import { parsePropertiesContent, renderPropertiesUI, buildPropertiesPayload } from "../features/properties.js";
import { loadAllPlayerLists, addItemToList, handleRemoveOp, handleRemoveWhitelist, handleRemoveBannedPlayer, handleRemoveBannedIp } from "../features/players.js";
import { loadWorlds } from "../features/worlds.js";
import { loadInstalledExtensions, searchModrinth, initExtensionsPage, setActiveCategory, setActiveSubTab, activeSubTab } from "../features/extensions.js";
import { loadBackupsList, loadTasksList, createFullBackup, addNewTask, startScheduler, setActiveAdminTab } from "../features/backups.js";

export function initServerControlEvents() {
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

        if (!selectedPath || Array.isArray(selectedPath)) return;

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
      if (!appState.activeSession) return;
      navigateTo("control");
      showFeedback(`Abriendo el último servidor guardado: ${appState.activeSession.server_name}.`, "info");
    });
  }

  if (els.btnControlBack) {
    els.btnControlBack.addEventListener("click", () => {
      if (els.btnControlBack.disabled) return;
      navigateTo("home");
      showFeedback("Volviste a la pantalla principal.", "info");
    });
  }

  if (els.btnToggleConfigPanel) {
    els.btnToggleConfigPanel.addEventListener("click", () => {
      if (appState.status === "starting" || appState.status === "running") return;
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
      if (event.key !== "Enter") return;
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
    const buttons = [els.tabViewInstalled, els.tabViewDisabled, els.tabViewSearch];
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

  // Pestañas Principales Superiores (Instalados vs Descargar)
  if (els.tabExtInstalled) {
    els.tabExtInstalled.addEventListener("click", () => {
      els.tabExtInstalled.classList.add("active");
      if (els.tabExtDownload) els.tabExtDownload.classList.remove("active");
      if (els.sectionInstalledExtensions) els.sectionInstalledExtensions.hidden = false;
      if (els.sectionSearchExtensions) els.sectionSearchExtensions.hidden = true;
      setActiveSubTab("installed");
      loadInstalledExtensions();
    });
  }

  if (els.tabExtDownload) {
    els.tabExtDownload.addEventListener("click", () => {
      els.tabExtDownload.classList.add("active");
      if (els.tabExtInstalled) els.tabExtInstalled.classList.remove("active");
      if (els.sectionInstalledExtensions) els.sectionInstalledExtensions.hidden = true;
      if (els.sectionSearchExtensions) els.sectionSearchExtensions.hidden = false;
      setActiveSubTab("search");
      const query = els.inputSearchExtension ? els.inputSearchExtension.value : "";
      searchModrinth(query);
    });
  }

  // Proveedores (Modrinth vs CurseForge)
  if (els.btnProviderModrinth) {
    els.btnProviderModrinth.addEventListener("click", () => {
      els.btnProviderModrinth.classList.add("active");
      if (els.btnProviderCurseforge) els.btnProviderCurseforge.classList.remove("active");
      if (els.selectSearchProvider) els.selectSearchProvider.value = "modrinth";
      const query = els.inputSearchExtension ? els.inputSearchExtension.value : "";
      searchModrinth(query);
    });
  }

  if (els.btnProviderCurseforge) {
    els.btnProviderCurseforge.addEventListener("click", () => {
      els.btnProviderCurseforge.classList.add("active");
      if (els.btnProviderModrinth) els.btnProviderModrinth.classList.remove("active");
      if (els.selectSearchProvider) els.selectSearchProvider.value = "curseforge";
      const query = els.inputSearchExtension ? els.inputSearchExtension.value : "";
      searchModrinth(query);
    });
  }

  // Categorías (Mods / Plugins / Datapacks) en Descargar
  if (els.tabCategoryPlugins) {
    els.tabCategoryPlugins.addEventListener("click", () => {
      setActiveCategory("plugin");
      [els.tabCategoryPlugins, els.tabCategoryMods, els.tabCategoryDatapacks].forEach(b => b && b.classList.remove("active"));
      els.tabCategoryPlugins.classList.add("active");
      refreshExtensionsList();
    });
  }

  if (els.tabCategoryMods) {
    els.tabCategoryMods.addEventListener("click", () => {
      setActiveCategory("mod");
      [els.tabCategoryPlugins, els.tabCategoryMods, els.tabCategoryDatapacks].forEach(b => b && b.classList.remove("active"));
      els.tabCategoryMods.classList.add("active");
      refreshExtensionsList();
    });
  }

  if (els.tabCategoryDatapacks) {
    els.tabCategoryDatapacks.addEventListener("click", () => {
      setActiveCategory("datapack");
      [els.tabCategoryPlugins, els.tabCategoryMods, els.tabCategoryDatapacks].forEach(b => b && b.classList.remove("active"));
      els.tabCategoryDatapacks.classList.add("active");
      refreshExtensionsList();
    });
  }

  // Categorías en Instalados
  if (els.tabCategoryPluginsInst) {
    els.tabCategoryPluginsInst.addEventListener("click", () => {
      setActiveCategory("plugin");
      [els.tabCategoryPluginsInst, els.tabCategoryModsInst, els.tabCategoryDatapacksInst].forEach(b => b && b.classList.remove("active"));
      els.tabCategoryPluginsInst.classList.add("active");
      loadInstalledExtensions();
    });
  }

  if (els.tabCategoryModsInst) {
    els.tabCategoryModsInst.addEventListener("click", () => {
      setActiveCategory("mod");
      [els.tabCategoryPluginsInst, els.tabCategoryModsInst, els.tabCategoryDatapacksInst].forEach(b => b && b.classList.remove("active"));
      els.tabCategoryModsInst.classList.add("active");
      loadInstalledExtensions();
    });
  }

  if (els.tabCategoryDatapacksInst) {
    els.tabCategoryDatapacksInst.addEventListener("click", () => {
      setActiveCategory("datapack");
      [els.tabCategoryPluginsInst, els.tabCategoryModsInst, els.tabCategoryDatapacksInst].forEach(b => b && b.classList.remove("active"));
      els.tabCategoryDatapacksInst.classList.add("active");
      loadInstalledExtensions();
    });
  }

  // Sub-pestañas Estado (Activados vs Desactivados)
  if (els.tabViewInstalled) {
    els.tabViewInstalled.addEventListener("click", () => {
      setActiveSubTab("installed");
      els.tabViewInstalled.classList.add("active");
      if (els.tabViewDisabled) els.tabViewDisabled.classList.remove("active");
      loadInstalledExtensions();
    });
  }

  if (els.tabViewDisabled) {
    els.tabViewDisabled.addEventListener("click", () => {
      setActiveSubTab("disabled");
      els.tabViewDisabled.classList.add("active");
      if (els.tabViewInstalled) els.tabViewInstalled.classList.remove("active");
      loadInstalledExtensions();
    });
  }

  if (els.btnSearchProviderCycle && els.selectSearchProvider) {
    els.btnSearchProviderCycle.addEventListener("click", () => {
      const select = els.selectSearchProvider;
      if (select.options.length <= 1) return;
      let nextIndex = select.selectedIndex + 1;
      if (nextIndex >= select.options.length) {
        nextIndex = 0;
      }
      select.selectedIndex = nextIndex;
      const selectedOption = select.options[nextIndex];
      els.btnSearchProviderCycle.textContent = selectedOption.text.toUpperCase();
      select.dispatchEvent(new Event("change"));
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

  startScheduler();
}

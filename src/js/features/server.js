import { invoke, open, getPaperDownloadUrl, getVanillaDownloadUrl, getPurpurDownloadUrl, getFabricDownloadUrl, getForgeDownloadUrl, getNeoForgeDownloadUrl } from "../core/api.js";
import { els } from "../core/dom.js";
import { appState, connectedPlayers } from "../core/state.js";
import { triggerStartTasks } from "./backups.js";
import { navigateTo, updateControls, applySnapshot, renderJavaOptions, renderPlayersList } from "../ui/ui.js";
import { showFeedback, clearLogs, suggestedServerName, normalizeError, appendLog, normalizeMessage, showLoadingOverlay, hideLoadingOverlay } from "../utils/utils.js";

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
  if (els.serverParentDir) {
    els.serverParentDir.value = localStorage.getItem("last_server_parent_dir") || "";
  }
  if (els.serverName) els.serverName.value = "";
  if (els.radioJarSourceLocal) els.radioJarSourceLocal.checked = false;
  if (els.radioJarSourceDownload) {
    els.radioJarSourceDownload.checked = true;
    els.radioJarSourceDownload.dispatchEvent(new Event('change'));
  }
  if (els.downloadStatusHint) els.downloadStatusHint.textContent = "";
  if (els.memoryGb) els.memoryGb.value = "4";
  
  if (els.btnCreateModpackClearFinal) els.btnCreateModpackClearFinal.click();

  // Reset tabs
  if (els.btnTabCreateGame) {
    els.btnTabCreateGame.classList.add("active");
    els.btnTabCreateServer.classList.remove("active");
    els.btnTabCreateModpacks.classList.remove("active");
    els.tabCreateGameContent.hidden = false;
    els.tabCreateServerContent.hidden = true;
    els.tabCreateModpacksContent.hidden = true;
  }

  // Reset new game controls
  if (els.createWorldName) els.createWorldName.value = "world";
  if (els.btnCreateGamemodeCycle) {
    els.btnCreateGamemodeCycle.dataset.value = "survival";
    els.btnCreateGamemodeCycle.querySelectorAll('.mc-btn-group-item').forEach(b => {
      b.classList.toggle('active', b.dataset.value === 'survival');
    });
    els.createGamemodeDesc.textContent = "Consigue recursos, fabrica herramientas, gana niveles de experiencia y cuida tu salud.";
  }
  if (els.btnCreateDifficultyCycle) {
    els.btnCreateDifficultyCycle.dataset.value = "normal";
    els.btnCreateDifficultyCycle.querySelectorAll('.mc-btn-group-item').forEach(b => {
      b.classList.toggle('active', b.dataset.value === 'normal');
      b.disabled = false;
    });
    els.createDifficultyDesc.textContent = "Aparecen monstruos. Daño estándar.";
  }
  if (els.btnCreateSoftwareCycle) {
    els.btnCreateSoftwareCycle.dataset.value = "vanilla";
    els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item').forEach(b => {
      b.classList.toggle('active', b.dataset.value === 'vanilla');
    });
    const descEl = document.querySelector("#create-software-desc");
    if (descEl) descEl.textContent = "Software oficial de Mojang. Ideal para juego base sin modificaciones.";
  }
  if (els.createMaxPlayers) els.createMaxPlayers.value = "20";
  if (els.createOnlineMode) els.createOnlineMode.checked = true;
  if (els.createHardcore) {
    els.createHardcore.checked = false;
    if (els.createWorldPreview) els.createWorldPreview.classList.remove("hardcore-mode");
  }
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
  const savedParentDir = localStorage.getItem("last_server_parent_dir") || undefined;
  const currentDir = els.serverParentDir ? els.serverParentDir.value.trim() : "";
  const selectedPath = await open({
    directory: true,
    multiple: false,
    defaultPath: currentDir || savedParentDir,
    title: "Selecciona el directorio donde se creará la carpeta del servidor",
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  els.serverParentDir.value = selectedPath;
  localStorage.setItem("last_server_parent_dir", selectedPath);
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

  if (payload.parent_dir) {
    localStorage.setItem("last_server_parent_dir", payload.parent_dir);
  }

  let minecraft_version = null;
  if (appState.selectedModpackId) {
    // Si hay un modpack, se usará la versión del modpack
    payload.start_immediately = false;
  } else if (isDownload) {
    minecraft_version = els.selectDownloadVersion.value;
    if (minecraft_version && minecraft_version.includes('|')) {
      minecraft_version = minecraft_version.split('|')[0].trim();
    }
    payload.minecraft_version = minecraft_version;
  } else {
    const jarPath = els.serverJarPath.value.trim();
    const match = jarPath.match(/1\.\d+(?:\.\d+)?/);
    if (match) minecraft_version = match[0];
    payload.minecraft_version = minecraft_version;
  }

  appState.pendingCreateFlow = true;
  clearLogs();

  if (appState.selectedModpackId) {
    try {
      if (appState.selectedModpackId === "local_mrpack") {
        const mr = appState.mrpackToInstall;
        const mrpackIndexRaw = await invoke("parse_mrpack", { path: mr.mrpackPath });
        const mrpackIndex = JSON.parse(mrpackIndexRaw);
        const mcVer = mrpackIndex.dependencies.minecraft;
        payload.minecraft_version = mcVer;
        
        let engine = "fabric";
        let engineVer = mrpackIndex.dependencies.fabric || mrpackIndex.dependencies["fabric-loader"];
        if (mrpackIndex.dependencies.forge) { engine = "forge"; engineVer = mrpackIndex.dependencies.forge; }
        else if (mrpackIndex.dependencies.neoforge) { engine = "neoforge"; engineVer = mrpackIndex.dependencies.neoforge; }
        
        showFeedback(`Motor detectado en mrpack local: ${engine} ${engineVer || ''}. Preparando motor...`, "info");
        let url = "";
        let jarName = "";
        if (engine === "fabric") {
          url = await getFabricDownloadUrl(mcVer);
          jarName = `fabric-${mcVer}.jar`;
        } else if (engine === "forge") {
          url = await getForgeDownloadUrl(mcVer, engineVer);
          jarName = `forge-${mcVer}-${engineVer}-installer.jar`;
        } else if (engine === "neoforge") {
          url = await getNeoForgeDownloadUrl(engineVer);
          jarName = `neoforge-${engineVer}-installer.jar`;
        }
        
        const tempDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + jarName;
        await invoke("descargar_servidor_jar", { url: url, destino: tempDest });
        payload.server_jar_path = tempDest;
        
        appState.mrpackToInstall = {
          mrpackPath: mr.mrpackPath,
          files: mrpackIndex.files,
          serverName: payload.server_name,
          parentDir: payload.parent_dir
        };
      } else if (appState.selectedModpackId === "local_zip") {
        showFeedback("Preparando servidor para modpack local (.zip)...", "info");
        const software = els.btnCreateSoftwareCycle.dataset.value;
        const version = els.selectDownloadVersion.value;
        let url = "";
        let jarName = "";
        
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
        } else if (software === "forge") {
          const [mcVersion, forgeVersion] = version.split('|');
          url = await getForgeDownloadUrl(mcVersion, forgeVersion);
          jarName = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
        } else if (software === "neoforge") {
          url = await getNeoForgeDownloadUrl(version);
          jarName = `neoforge-${version}-installer.jar`;
        }
        
        const tempDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + jarName;
        await invoke("descargar_servidor_jar", { url, destino: tempDest });
        payload.server_jar_path = tempDest;
        payload.minecraft_version = version.includes('|') ? version.split('|')[0] : version;
      } else if (appState.mrpackToInstall && appState.mrpackToInstall.url && (appState.mrpackToInstall.url.includes("curse") || appState.mrpackToInstall.url.includes("forgecdn") || /^\d+$/.test(appState.selectedModpackId))) {
        showFeedback("Descargando software de servidor y modpack de CurseForge...", "info");
        const software = els.btnCreateSoftwareCycle.dataset.value;
        const version = els.selectDownloadVersion.value;
        let url = "";
        let jarName = "";

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
        } else if (software === "forge") {
          const [mcVersion, forgeVersion] = version.split('|');
          url = await getForgeDownloadUrl(mcVersion, forgeVersion);
          jarName = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
        } else if (software === "neoforge") {
          const neoVersion = version.includes('|') ? version.split('|')[1] : version;
          url = await getNeoForgeDownloadUrl(neoVersion);
          jarName = `neoforge-${neoVersion}-installer.jar`;
        }

        if (url) {
          const tempDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + jarName;
          showFeedback(`Descargando ${software} ${version}...`, "info");
          await invoke("descargar_servidor_jar", { url, destino: tempDest });
          payload.server_jar_path = tempDest;
        }

        payload.minecraft_version = version.includes('|') ? version.split('|')[0] : version;

        const modpackZipName = appState.mrpackToInstall.filename || "curseforge_modpack.zip";
        const tempZipDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + modpackZipName;
        showFeedback(`Descargando archivo de modpack (${modpackZipName})...`, "info");
        await invoke("descargar_servidor_jar", { url: appState.mrpackToInstall.url, destino: tempZipDest });
        appState.localZipModpackPath = tempZipDest;
        appState.mrpackToInstall = null;
      } else {
        showFeedback("Obteniendo información del modpack...", "info");
        const urlVersion = `https://api.modrinth.com/v2/project/${appState.selectedModpackId}/version`;
        const response = await fetch(urlVersion, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } });
        const versions = await response.json();
        
        const selectedSoftware = els.btnCreateSoftwareCycle.dataset.value;
        const validVersions = versions.filter(v => v.loaders.includes(selectedSoftware));
        
        if (validVersions.length === 0) {
            throw new Error(`Este modpack no tiene ninguna versión compatible con ${selectedSoftware}.`);
        }
        
        const bestVersion = validVersions.find(v => v.files.some(f => f.primary && f.filename.endsWith(".mrpack"))) || validVersions[0];
        const mrpackFile = bestVersion.files.find(f => f.filename.endsWith(".mrpack")) || bestVersion.files[0];
        
        const tempMrpack = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + mrpackFile.filename;
        showFeedback(`Descargando modpack ${mrpackFile.filename}...`, "info");
        await invoke("descargar_servidor_jar", { url: mrpackFile.url, destino: tempMrpack });
        
        showFeedback("Procesando modpack...", "info");
        const mrpackIndexRaw = await invoke("parse_mrpack", { path: tempMrpack });
        const mrpackIndex = JSON.parse(mrpackIndexRaw);
        
        const mcVer = mrpackIndex.dependencies.minecraft;
        payload.minecraft_version = mcVer;
        
        let engine = "fabric";
        let engineVer = mrpackIndex.dependencies.fabric || mrpackIndex.dependencies["fabric-loader"];
        if (mrpackIndex.dependencies.forge) { engine = "forge"; engineVer = mrpackIndex.dependencies.forge; }
        else if (mrpackIndex.dependencies.neoforge) { engine = "neoforge"; engineVer = mrpackIndex.dependencies.neoforge; }
        
        showFeedback(`Motor detectado: ${engine} ${engineVer || ''}. Preparando motor...`, "info");
        let url = "";
        let jarName = "";
        if (engine === "fabric") {
          url = await getFabricDownloadUrl(mcVer);
          jarName = `fabric-${mcVer}.jar`;
        } else if (engine === "forge") {
          url = await getForgeDownloadUrl(mcVer, engineVer);
          jarName = `forge-${mcVer}-${engineVer}-installer.jar`;
        } else if (engine === "neoforge") {
          url = await getNeoForgeDownloadUrl(engineVer);
          jarName = `neoforge-${engineVer}-installer.jar`;
        }
        
        const tempDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + jarName;
        await invoke("descargar_servidor_jar", { url: url, destino: tempDest });
        payload.server_jar_path = tempDest;
        
        appState.mrpackToInstall = {
          mrpackPath: tempMrpack,
          files: mrpackIndex.files,
          serverName: payload.server_name,
          parentDir: payload.parent_dir
        };
      }
    } catch (err) {
      appState.pendingCreateFlow = false;
      showFeedback(`Error procesando modpack: ${err.message || err}`, "error");
      appendLog("stderr", err.message || err);
      return;
    }
  } else if (isDownload) {
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
      } else if (software === "forge") {
        const parts = version.includes('|') ? version.split('|') : [version, ""];
        const mcVersion = parts[0] ? parts[0].trim() : "";
        const forgeVersion = parts[1] ? parts[1].trim() : "";
        url = await getForgeDownloadUrl(mcVersion, forgeVersion);
        const cleanForge = (forgeVersion || "latest").replace(/[^a-zA-Z0-9_\.\-]/g, "_");
        const cleanMc = mcVersion.replace(/[^a-zA-Z0-9_\.\-]/g, "_");
        jarName = `forge-${cleanMc}-${cleanForge}-installer.jar`;
      } else if (software === "neoforge") {
        const rawNeo = version.includes('|') ? version.split('|')[1] : version;
        const cleanNeo = (rawNeo || "").trim().replace(/[^a-zA-Z0-9_\.\-]/g, "_");
        url = await getNeoForgeDownloadUrl(cleanNeo);
        jarName = `neoforge-${cleanNeo}-installer.jar`;
      }

      if (!url) throw new Error("No se pudo obtener la URL de descarga.");

      const safeJarName = jarName.replace(/[^a-zA-Z0-9_\.\-]/g, "_");
      const tempDest = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + "temp_" + safeJarName;
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

  showFeedback("Creando servidor...", "info");
  showLoadingOverlay("Creando e iniciando servidor", "Este proceso podría demorar unos minutos si se están instalando dependencias de Forge o descargando librerías...");
  
  let snapshot;
  try {
    snapshot = await invoke("crear_e_iniciar_servidor", {
      request: payload,
    });
  } catch (err) {
    hideLoadingOverlay();
    throw err;
  }
  
  hideLoadingOverlay();
  applySnapshot(snapshot);
  
  if (appState.mrpackToInstall) {
    showFeedback("Extrayendo overrides y descargando mods del modpack...", "info");
    const mr = appState.mrpackToInstall;
    const serverDir = mr.parentDir + (mr.parentDir.endsWith("/") || mr.parentDir.endsWith("\\") ? "" : "/") + mr.serverName;
    
    try {
      await invoke("extract_mrpack_overrides", { path: mr.mrpackPath, destDir: serverDir });
      
      let downloaded = 0;
      const clientPatterns = [
        "sodium-", "iris-", "rubidium-", "oculus-", "embeddium-", "entityculling-",
        "notenoughanimations-", "appleskin-", "modmenu-", "controlling-", "inventoryhud",
        "optifine", "dynamiclights", "itemphysic", "continuity-", "indium-",
        "resourcify-", "soundphysics", "skinlayers", "3dskinlayers", "cherishedworlds",
        "borderless", "smoothboot", "lazydfu", "reeses-sodium-options"
      ];
      const filesToDownload = mr.files.filter(f => {
        if (f.env && f.env.server === "unsupported") return false;
        const lowerPath = (f.path || "").toLowerCase();
        if (clientPatterns.some(p => lowerPath.includes(p))) {
          return false;
        }
        return true;
      });
      
      for (const file of filesToDownload) {
        const url = file.downloads[0];
        const dest = serverDir + "/" + file.path;
        showFeedback(`Descargando mod ${downloaded + 1}/${filesToDownload.length}...`, "info");
        await invoke("descargar_servidor_jar", { url, destino: dest });
        downloaded++;
      }
      
      try {
        const disabledCount = await invoke("deshabilitar_mods_cliente_en_ruta", { serverDir });
        if (disabledCount > 0) {
          showFeedback(`Se deshabilitaron ${disabledCount} mods exclusivos del cliente en el servidor.`, "info");
        }
      } catch (e) {
        console.warn("No se pudieron deshabilitar mods de cliente:", e);
      }
      
      showFeedback("Modpack instalado correctamente. Iniciando servidor...", "success");
      showLoadingOverlay("Iniciando servidor...", "Espera mientras arranca el motor del juego.");
      await invoke("iniciar_servidor_actual");
      hideLoadingOverlay();
      
    } catch(e) {
      hideLoadingOverlay();
      showFeedback("Error instalando mods del modpack: " + (e.message || e), "error");
    }
    appState.mrpackToInstall = null;
  } else if (appState.localZipModpackPath) {
    showFeedback("Extrayendo archivos del modpack local (.zip)...", "info");
    const zipPath = appState.localZipModpackPath;
    const serverDir = payload.parent_dir + (payload.parent_dir.endsWith("/") || payload.parent_dir.endsWith("\\") ? "" : "/") + payload.server_name;
    try {
      await invoke("extraer_zip", { path: zipPath, destDir: serverDir });
      try {
        const disabledCount = await invoke("deshabilitar_mods_cliente_en_ruta", { serverDir });
        if (disabledCount > 0) {
          showFeedback(`Se deshabilitaron ${disabledCount} mods exclusivos del cliente en el servidor.`, "info");
        }
      } catch (e) {
        console.warn("No se pudieron deshabilitar mods de cliente:", e);
      }
      showFeedback("Modpack local (.zip) extraído correctamente. Iniciando servidor...", "success");
      showLoadingOverlay("Iniciando servidor...", "Espera mientras arranca el motor del juego.");
      await invoke("iniciar_servidor_actual");
      hideLoadingOverlay();
    } catch(e) {
      hideLoadingOverlay();
      showFeedback("Error extrayendo modpack local: " + (e.message || e), "error");
    }
    appState.localZipModpackPath = null;
  }
  
  appState.pendingCreateFlow = false;
  navigateTo("control");
  showFeedback("Servidor creado y listo. Revisa la terminal.", "success");
}

export async function startCurrentServer() {
  appState.pendingCreateFlow = false;
  clearLogs();
  showFeedback("Iniciando servidor...", "info");
  
  // Disparar las tareas programadas de tipo "Al iniciar"
  triggerStartTasks();

  showLoadingOverlay("Iniciando servidor...", "El servidor se está ejecutando en segundo plano.");
  let snapshot;
  try {
    snapshot = await invoke("iniciar_servidor_actual");
  } catch (err) {
    hideLoadingOverlay();
    throw err;
  }
  hideLoadingOverlay();
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
  showLoadingOverlay("Reiniciando...", "Aceptando el EULA y preparando el arranque.");
  let snapshot;
  try {
    snapshot = await invoke("aceptar_eula_y_reiniciar");
  } catch(err) {
    hideLoadingOverlay();
    throw err;
  }
  hideLoadingOverlay();
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
      } else if (software === "forge") {
        const [mcVersion, forgeVersion] = version.split('|');
        url = await getForgeDownloadUrl(mcVersion, forgeVersion);
        jarName = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
      } else if (software === "neoforge") {
        url = await getNeoForgeDownloadUrl(version);
        jarName = `neoforge-${version}-installer.jar`;
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

  const isJoin = text.includes("joined the game");
  const isLeave = text.includes("left the game");
  if (!isJoin && !isLeave) return;

  if (isJoin) {
    const joinMatch = text.match(/(?:INFO\]|INFO\]:)\s*(?:\[[^\]]+\]:?\s*)*([a-zA-Z0-9_]{1,16})\s+joined the game/i);
    if (joinMatch) {
      connectedPlayers.add(joinMatch[1]);
      renderPlayersList();
      return;
    }
  }

  if (isLeave) {
    const leaveMatch = text.match(/(?:INFO\]|INFO\]:)\s*(?:\[[^\]]+\]:?\s*)*([a-zA-Z0-9_]{1,16})\s+left the game/i);
    if (leaveMatch) {
      connectedPlayers.delete(leaveMatch[1]);
      renderPlayersList();
      return;
    }
  }
}

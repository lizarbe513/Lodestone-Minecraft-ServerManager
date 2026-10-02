import { els } from "../core/dom.js";
import { appState, globals } from "../core/state.js";
import { fetchForgeVersions, fetchNeoForgeVersions } from "../core/api.js";
import { updateControls, navigateTo } from "../ui/ui.js";
import { showFeedback, appendLog, normalizeError, requestConfirm } from "../utils/utils.js";
import { t } from "../i18n/i18n.js";
import { resetNewServerForm, browseServerJar, browseServerParentDir, createServer } from "../features/server.js";
import { isModpackConfirmed } from "./modpacks.js";

export async function loadDownloadVersions() {
  if (!els.selectDownloadVersion) return;
  els.selectDownloadVersion.innerHTML = '<option value="">Cargando...</option>';
  els.selectDownloadVersion.disabled = true;
  if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Obteniendo versiones desde la red...";

  const type = els.btnCreateSoftwareCycle ? els.btnCreateSoftwareCycle.dataset.value : "vanilla";
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
      if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Versiones de Paper obtenidas correctamente.";
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
      if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Versiones de Vanilla obtenidas correctamente.";
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
      if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Versiones de Purpur obtenidas correctamente.";
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
      if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Versiones de Fabric obtenidas correctamente.";
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
      if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Versiones de Forge obtenidas correctamente.";
    } else if (type === "neoforge") {
      const versions = await fetchNeoForgeVersions();
      globals.cachedNeoForgeVersions = versions;
      els.selectDownloadVersion.innerHTML = "";
      versions.forEach(v => {
        const opt = document.createElement("option");
        opt.value = `${v.mcVersion}|${v.neoVersion}`;
        opt.textContent = `${v.mcVersion} (${v.neoVersion})`;
        els.selectDownloadVersion.appendChild(opt);
      });
      if (els.downloadStatusHint) els.downloadStatusHint.textContent = "Versiones de NeoForge obtenidas correctamente.";
    }

    if (appState.selectedModpackId && isModpackConfirmed() && appState.modpackGameVersions) {
      const options = Array.from(els.selectDownloadVersion.options);
      const originalCount = options.length;
      
      let removedCount = 0;
      options.forEach(opt => {
        let mcVer = opt.value;
        if (type === "forge" || type === "neoforge") mcVer = opt.value.split('|')[0];
        
        if (!appState.modpackGameVersions.includes(mcVer) && opt.value !== "") {
          els.selectDownloadVersion.removeChild(opt);
          removedCount++;
        }
      });
      
      if (removedCount > 0 && removedCount < originalCount && els.downloadStatusHint) {
        els.downloadStatusHint.textContent += ` (Filtrado para el modpack seleccionado)`;
      }
    }

    els.selectDownloadVersion.disabled = false;
    
    if (!els.selectDownloadVersion.value && els.selectDownloadVersion.options.length > 0) {
        els.selectDownloadVersion.selectedIndex = 0;
    }
    
  } catch (err) {
    els.selectDownloadVersion.innerHTML = '<option value="">Error al cargar</option>';
    if (els.downloadStatusHint) els.downloadStatusHint.textContent = `Error: ${err.message || err}`;
  }
  updateControls();
}

export function initCreateServerEvents() {
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

  if (els.createHardcore && els.createWorldPreview) {
    els.createHardcore.addEventListener("change", (e) => {
      els.createWorldPreview.classList.toggle("hardcore-mode", e.target.checked);
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

  if (els.btnMemoryGbInc && els.memoryGb) {
    els.btnMemoryGbInc.addEventListener("click", () => {
      const val = parseInt(els.memoryGb.value || 0);
      els.memoryGb.value = val + 1;
      els.memoryGb.dispatchEvent(new Event("input"));
    });
  }

  if (els.btnMemoryGbDec && els.memoryGb) {
    els.btnMemoryGbDec.addEventListener("click", () => {
      const val = parseInt(els.memoryGb.value || 0);
      els.memoryGb.value = Math.max(1, val - 1);
      els.memoryGb.dispatchEvent(new Event("input"));
    });
  }

  if (els.btnCreateBack) {
    els.btnCreateBack.addEventListener("click", () => {
      if (els.btnCreateBack.disabled) {
        return;
      }

      const savedParentDir = localStorage.getItem("last_server_parent_dir") || "";
      const isDirty = (els.serverName && els.serverName.value.trim() !== "") ||
                      (els.serverParentDir && els.serverParentDir.value.trim() !== "" && els.serverParentDir.value.trim() !== savedParentDir) ||
                      (els.serverJarPath && els.serverJarPath.value.trim() !== "") ||
                      Boolean(appState.selectedModpackId);

      const doBack = () => {
        appState.pendingCreateFlow = false;
        navigateTo("home");
        showFeedback("Selecciona una opción para continuar.", "info");

        setTimeout(() => {
          resetNewServerForm();
        }, 150);
      };

      if (isDirty) {
        requestConfirm(
          t("dialog.discard_changes_title"),
          t("dialog.discard_changes_msg"),
          {
            type: "danger",
            acceptText: t("common.accept"),
            action: doBack
          }
        );
      } else {
        doBack();
      }
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
}

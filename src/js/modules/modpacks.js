import { els } from "../core/dom.js";
import { appState } from "../core/state.js";
import { invoke, open } from "../core/api.js";
import { loadDownloadVersions } from "./create_server.js";

let modpackHits = [];
let currentModpackPage = 0;
let totalModpackHits = 0;
export let currentModpackQuery = "";
let isFetchingModpacks = false;
export let activeModpackProvider = "modrinth";
const MODPACKS_PER_PAGE = 6;
const FETCH_BATCH_SIZE = 48; // 8 páginas por lote (máx. 50 permitido por CurseForge API)

export let modpackConfirmed = false;

export function isModpackConfirmed() {
  return modpackConfirmed;
}

export function syncSoftwareCycleWithModpack() {
  if (!els.btnCreateSoftwareCycle) return;
  const buttons = els.btnCreateSoftwareCycle.querySelectorAll('.mc-btn-group-item');
  
  if (!appState.selectedModpackId || !modpackConfirmed || !appState.modpackLoaders || appState.modpackLoaders.length === 0) {
    buttons.forEach(b => {
      b.disabled = false;
      b.style.opacity = "1";
    });
    loadDownloadVersions();
    return;
  }

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
    loadDownloadVersions();
  }
}

export const doSearch = async () => {
  currentModpackQuery = els.inputCreateModpackSearch ? els.inputCreateModpackSearch.value.trim() : "";
  const providerName = activeModpackProvider === "curseforge" ? "CurseForge" : "Modrinth";
  
  if (els.createModpackSearchResults) {
    els.createModpackSearchResults.innerHTML = `<p class="hint" style="grid-column: span 3; text-align: center; margin: 16px 0;">Buscando en ${providerName}...</p>`;
  }
  
  try {
    currentModpackPage = 0;
    await fetchModpackBatch(0);
    await renderModpackPage();
  } catch (err) {
    if (els.createModpackSearchResults) {
      els.createModpackSearchResults.innerHTML = `<p class="hint" style="grid-column: span 3; color: var(--error);">Error al buscar modpacks: ${err}</p>`;
    }
  }
};

const fetchModpackBatch = async (offset = 0) => {
  if (isFetchingModpacks) return;
  isFetchingModpacks = true;
  try {
    if (activeModpackProvider === "curseforge") {
      const filterPart = currentModpackQuery ? `&searchFilter=${encodeURIComponent(currentModpackQuery)}` : '';
      const url = `https://api.curse.tools/v1/cf/mods/search?gameId=432&classId=4471${filterPart}&pageSize=${FETCH_BATCH_SIZE}&index=${offset}&sortField=2&sortOrder=desc`;
      const response = await fetch(url);
      const data = await response.json();

      totalModpackHits = data.pagination ? data.pagination.totalCount : (data.data ? data.data.length : 0);
      const newHits = (data.data || []).map(h => ({
        project_id: h.id.toString(),
        title: h.name,
        project_type: "modpack",
        downloads: h.downloadCount,
        description: h.summary || "Sin descripción.",
        author: h.authors && h.authors[0] ? h.authors[0].name : "",
        icon_url: h.logo ? h.logo.url : null,
        slug: h.slug,
        provider: "curseforge",
        raw: h
      }));

      if (offset === 0) {
        modpackHits = newHits;
      } else {
        modpackHits = [...modpackHits, ...newHits];
      }
    } else {
      const queryPart = currentModpackQuery ? `query=${encodeURIComponent(currentModpackQuery)}&` : '';
      const indexPart = currentModpackQuery ? `index=relevance` : `index=downloads`;
      const url = `https://api.modrinth.com/v2/search?${queryPart}facets=[["project_type:modpack"]]&limit=${FETCH_BATCH_SIZE}&offset=${offset}&${indexPart}`;
      const response = await fetch(url, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } });
      const data = await response.json();

      totalModpackHits = data.total_hits || (data.hits ? data.hits.length : 0);
      const newHits = (data.hits || []).map(h => ({
        ...h,
        provider: "modrinth"
      }));

      if (offset === 0) {
        modpackHits = newHits;
      } else {
        modpackHits = [...modpackHits, ...newHits];
      }
    }
  } catch (err) {
    console.error("Error al obtener lote de modpacks:", err);
  } finally {
    isFetchingModpacks = false;
  }
};

const renderModpackPage = async () => {
  if (!els.createModpackSearchResults) return;

  const totalPages = Math.max(1, Math.ceil(totalModpackHits / MODPACKS_PER_PAGE));
  
  const requiredStartIndex = currentModpackPage * MODPACKS_PER_PAGE;
  if (requiredStartIndex >= modpackHits.length && modpackHits.length < totalModpackHits) {
    els.createModpackSearchResults.innerHTML = '<p class="hint" style="grid-column: span 3; text-align: center; margin: 16px 0;">Cargando más modpacks...</p>';
    await fetchModpackBatch(modpackHits.length);
  }

  els.createModpackSearchResults.innerHTML = "";

  if (modpackHits.length === 0) {
    els.createModpackSearchResults.innerHTML = '<p class="hint" style="grid-column: span 3; text-align: center;">No se encontraron modpacks.</p>';
    if (els.labelModpackPage) els.labelModpackPage.textContent = `Página 1 de 1`;
    return;
  }

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

    if (appState.selectedModpackId === modpack.project_id) {
      div.style.border = "2px solid var(--mc-green)";
    }

    els.createModpackSearchResults.appendChild(div);
  });
};

let currentModpackData = null;

const updateModpackUIState = () => {
    const hasFinalSelection = (appState.selectedModpackId && modpackConfirmed) || appState.localZipModpackPath;
    if (els.stateModpackExplore) {
        els.stateModpackExplore.style.display = hasFinalSelection ? "none" : "flex"; 
        if (!hasFinalSelection) els.stateModpackExplore.className = "grid-form two-cols";
    }
    if (els.stateModpackSelected) {
        els.stateModpackSelected.style.display = hasFinalSelection ? "flex" : "none";
    }
};

export const clearModpackSelection = () => {
    appState.selectedModpackId = null;
    appState.modpackLoaders = null;
    appState.modpackGameVersions = null;
    appState.mrpackToInstall = null;
    appState.localZipModpackPath = null;
    appState.modpackGallery = [];
    appState.galleryIndex = -1;
    modpackConfirmed = false;
    
    if (els.createModpackLocalPath) els.createModpackLocalPath.value = "";
    
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
    
    if (els.createModpackSearchResults) {
      els.createModpackSearchResults.querySelectorAll('.extension-card').forEach(card => {
        card.style.border = "";
      });
    }
    
    syncSoftwareCycleWithModpack();
    updateModpackUIState();
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

const selectModpack = async (modpack, div) => {
  appState.selectedModpackId = modpack.project_id;
  currentModpackData = modpack;
  
  if (els.createModpackSearchResults) {
    els.createModpackSearchResults.querySelectorAll('.extension-card').forEach(card => {
      card.style.border = "";
    });
  }
  if (div) {
    div.style.border = "2px solid var(--mc-green)";
  }
  
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
  
  if (els.btnCreateModpackDownload) {
    els.btnCreateModpackDownload.disabled = false;
    els.btnCreateModpackDownload.style.opacity = "1";
  }
  
  try {
    if (modpack.provider === "curseforge") {
      if (modpack.raw && modpack.raw.screenshots && modpack.raw.screenshots.length > 0) {
        appState.modpackGallery = modpack.raw.screenshots.map((img, idx) => ({
          url: img.url,
          title: img.title || img.caption || ("Imagen " + (idx + 1))
        })).filter(img => img.url);
        if (appState.modpackGallery.length > 0 && els.createModpackGalleryControls) {
          els.createModpackGalleryControls.style.display = "flex";
          updateGalleryUI();
        }
      }

      const [detailsRes, filesRes] = await Promise.all([
        fetch(`https://api.curse.tools/v1/cf/mods/${modpack.project_id}`),
        fetch(`https://api.curse.tools/v1/cf/mods/${modpack.project_id}/files`)
      ]);

      let detailsData = null;
      if (detailsRes.ok) {
        detailsData = await detailsRes.json();
        const item = detailsData.data;
        if (item && item.screenshots && item.screenshots.length > 0) {
          appState.modpackGallery = item.screenshots.map((img, idx) => ({
            url: img.url,
            title: img.title || img.caption || ("Imagen " + (idx + 1))
          })).filter(img => img.url);
          if (appState.modpackGallery.length > 0 && els.createModpackGalleryControls) {
            els.createModpackGalleryControls.style.display = "flex";
            if (appState.galleryIndex !== -1) updateGalleryUI();
          }
        }
      }

      const filesData = filesRes.ok ? await filesRes.json() : { data: [] };
      let files = filesData.data || [];
      if (files.length === 0 && modpack.raw && modpack.raw.latestFiles) {
        files = modpack.raw.latestFiles;
      }
      if (files.length === 0 && detailsData && detailsData.data && detailsData.data.latestFiles) {
        files = detailsData.data.latestFiles;
      }

      const mcVersions = new Set();
      const loaders = new Set();
      
      files.forEach(f => {
        if (f.gameVersions) {
          f.gameVersions.forEach(v => {
            if (/\d+\.\d+/.test(v)) mcVersions.add(v);
            const lower = v.toLowerCase();
            if (lower === "neoforge") loaders.add("neoforge");
            else if (lower === "forge") loaders.add("forge");
            else if (lower === "fabric") loaders.add("fabric");
            else if (lower === "quilt") loaders.add("quilt");
          });
        }
      });

      const fileIndexes = (modpack.raw && modpack.raw.latestFilesIndexes) || 
                          (detailsData && detailsData.data && detailsData.data.latestFilesIndexes) || [];
      fileIndexes.forEach(idx => {
        if (idx.gameVersion && /\d+\.\d+/.test(idx.gameVersion)) {
          mcVersions.add(idx.gameVersion);
        }
        if (idx.modLoader === 1) loaders.add("forge");
        if (idx.modLoader === 4) loaders.add("fabric");
        if (idx.modLoader === 5) loaders.add("neoforge");
        if (idx.modLoader === 6) loaders.add("quilt");
      });

      if (loaders.size === 0) {
        loaders.add("forge");
        loaders.add("fabric");
        loaders.add("neoforge");
      }

      appState.modpackLoaders = Array.from(loaders);
      appState.modpackGameVersions = Array.from(mcVersions);
      if (files.length > 0) {
        const latestFile = files[0];
        appState.mrpackToInstall = {
          url: latestFile.downloadUrl || null,
          filename: latestFile.fileName || `${modpack.slug || 'modpack'}.zip`
        };
      }
      syncSoftwareCycleWithModpack();
    } else {
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
                  if (appState.galleryIndex !== -1) updateGalleryUI();
              }
          }
      }

      const projVersions = versionsRes.ok ? await versionsRes.json() : [];
      const loaders = new Set();
      const mcVersions = new Set();
      
      projVersions.forEach(v => {
        if (v.loaders) v.loaders.forEach(l => loaders.add(l.toLowerCase()));
        if (v.game_versions) v.game_versions.forEach(gv => mcVersions.add(gv));
      });

      appState.modpackLoaders = Array.from(loaders);
      appState.modpackGameVersions = Array.from(mcVersions);

      if (projVersions.length > 0) {
        const primaryVersion = projVersions[0];
        const primaryFile = primaryVersion.files ? (primaryVersion.files.find(f => f.primary) || primaryVersion.files[0]) : null;
        if (primaryFile) {
          appState.mrpackToInstall = {
            url: primaryFile.url,
            filename: primaryFile.filename
          };
        }
      }
      syncSoftwareCycleWithModpack();
    }
  } catch (e) {
    console.error("Error al obtener detalles del modpack:", e);
  }
};

export function initModpacksEvents() {
  if (els.btnModpackProviderCycle) {
    els.btnModpackProviderCycle.addEventListener("click", () => {
      activeModpackProvider = activeModpackProvider === "modrinth" ? "curseforge" : "modrinth";
      els.btnModpackProviderCycle.dataset.provider = activeModpackProvider;
      els.btnModpackProviderCycle.textContent = activeModpackProvider === "modrinth" ? "Modrinth" : "CurseForge";
      if (els.inputCreateModpackSearch) {
        els.inputCreateModpackSearch.placeholder = `Buscar modpacks en ${els.btnModpackProviderCycle.textContent}...`;
      }
      doSearch();
    });
  }

  if (els.btnModpackPagePrev) {
    els.btnModpackPagePrev.addEventListener("click", async () => {
      if (currentModpackPage > 0) {
        currentModpackPage--;
        await renderModpackPage();
      }
    });
  }

  if (els.btnModpackPageNext) {
    els.btnModpackPageNext.addEventListener("click", async () => {
      const totalPages = Math.ceil(totalModpackHits / MODPACKS_PER_PAGE);
      if (currentModpackPage < totalPages - 1) {
        currentModpackPage++;
        await renderModpackPage();
      }
    });
  }

  if (els.btnCreateModpackDoSearch) {
    els.btnCreateModpackDoSearch.addEventListener("click", doSearch);
    if (els.inputCreateModpackSearch) {
      els.inputCreateModpackSearch.addEventListener("keyup", (e) => {
        if (e.key === "Enter") doSearch();
      });
    }

    if (els.btnTabCreateModpacks) {
      els.btnTabCreateModpacks.addEventListener("click", () => {
        if (modpackHits.length === 0) {
          doSearch();
        }
      });
    }
  }

  if (els.btnCreateModpackClearFinal) {
    els.btnCreateModpackClearFinal.addEventListener("click", clearModpackSelection);
  }
  
  if (els.btnCreateModpackConfirm) {
    els.btnCreateModpackConfirm.addEventListener("click", () => {
        modpackConfirmed = true;
        syncSoftwareCycleWithModpack();
        if (els.btnTabCreateServer) els.btnTabCreateServer.click();
    });
  }

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
        const providerName = currentModpackData.provider === "curseforge" ? "CurseForge" : "Modrinth";
        if (els.modpackSelectedSourceLabel) els.modpackSelectedSourceLabel.textContent = `Origen: ${providerName}`;
        if (els.modpackSelectedDescFinal) els.modpackSelectedDescFinal.textContent = `Soportado en: ${appState.modpackLoaders && appState.modpackLoaders.length > 0 ? appState.modpackLoaders.join(', ') : 'Información de versión'}.\nPulsa "Configurar" para continuar.`;
        
        if (els.modpackSelectedThumbnailFinal) {
            if (currentModpackData.icon_url) {
                els.modpackSelectedThumbnailFinal.style.backgroundImage = `url('${currentModpackData.icon_url}')`;
            } else {
                els.modpackSelectedThumbnailFinal.style.backgroundImage = "none";
            }
        }
        
        updateModpackUIState();
        syncSoftwareCycleWithModpack();
    });
  }

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
        
        if (els.modpackSelectedThumbnailFinal) {
            els.modpackSelectedThumbnailFinal.style.backgroundImage = "url('assets/images/world_preview.png')";
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
}

import { invoke, open } from "../core/api.js";
import { els } from "../core/dom.js";
import { showFeedback, requestConfirm, openImageLightbox } from "../utils/utils.js";

// Variable de estado local para el motor y la categoría activa
export let activeEngine = "vanilla";
export let activeCategory = "datapack"; // "plugin" | "mod" | "datapack"
export let activeSubTab = "installed"; // "installed" | "search"
export let activeMcVersion = "unknown";

// Caché en memoria para búsquedas instantáneas (0ms al cambiar pestañas/categorías)
const searchCache = new Map();
let currentSearchRequestId = 0;

export function clearSearchCache() {
  searchCache.clear();
}

function getSearchCacheKey(provider, category, engine, mcVersion, query, offset) {
  return `${provider}::${category}::${engine}::${mcVersion}::${query}::${offset}`;
}

// Cola de cambios de toggle pendientes (se aplican al cambiar pestaña/categoría)
let pendingToggleChanges = [];

const RECOMMENDED_SLUGS = {
  plugin: ["essentialsx", "worldedit", "viaversion", "dynmap", "geyser", "vault"],
  mod: ["sodium", "lithium", "iris", "worldedit", "fabric-api", "simple-voice-chat"],
  datapack: ["terralith", "nullscape", "incendium", "towns-and-towers"]
};

const ENGINE_LABELS = {
  vanilla: "Vanilla (Solo admite Datapacks)",
  paper: "Paper / Spigot (Admite Plugins y Datapacks)",
  purpur: "Purpur (Admite Plugins y Datapacks)",
  fabric: "Fabric (Admite Mods y Datapacks)",
  forge: "Forge (Admite Mods)",
  neoforge: "NeoForge (Admite Mods)",
  quilt: "Quilt (Admite Mods y Datapacks)"
};

export function setActiveCategory(category) {
  activeCategory = category;
}

export function setActiveSubTab(subTab) {
  activeSubTab = subTab;
}

export function syncCategoryButtons(category) {
  activeCategory = category;
  const groups = [
    { mods: els.tabCategoryMods, plugins: els.tabCategoryPlugins, datapacks: els.tabCategoryDatapacks },
    { mods: els.tabCategoryModsInst, plugins: els.tabCategoryPluginsInst, datapacks: els.tabCategoryDatapacksInst }
  ];
  groups.forEach(g => {
    if (g.mods) g.mods.classList.toggle("active", category === "mod");
    if (g.plugins) g.plugins.classList.toggle("active", category === "plugin");
    if (g.datapacks) g.datapacks.classList.toggle("active", category === "datapack");
  });
}

export async function importLocalExtensions() {
  try {
    const isDatapack = activeCategory === "datapack";
    const catLabel = activeCategory === "plugin" ? "Plugins" : activeCategory === "mod" ? "Mods" : "Datapacks";
    
    const selectedPaths = await open({
      directory: false,
      multiple: true,
      title: `Selecciona ${catLabel} (.jar o .zip) para importar`,
      filters: [
        { name: "Complementos", extensions: ["jar", "zip"] }
      ]
    });

    if (!selectedPaths) return;
    const pathsArray = Array.isArray(selectedPaths) ? selectedPaths : [selectedPaths];
    if (pathsArray.length === 0) return;

    showFeedback(`Importando ${pathsArray.length} archivo(s)...`, "info");
    const count = await invoke("importar_extensiones_locales", {
      filePaths: pathsArray,
      extensionType: activeCategory
    });

    showFeedback(`Se importaron ${count} complemento(s) correctamente a ${catLabel}.`, "success");
    
    // Cambiar a la pestaña instalados para ver de inmediato los complementos
    if (els.tabExtInstalled) {
      els.tabExtInstalled.click();
    } else {
      loadInstalledExtensions();
    }
  } catch (err) {
    showFeedback(`Error al importar complementos: ${err.message || err}`, "error");
  }
}

export async function initExtensionsPage() {
  try {
    showFeedback("Agrega complementos para más diversion!", "info");
    const engine = await invoke("detectar_motor_servidor");
    activeEngine = engine;
    
    const mcVersion = await invoke("detectar_version_minecraft");
    activeMcVersion = mcVersion && mcVersion.includes('|') ? mcVersion.split('|')[0].trim() : (mcVersion || "unknown");
    
    // Configurar etiqueta del motor y versión
    if (els.extensionsEngineHint) {
      els.extensionsEngineHint.textContent = `Motor del servidor: ${ENGINE_LABELS[engine] || engine.toUpperCase()}`;
    }

    const isModsSupported = ["fabric", "forge", "neoforge", "quilt"].includes(engine);
    const isPluginsSupported = ["paper", "purpur"].includes(engine);
    const isVanilla = engine === "vanilla";

    const updateCatButtonState = (btn, enabled, tooltip) => {
      if (!btn) return;
      btn.disabled = !enabled;
      btn.title = enabled ? "" : tooltip;
      if (!enabled) {
        btn.classList.add("disabled");
        btn.style.opacity = "0.45";
        btn.style.cursor = "not-allowed";
      } else {
        btn.classList.remove("disabled");
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
      }
    };

    const modsTooltip = isVanilla ? "Los servidores Vanilla no admiten mods" : "Paper/Purpur no admite mods";
    const pluginsTooltip = isVanilla ? "Los servidores Vanilla no admiten plugins" : "Los cargadores de mods no admiten plugins";

    updateCatButtonState(els.tabCategoryMods, isModsSupported, modsTooltip);
    updateCatButtonState(els.tabCategoryModsInst, isModsSupported, modsTooltip);
    updateCatButtonState(els.tabCategoryPlugins, isPluginsSupported, pluginsTooltip);
    updateCatButtonState(els.tabCategoryPluginsInst, isPluginsSupported, pluginsTooltip);
    updateCatButtonState(els.tabCategoryDatapacks, true, "");
    updateCatButtonState(els.tabCategoryDatapacksInst, true, "");

    // Establecer categoría inicial por defecto según el motor
    if (isPluginsSupported) {
      activeCategory = "plugin";
    } else if (isModsSupported) {
      activeCategory = "mod";
    } else {
      activeCategory = "datapack";
    }
    syncCategoryButtons(activeCategory);

    // Configurar botones de navegación de galería de capturas
    if (els.btnExtGalleryPrev) {
      els.btnExtGalleryPrev.onclick = () => {
        if (extGalleryIndex > -1) {
          extGalleryIndex--;
          updateGalleryUI();
        }
      };
    }

    if (els.btnExtGalleryNext) {
      els.btnExtGalleryNext.onclick = () => {
        if (extGalleryIndex < extGallery.length - 1) {
          extGalleryIndex++;
          updateGalleryUI();
        }
      };
    }

    // Resetear subpestaña a "installed"
    if (els.tabViewInstalled) {
      els.tabViewInstalled.click();
    }
  } catch (err) {
    showFeedback(`Error al inicializar gestor de extensiones: ${err}`, "error");
  }
}

let selectedInstalledExt = null;

export async function loadInstalledExtensions() {
  if (!els.listInstalledExtensions) return;

  try {
    els.listInstalledExtensions.innerHTML = '<p class="hint" style="grid-column: span 4; text-align: center; margin: 16px 0;">Cargando extensiones...</p>';
    const extensions = await invoke("listar_extensiones");

    els.listInstalledExtensions.innerHTML = "";
    selectedInstalledExt = null;
    resetInstalledDetailPanel();

    const isLookingForDisabled = activeSubTab === "disabled";
    const filtered = (extensions || []).filter(ext => {
      if (ext.extension_type !== activeCategory) return false;
      const isEnabled = ext.enabled !== false;
      return isLookingForDisabled ? !isEnabled : isEnabled;
    });

    if (filtered.length === 0) {
      const typeText = activeCategory === "plugin" ? "plugins" : activeCategory === "mod" ? "mods" : "datapacks";
      const statusText = isLookingForDisabled ? "desactivados" : "activados";
      els.listInstalledExtensions.innerHTML = `<p class="hint" style="grid-column: span 4; text-align: center; margin: 16px 0;">No hay ${typeText} ${statusText}.</p>`;
      return;
    }

    filtered.forEach((ext, idx) => {
      const card = document.createElement("div");
      const isEnabled = ext.enabled !== false;
      card.className = "ext-mod-card" + (!isEnabled ? " disabled-card" : "");
      card.dataset.fileName = ext.file_name;
      if (!isEnabled) {
        card.style.opacity = "0.45";
        card.style.filter = "grayscale(85%)";
      } else {
        card.style.opacity = "1";
        card.style.filter = "none";
      }

      const iconUrl = ext.icon_url || "assets/images/creeper_head.svg";
      card.innerHTML = `
        <img src="${iconUrl}" />
        <div class="ext-mod-card-title">${ext.name}</div>
      `;

      card.addEventListener("click", () => {
        const allCards = els.listInstalledExtensions.querySelectorAll(".ext-mod-card");
        allCards.forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedInstalledExt = ext;
        updateInstalledDetailPanel(ext);
      });

      els.listInstalledExtensions.appendChild(card);

      // Autoselect first item
      if (idx === 0) {
        card.click();
      }
    });
  } catch (err) {
    els.listInstalledExtensions.innerHTML = `<p class="hint" style="grid-column: span 4; color: var(--error);">Error al cargar extensiones: ${err}</p>`;
  }
}

function resetInstalledDetailPanel() {
  if (els.extInstalledTitle) els.extInstalledTitle.textContent = "Ningún complemento seleccionado";
  if (els.extInstalledAuthor) { els.extInstalledAuthor.textContent = ""; els.extInstalledAuthor.style.display = "none"; }
  if (els.extInstalledDesc) els.extInstalledDesc.textContent = "Selecciona un complemento instalado arriba para gestionarlo.";
  if (els.extInstalledThumb) els.extInstalledThumb.style.backgroundImage = "none";
  if (els.switchExtToggle) { els.switchExtToggle.disabled = true; els.switchExtToggle.checked = false; }
  if (els.labelExtToggleState) els.labelExtToggleState.textContent = "Desactivar";
  if (els.btnExtDeleteSelected) { els.btnExtDeleteSelected.disabled = true; }
}

function updateInstalledDetailPanel(ext) {
  const isEnabled = ext.enabled !== false;
  
  if (els.extInstalledTitle) els.extInstalledTitle.textContent = ext.name;
  if (els.extInstalledAuthor) {
    els.extInstalledAuthor.textContent = `Archivo: ${ext.file_name} ${ext.version ? '| v' + ext.version : ''}`;
    els.extInstalledAuthor.style.display = "block";
  }
  if (els.extInstalledDesc) {
    els.extInstalledDesc.textContent = ext.description || "Complemento instalado en el servidor.";
  }
  if (els.extInstalledThumb) {
    if (ext.icon_url) {
      els.extInstalledThumb.style.backgroundImage = `url('${ext.icon_url}')`;
    } else {
      els.extInstalledThumb.style.backgroundImage = "none";
    }
  }

  if (els.switchExtToggle) {
    els.switchExtToggle.disabled = false;
    els.switchExtToggle.checked = isEnabled;
    els.switchExtToggle.onclick = async () => {
      try {
        const nextState = !(ext.enabled !== false);
        showFeedback(`${nextState ? 'Activando' : 'Desactivando'} "${ext.name}"...`, "info");
        await invoke("alternar_extension", { fileName: ext.file_name, extensionType: ext.extension_type });
        ext.enabled = nextState;
        showFeedback(`Complemento "${ext.name}" ${nextState ? 'activado' : 'desactivado'} correctamente.`, "success");

        // Mantener la tarjeta visible en pantalla con apariencia apagada/activada
        const cardElem = els.listInstalledExtensions.querySelector(`.ext-mod-card[data-file-name="${ext.file_name}"]`);
        if (cardElem) {
          if (nextState) {
            cardElem.classList.remove("disabled-card");
            cardElem.style.opacity = "1";
            cardElem.style.filter = "none";
          } else {
            cardElem.classList.add("disabled-card");
            cardElem.style.opacity = "0.45";
            cardElem.style.filter = "grayscale(85%)";
          }
        }

        // Actualizar el estado del switch y texto
        updateInstalledDetailPanel(ext);
      } catch (err) {
        showFeedback(`Error al cambiar estado: ${err}`, "error");
      }
    };
  }

  if (els.labelExtToggleState) {
    els.labelExtToggleState.textContent = isEnabled ? "Desactivar" : "Activar";
  }

  if (els.btnExtDeleteSelected) {
    els.btnExtDeleteSelected.disabled = false;
    els.btnExtDeleteSelected.onclick = () => {
      requestConfirm(
        "Eliminar Complemento",
        `¿Estás seguro de que quieres eliminar el complemento "${ext.name}"?`,
        async () => {
          try {
            showFeedback(`Eliminando "${ext.name}"...`, "info");
            await invoke("eliminar_extension", { fileName: ext.file_name, extensionType: ext.extension_type });
            showFeedback(`Complemento "${ext.name}" eliminado correctamente.`, "success");
            loadInstalledExtensions();
          } catch (err) {
            showFeedback(`Error al eliminar: ${err}`, "error");
          }
        }
      );
    };
  }
}

export async function searchModrinth(query) {
  if (!els.listSearchResults) return;
  
  const cleanQuery = (query || "").trim();

  if (!cleanQuery) {
    await loadRecommendedExtensions();
    return;
  }

  const provider = els.selectSearchProvider ? els.selectSearchProvider.value : "modrinth";

  if (provider === "modrinth") {
    await searchModrinthInternal(cleanQuery);
  } else {
    await searchCurseForgeInternal(cleanQuery);
  }
}

let currentSearchPage = 0;
let currentSearchHits = [];
let currentSearchQuery = "";
let currentSearchProvider = "modrinth";
let currentTotalHits = 0;
let selectedSearchProject = null;

let previewRequestId = 0;

async function searchModrinthInternal(query, offsetIndex = 0) {
  const cleanQuery = (query || "").trim();
  const cleanVer = activeMcVersion && activeMcVersion.includes('|') ? activeMcVersion.split('|')[0].trim() : activeMcVersion;
  const cacheKey = getSearchCacheKey("modrinth", activeCategory, activeEngine, cleanVer, cleanQuery, offsetIndex);

  // 1. Revisar caché en memoria (0ms render)
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    currentTotalHits = cached.totalHits;
    if (offsetIndex === 0) {
      currentSearchHits = cached.hits;
      renderSearchResults(currentSearchHits, 0, cleanQuery, "modrinth");
    } else {
      currentSearchHits.push(...cached.hits);
      renderSearchResults(currentSearchHits, Math.floor(offsetIndex / 12), cleanQuery, "modrinth");
    }
    return;
  }

  const requestId = ++currentSearchRequestId;

  try {
    if (offsetIndex === 0) {
      els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Buscando en Modrinth...</p>';
      currentSearchHits = [];
    }
    const searchType = activeCategory === "plugin" ? "plugin" : activeCategory === "mod" ? "mod" : "datapack";
    
    let facets = [[`project_type:${searchType}`]];
    if (cleanVer !== "unknown" && cleanVer !== "") {
      facets.push([`versions:${cleanVer}`]);
    }
    
    if (activeEngine !== "unknown") {
      if (activeCategory === "plugin") {
        facets.push(["categories:paper", "categories:spigot", "categories:bukkit", "categories:purpur"]);
      } else if (activeCategory === "mod") {
        if (activeEngine === "fabric") facets.push(["categories:fabric"]);
        else if (activeEngine === "forge") facets.push(["categories:forge"]);
        else if (activeEngine === "neoforge") facets.push(["categories:neoforge"]);
        else if (activeEngine === "quilt") facets.push(["categories:quilt", "categories:fabric"]);
      }
    }
    
    const limit = 48;
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(cleanQuery)}&index=downloads&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=${limit}&offset=${offsetIndex}`;
    
    const response = await fetch(url, {
        headers: {
            "User-Agent": "norditex/minecraft-server-gui (gemini-agent)"
        }
    });

    if (requestId !== currentSearchRequestId) return; // Descartar petición obsoleta

    if (!response.ok) {
        throw new Error(`Error de Modrinth: ${response.status}`);
    }

    const data = await response.json();
    if (requestId !== currentSearchRequestId) return;

    currentTotalHits = data.total_hits || (data.hits ? data.hits.length : 0);
    
    // Filtrar complementos que sean exclusivamente de cliente (server_side: unsupported)
    const rawHits = data.hits || [];
    const validHits = rawHits.filter(h => {
      if (h.server_side === "unsupported") return false;
      return true;
    });

    const newHits = validHits.map(h => ({
      project_id: h.project_id,
      title: h.title,
      project_type: h.project_type,
      downloads: h.downloads,
      description: h.description,
      author: h.author || "",
      icon_url: h.icon_url,
      slug: h.slug,
      provider: "modrinth",
      gallery: h.gallery || []
    }));

    // Guardar en caché
    searchCache.set(cacheKey, { hits: newHits, totalHits: currentTotalHits });

    if (offsetIndex === 0) {
      currentSearchHits = newHits;
      renderSearchResults(currentSearchHits, 0, cleanQuery, "modrinth");
    } else {
      currentSearchHits.push(...newHits);
    }
  } catch (err) {
    if (requestId !== currentSearchRequestId) return;
    els.listSearchResults.innerHTML = `<p class="hint" style="color: var(--error); text-align: center; margin: 16px 0;">Error de red: ${err.message || err}</p>`;
  }
}

async function searchCurseForgeInternal(query, offsetIndex = 0) {
  const cleanQuery = (query || "").trim();
  const cleanVer = activeMcVersion && activeMcVersion.includes('|') ? activeMcVersion.split('|')[0].trim() : activeMcVersion;
  const cacheKey = getSearchCacheKey("curseforge", activeCategory, activeEngine, cleanVer, cleanQuery, offsetIndex);

  // 1. Revisar caché en memoria
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    currentTotalHits = cached.totalHits;
    if (offsetIndex === 0) {
      currentSearchHits = cached.hits;
      renderSearchResults(currentSearchHits, 0, cleanQuery, "curseforge");
    } else {
      currentSearchHits.push(...cached.hits);
      renderSearchResults(currentSearchHits, Math.floor(offsetIndex / 12), cleanQuery, "curseforge");
    }
    return;
  }

  const requestId = ++currentSearchRequestId;

  try {
    if (offsetIndex === 0) {
      els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Buscando en CurseForge...</p>';
      currentSearchHits = [];
    }
    
    let classId = 6; 
    if (activeCategory === "plugin") classId = 5;
    else if (activeCategory === "datapack") classId = 6945;

    const pageSize = 48;
    let url = `https://api.curse.tools/v1/cf/mods/search?gameId=432&classId=${classId}&searchFilter=${encodeURIComponent(cleanQuery)}&sortField=2&sortOrder=desc&pageSize=${pageSize}&index=${offsetIndex}`;
    
    if (cleanVer !== "unknown" && cleanVer !== "") {
      url += `&gameVersion=${cleanVer}`;
    }
    
    if (activeCategory === "mod" && activeEngine !== "unknown") {
      let modLoaderType = 0;
      if (activeEngine === "forge") modLoaderType = 1;
      else if (activeEngine === "fabric") modLoaderType = 4;
      else if (activeEngine === "quilt") modLoaderType = 5;
      else if (activeEngine === "neoforge") modLoaderType = 6;
      if (modLoaderType !== 0) {
        url += `&modLoaderType=${modLoaderType}`;
      }
    }

    const response = await fetch(url, {
        headers: {
            "User-Agent": "norditex/minecraft-server-gui (gemini-agent)"
        }
    });

    if (requestId !== currentSearchRequestId) return; // Descartar petición obsoleta

    if (!response.ok) {
        throw new Error(`Error de CurseForge: ${response.status}`);
    }

    const resData = await response.json();
    if (requestId !== currentSearchRequestId) return;

    currentTotalHits = (resData.pagination && resData.pagination.totalCount) ? resData.pagination.totalCount : (resData.data ? resData.data.length : 0);
    
    const clientOnlyKeywords = ["minimap", "client-only", "client only", "shaders", "optifine"];
    const rawData = resData.data || [];
    const validData = rawData.filter(h => {
      const summary = (h.summary || "").toLowerCase();
      const name = (h.name || "").toLowerCase();
      if (clientOnlyKeywords.some(kw => name.includes(kw) || summary.includes(kw))) {
        // Permitir solo si explícitamente tiene soporte de servidor
        if (!summary.includes("server") && !name.includes("server")) {
          return false;
        }
      }
      return true;
    });

    const newHits = validData.map(h => ({
      project_id: h.id.toString(),
      title: h.name,
      project_type: activeCategory,
      downloads: h.downloadCount,
      description: h.summary,
      author: h.authors && h.authors[0] ? h.authors[0].name : "",
      icon_url: h.logo ? h.logo.url : null,
      slug: h.slug,
      provider: "curseforge",
      screenshots: h.screenshots || (h.raw && h.raw.screenshots) || []
    }));

    // Guardar en caché
    searchCache.set(cacheKey, { hits: newHits, totalHits: currentTotalHits });

    if (offsetIndex === 0) {
      currentSearchHits = newHits;
      renderSearchResults(currentSearchHits, 0, cleanQuery, "curseforge");
    } else {
      currentSearchHits.push(...newHits);
    }
  } catch (err) {
    if (requestId !== currentSearchRequestId) return;
    els.listSearchResults.innerHTML = `<p class="hint" style="color: var(--error); text-align: center; margin: 16px 0;">Error de red: ${err.message || err}</p>`;
  }
}

export async function loadRecommendedExtensions() {
  if (!els.listSearchResults) return;
  const provider = els.selectSearchProvider ? els.selectSearchProvider.value : "modrinth";
  if (provider === "curseforge") {
    await searchCurseForgeInternal("", 0);
  } else {
    await searchModrinthInternal("", 0);
  }
}

function renderSearchResults(hits, page = 0, query = "", provider = "modrinth") {
  currentSearchHits = hits || [];
  currentSearchPage = page;
  currentSearchQuery = query;
  currentSearchProvider = provider;
  selectedSearchProject = null;
  resetPreviewPanel();

  if (!els.listSearchResults) return;
  els.listSearchResults.innerHTML = "";

  if (!hits || hits.length === 0) {
    els.listSearchResults.innerHTML = '<p class="hint" style="grid-column: 1 / -1; text-align: center; margin: 16px 0;">No se encontraron resultados.</p>';
    if (els.btnExtPagePrev) els.btnExtPagePrev.disabled = true;
    if (els.btnExtPageNext) els.btnExtPageNext.disabled = true;
    return;
  }

  // Paginación de 12 elementos por página para el grid 6x2
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(currentTotalHits ? currentTotalHits / pageSize : (hits ? hits.length / pageSize : 1)));
  const currentPageNum = page + 1;
  const start = page * pageSize;
  const pageHits = hits.slice(start, start + pageSize);

  if (els.extPageIndicator) {
    els.extPageIndicator.textContent = `Pág. ${currentPageNum} de ${totalPages}`;
  }

  if (els.btnExtPagePrev) {
    els.btnExtPagePrev.disabled = page === 0;
    els.btnExtPagePrev.onclick = () => {
      if (page > 0) renderSearchResults(hits, page - 1, query, provider);
    };
  }

  if (els.btnExtPageNext) {
    const isAtLastLoadedBatch = (start + pageSize >= hits.length);
    const hasMoreWebResults = currentTotalHits > hits.length;
    
    els.btnExtPageNext.disabled = isAtLastLoadedBatch && !hasMoreWebResults;
    els.btnExtPageNext.onclick = async () => {
      if (start + pageSize < hits.length) {
        renderSearchResults(hits, page + 1, query, provider);
      } else if (hasMoreWebResults) {
        els.btnExtPageNext.disabled = true;
        showFeedback("Cargando más resultados desde internet...", "info");
        if (provider === "modrinth") {
          await searchModrinthInternal(query, hits.length);
        } else {
          await searchCurseForgeInternal(query, hits.length);
        }
        renderSearchResults(currentSearchHits, page + 1, query, provider);
      }
    };
  }

  pageHits.forEach((project, idx) => {
    const card = document.createElement("div");
    card.className = "ext-mod-card";
    card.title = project.title || "";
    
    const iconUrl = project.icon_url || "assets/images/creeper_head.svg";
    card.innerHTML = `
      <img src="${iconUrl}" alt="${project.title}" />
      <div class="ext-mod-card-title">${project.title}</div>
    `;

    card.addEventListener("click", () => {
      const allCards = els.listSearchResults.querySelectorAll(".ext-mod-card");
      allCards.forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedSearchProject = project;
      updatePreviewPanel(project);
    });

    els.listSearchResults.appendChild(card);

    if (idx === 0) {
      card.click();
    }
  });
}

let extGallery = [];
let extGalleryIndex = -1;

function updateGalleryUI() {
  if (!extGallery || extGallery.length === 0) {
    if (els.extPreviewDesc) els.extPreviewDesc.style.display = "block";
    if (els.extPreviewGalleryWrapper) els.extPreviewGalleryWrapper.style.display = "none";
    if (els.extPreviewGalleryTitle) els.extPreviewGalleryTitle.style.display = "none";
    if (els.extGalleryBar) els.extGalleryBar.style.display = "none";
    if (els.extPreviewGalleryControls) els.extPreviewGalleryControls.style.display = "none";
    return;
  }

  if (els.extPreviewGalleryControls) els.extPreviewGalleryControls.style.display = "flex";

  if (extGalleryIndex === -1) {
    if (els.extPreviewDesc) els.extPreviewDesc.style.display = "block";
    if (els.extPreviewGalleryWrapper) els.extPreviewGalleryWrapper.style.display = "none";
    if (els.extPreviewGalleryTitle) els.extPreviewGalleryTitle.style.display = "none";
    if (els.extGalleryBar) els.extGalleryBar.style.display = "none";
    if (els.btnExtGalleryPrev) els.btnExtGalleryPrev.disabled = true;
    if (els.btnExtGalleryNext) els.btnExtGalleryNext.disabled = false;
  } else {
    if (els.extPreviewDesc) els.extPreviewDesc.style.display = "none";
    if (els.extPreviewGalleryWrapper) els.extPreviewGalleryWrapper.style.display = "block";
    const item = extGallery[extGalleryIndex];
    if (item && els.extPreviewGalleryImg) {
      els.extPreviewGalleryImg.src = item.url;
      els.extPreviewGalleryImg.style.cursor = "zoom-in";
      els.extPreviewGalleryImg.onclick = () => {
        if (item && (item.fullUrl || item.url)) {
          openImageLightbox(item.fullUrl || item.url, item.title || "Vista Previa de Complemento");
        }
      };
    }
    if (els.extPreviewGalleryTitle) {
      els.extPreviewGalleryTitle.style.display = item && item.title ? "block" : "none";
      els.extPreviewGalleryTitle.textContent = item ? item.title : `Captura ${extGalleryIndex + 1}/${extGallery.length}`;
    }
    if (els.extGalleryBar) els.extGalleryBar.style.display = "block";
    if (els.btnExtGalleryPrev) els.btnExtGalleryPrev.disabled = false;
    if (els.btnExtGalleryNext) els.btnExtGalleryNext.disabled = (extGalleryIndex >= extGallery.length - 1);
  }
}

async function loadExtensionGallery(project) {
  extGallery = [];
  extGalleryIndex = -1;

  // Si el proyecto ya trae capturas precargadas de la búsqueda, inicializar inmediatamente sin esperar al fetch
  if (project.provider === "modrinth" && project.gallery && project.gallery.length > 0) {
    extGallery = project.gallery.map((g, idx) => {
      const url = typeof g === "string" ? g : (g.url || "");
      const rawUrl = typeof g === "object" ? (g.raw_url || g.url) : url;
      const title = typeof g === "object" ? (g.title || g.description) : "";
      return {
        url: url,
        fullUrl: rawUrl || url,
        title: title || `Captura ${idx + 1}`
      };
    }).filter(item => item.url);
  } else if (project.provider === "curseforge" && project.screenshots && project.screenshots.length > 0) {
    extGallery = project.screenshots.map((s, idx) => ({
      url: s.url,
      fullUrl: s.url,
      title: s.title || s.caption || `Captura ${idx + 1}`
    })).filter(item => item.url);
  }

  updateGalleryUI();

  if (!project || !project.project_id) return;
  const reqId = ++previewRequestId;

  try {
    if (project.provider === "modrinth") {
      const res = await fetch(`https://api.modrinth.com/v2/project/${project.project_id}`, {
        headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
      });
      if (reqId !== previewRequestId) return;
      if (res.ok) {
        const data = await res.json();
        if (reqId !== previewRequestId) return;
        if (data.gallery && data.gallery.length > 0) {
          extGallery = data.gallery.map((g, idx) => ({
            url: g.url,
            fullUrl: g.raw_url || g.url,
            title: g.title || g.description || `Captura ${idx + 1}`
          })).filter(item => item.url);
          project.gallery = data.gallery;
        }
      }
    } else if (project.provider === "curseforge") {
      const res = await fetch(`https://api.curse.tools/v1/cf/mods/${project.project_id}`, {
        headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
      });
      if (reqId !== previewRequestId) return;
      if (res.ok) {
        const data = await res.json();
        if (reqId !== previewRequestId) return;
        const modData = data.data || data;
        if (modData.screenshots && modData.screenshots.length > 0) {
          extGallery = modData.screenshots.map((s, idx) => ({
            url: s.url,
            fullUrl: s.url,
            title: s.title || s.caption || `Captura ${idx + 1}`
          })).filter(item => item.url);
          project.screenshots = modData.screenshots;
        }
      }
    }
  } catch (err) {
    console.warn("Error cargando galería de complemento:", err);
  }

  if (reqId === previewRequestId) {
    updateGalleryUI();
  }
}

function resetPreviewPanel() {
  extGallery = [];
  extGalleryIndex = -1;
  updateGalleryUI();
  if (els.extPreviewTitle) els.extPreviewTitle.textContent = "Selecciona un complemento";
  if (els.extPreviewAuthor) { els.extPreviewAuthor.textContent = ""; els.extPreviewAuthor.style.display = "none"; }
  if (els.extPreviewDesc) els.extPreviewDesc.textContent = "Haz clic en un complemento de la lista para ver sus detalles y descargarlo.";
  hideVersionsState();
  if (els.btnExtSelectVersion) {
    els.btnExtSelectVersion.disabled = true;
    els.btnExtSelectVersion.onclick = null;
  }
  if (els.extSelectHint) els.extSelectHint.textContent = "Elige un complemento de la lista";
}

function updatePreviewPanel(project) {
  if (els.extPreviewTitle) els.extPreviewTitle.textContent = project.title;
  if (els.extPreviewAuthor) {
    els.extPreviewAuthor.textContent = project.author ? `Por: ${project.author}` : `Origen: ${project.provider === 'curseforge' ? 'CurseForge' : 'Modrinth'}`;
    els.extPreviewAuthor.style.display = "block";
  }
  if (els.extPreviewDesc) {
    els.extPreviewDesc.textContent = project.description || "Sin descripción disponible.";
  }

  loadExtensionGallery(project);

  hideVersionsState();

  if (els.btnExtSelectVersion) {
    els.btnExtSelectVersion.disabled = false;
    els.btnExtSelectVersion.onclick = () => showVersionsState(project);
  }
  if (els.extSelectHint) {
    if (activeEngine === "vanilla" && activeCategory !== "datapack") {
      els.extSelectHint.textContent = "Servidor Vanilla: Cambia de software para instalar mods/plugins.";
      els.extSelectHint.style.color = "#fbbf24";
    } else {
      els.extSelectHint.textContent = `${project.title || "Complemento"} seleccionado`;
      els.extSelectHint.style.color = "#888";
    }
  }
}

function hideVersionsState() {
  if (els.extSelectState) els.extSelectState.style.display = "flex";
  if (els.extVersionsState) els.extVersionsState.style.display = "none";
}

async function showVersionsState(project) {
  if (!els.extSelectState || !els.extVersionsState) return;

  els.extSelectState.style.display = "none";
  els.extVersionsState.style.display = "flex";

  // Determinar loaders disponibles segun el motor del servidor
  const isPluginEngine = ["paper", "purpur"].includes(activeEngine);
  const modEngines = ["fabric", "forge", "neoforge", "quilt"];
  const isModEngine = modEngines.includes(activeEngine);
  const isVanilla = activeEngine === "vanilla";

  const availableLoaders = [];
  if (isPluginEngine) availableLoaders.push("plugin");
  if (isModEngine) availableLoaders.push(activeEngine);

  // En servidores Vanilla, no habilitar loaders de mods/plugins incompatibles
  if (!isVanilla && availableLoaders.length === 0) {
    availableLoaders.push("plugin", "fabric", "forge", "neoforge");
  }

  let selectedLoader = activeCategory === "plugin" ? "plugin"
    : (isModEngine ? activeEngine : (availableLoaders[0] || "fabric"));

  // Activar boton de loader correcto y bloquear los no disponibles
  const loaderGroup = els.extVersionsLoaderGroup;
  if (loaderGroup) {
    loaderGroup.querySelectorAll(".mc-btn-group-item").forEach(btn => {
      const val = btn.dataset.value;
      const isAvailable = availableLoaders.includes(val);
      const isActive = val === selectedLoader && isAvailable;
      btn.classList.toggle("active", isActive);
      btn.disabled = !isAvailable;
      btn.style.opacity = isAvailable ? "1" : "0.35";
      btn.style.cursor = isAvailable ? "pointer" : "not-allowed";
    });
  }

  if (isVanilla && activeCategory !== "datapack") {
    if (els.extVersionsSelect) {
      els.extVersionsSelect.innerHTML = '<option value="">Incompatible con Vanilla</option>';
      els.extVersionsSelect.disabled = true;
    }
    if (els.extVersionsHint) {
      els.extVersionsHint.textContent = "Los servidores Vanilla no admiten mods ni plugins. Usa DATAPACKS.";
      els.extVersionsHint.style.color = "#fbbf24";
    }
    if (els.btnExtDownloadVersion) els.btnExtDownloadVersion.disabled = true;
    return;
  }

  // Funcion interna de carga de versiones para el loader seleccionado
  async function loadVersionsForLoader(loader) {
    if (els.extVersionsSelect) {
      els.extVersionsSelect.innerHTML = '<option value="">Cargando versiones...</option>';
    }
    if (els.extVersionsHint) els.extVersionsHint.textContent = "";

    try {
      let versions = [];
      const projectId = project.project_id || project.slug;

      if (project.provider === "modrinth") {
        let loaders = [];
        if (loader === "plugin") loaders = ["paper", "spigot", "bukkit", "purpur"];
        else if (loader === "fabric") loaders = ["fabric"];
        else if (loader === "forge") loaders = ["forge"];
        else if (loader === "neoforge") loaders = ["neoforge"];
        else if (loader === "quilt") loaders = ["quilt", "fabric"];

        let url = `https://api.modrinth.com/v2/project/${projectId}/version`;
        const params = [];
        if (loaders.length > 0) params.push(`loaders=${encodeURIComponent(JSON.stringify(loaders))}`);
        if (activeMcVersion !== "unknown") params.push(`game_versions=${encodeURIComponent(JSON.stringify([activeMcVersion]))}`);
        if (params.length > 0) url += "?" + params.join("&");
        const res = await fetch(url, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } });
        if (res.ok) versions = await res.json();
      } else if (project.provider === "curseforge") {
        let url = `https://api.curse.tools/v1/cf/mods/${projectId}/files?`;
        const params = [];
        if (activeMcVersion !== "unknown") params.push(`gameVersion=${activeMcVersion}`);
        if (loader !== "plugin") {
          const loaderMap = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
          const lt = loaderMap[loader];
          if (lt) params.push(`modLoaderType=${lt}`);
        }
        url += params.join("&");
        const res = await fetch(url, { headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" } });
        if (res.ok) {
          const data = await res.json();
          const cfLoaders = ["fabric", "forge", "neoforge", "quilt", "bukkit", "spigot", "paper"];
          versions = (data.data || []).map(file => {
            const loaders = [], gameVersions = [];
            (file.gameVersions || []).forEach(gv => {
              if (cfLoaders.includes(gv.toLowerCase())) loaders.push(gv.toLowerCase());
              else gameVersions.push(gv);
            });
            return { id: String(file.id), name: file.displayName, game_versions: gameVersions, loaders, files: [{ url: file.downloadUrl, filename: file.fileName, primary: true }], dependencies: file.dependencies || [] };
          });
        }
      }

      if (els.extVersionsSelect) {
        els.extVersionsSelect.innerHTML = "";
        if (!versions || versions.length === 0) {
          els.extVersionsSelect.innerHTML = '<option value="">Sin versiones disponibles</option>';
          if (els.extVersionsHint) {
            els.extVersionsHint.textContent = "No se encontraron versiones para este loader.";
            els.extVersionsHint.style.color = "#f87171";
          }
        } else {
          els.extVersionsSelect._versionsData = versions;
          versions.forEach((v, i) => {
            const opt = document.createElement("option");
            opt.value = i;
            const mcVers = v.game_versions.slice(0, 2).join(", ") + (v.game_versions.length > 2 ? "..." : "");
            opt.textContent = `${v.name} [${mcVers}]`;
            els.extVersionsSelect.appendChild(opt);
          });
          if (els.extVersionsHint) {
            const loaderLabel = loader.charAt(0).toUpperCase() + loader.slice(1);
            const mcInfo = activeMcVersion !== "unknown" ? ` (MC ${activeMcVersion})` : "";
            els.extVersionsHint.textContent = `${versions.length} versiones de ${loaderLabel} obtenidas${mcInfo}.`;
            els.extVersionsHint.style.color = "#6ee7b7";
          }
        }
      }
    } catch (err) {
      if (els.extVersionsSelect) {
        els.extVersionsSelect.innerHTML = `<option value="">Error: ${err.message}</option>`;
      }
      if (els.extVersionsHint) {
        els.extVersionsHint.textContent = `Error al cargar: ${err.message}`;
        els.extVersionsHint.style.color = "#f87171";
      }
    }
  }

  // Cargar versiones iniciales
  await loadVersionsForLoader(selectedLoader);

  // Cambio de loader al hacer click en los botones
  if (loaderGroup) {
    loaderGroup.querySelectorAll(".mc-btn-group-item").forEach(btn => {
      btn.onclick = async () => {
        loaderGroup.querySelectorAll(".mc-btn-group-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedLoader = btn.dataset.value;
        await loadVersionsForLoader(selectedLoader);
      };
    });
  }

  // Boton Descargar
  if (els.btnExtDownloadVersion) {
    els.btnExtDownloadVersion.disabled = false;
    els.btnExtDownloadVersion.textContent = "Descargar";
    els.btnExtDownloadVersion.onclick = async () => {
      const idx = parseInt(els.extVersionsSelect.value);
      const versData = els.extVersionsSelect._versionsData;
      if (!versData || isNaN(idx)) return;
      const v = versData[idx];
      const downloadFile = v.files.find(f => f.primary) || v.files[0];
      if (!downloadFile) return;
      els.btnExtDownloadVersion.disabled = true;
      els.btnExtDownloadVersion.textContent = "Descargando...";
      try {
        await resolveAndDownloadDependencies(v, project.provider);
        showFeedback(`Descargando: ${project.title}...`, "info");
        await invoke("instalar_extension", {
          downloadUrl: downloadFile.url,
          fileName: downloadFile.filename,
          extensionType: activeCategory
        });
        showFeedback(`Instalación de "${project.title}" completada.`, "success");
        hideVersionsState();
      } catch (err) {
        els.btnExtDownloadVersion.disabled = false;
        els.btnExtDownloadVersion.textContent = "Descargar";
        showFeedback(`Error: ${err.message || err}`, "error");
      }
    };
  }

  // Boton Cancelar
  if (els.btnExtCancelVersion) {
    els.btnExtCancelVersion.onclick = () => hideVersionsState();
  }
}

export async function showPreview(projectId, projectTitle, projectType, provider, slug) {
  if (!els.extensionPreviewDialog) return;

  // Reset dialog view
  if (els.extPreviewDialogTitle) els.extPreviewDialogTitle.textContent = projectTitle;
  else if (els.extPreviewTitle) els.extPreviewTitle.textContent = projectTitle;

  els.extPreviewIcon.src = "https://placehold.co/64x64?text=Mc";
  els.extPreviewType.textContent = projectType;
  
  let typeBg = "rgba(234, 179, 8, 0.2)";
  let typeColor = "#eab308";
  let typeBorder = "rgba(234, 179, 8, 0.4)";
  if (projectType === "plugin") {
    typeBg = "rgba(79, 70, 229, 0.2)";
    typeColor = "#818cf8";
    typeBorder = "rgba(79, 70, 229, 0.4)";
  } else if (projectType === "mod") {
    typeBg = "rgba(16, 185, 129, 0.2)";
    typeColor = "#34d399";
    typeBorder = "rgba(16, 185, 129, 0.4)";
  }
  els.extPreviewType.style = `font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase; background: ${typeBg}; color: ${typeColor}; border: 1px solid ${typeBorder};`;

  els.extPreviewDownloads.textContent = "";
  if (els.extPreviewDialogAuthor) els.extPreviewDialogAuthor.textContent = "";
  else if (els.extPreviewAuthor) els.extPreviewAuthor.textContent = "";
  els.extPreviewGallery.innerHTML = "";
  els.extPreviewGalleryContainer.hidden = true;
  els.panelPreviewDesc.innerHTML = "Cargando detalles...";
  els.extPreviewVersionsList.innerHTML = "Cargando versiones...";

  // Reset active tab to Description
  els.tabPreviewDesc.classList.add("active");
  els.tabPreviewVersions.classList.remove("active");
  els.panelPreviewDesc.hidden = false;
  els.panelPreviewVersions.hidden = true;

  els.extensionPreviewDialog.showModal();

  try {
    if (provider === "modrinth") {
      await loadModrinthPreview(projectId, projectTitle, projectType);
    } else {
      await loadCurseForgePreview(projectId, projectTitle, projectType);
    }
  } catch (err) {
    els.panelPreviewDesc.textContent = `Error al cargar detalles: ${err.message || err}`;
  }
}

async function loadModrinthPreview(projectId, projectTitle, projectType) {
  const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}`, {
    headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
  });
  if (!res.ok) throw new Error(`Error Modrinth: ${res.status}`);
  const project = await res.json();

  els.extPreviewIcon.src = project.icon_url || "https://placehold.co/64x64?text=Mc";
  els.extPreviewDownloads.textContent = `📥 ${project.downloads.toLocaleString()} descargas`;
  const authorText = `Slug: ${project.slug}`;
  if (els.extPreviewDialogAuthor) els.extPreviewDialogAuthor.textContent = authorText;
  else if (els.extPreviewAuthor) els.extPreviewAuthor.textContent = authorText;

  // Gallery
  if (project.gallery && project.gallery.length > 0) {
    els.extPreviewGalleryContainer.hidden = false;
    project.gallery.forEach(img => {
      const gImg = document.createElement("img");
      gImg.src = img.url;
      gImg.style = "height: 100px; border-radius: 6px; border: 1px solid var(--border-color); object-fit: contain; cursor: pointer;";
      gImg.onclick = () => window.open(img.url, "_blank");
      els.extPreviewGallery.appendChild(gImg);
    });
  }

  // Render basic markdown description
  let html = project.body || "No hay descripción disponible.";
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  els.panelPreviewDesc.innerHTML = html;

  await loadModrinthVersions(projectId, projectTitle, projectType);
}

async function loadCurseForgePreview(projectId, projectTitle, projectType) {
  const res = await fetch(`https://api.curse.tools/v1/cf/mods/${projectId}`, {
    headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
  });
  if (!res.ok) throw new Error(`Error CurseForge: ${res.status}`);
  const mod = await res.json();
  const data = mod.data;

  els.extPreviewIcon.src = data.logo ? data.logo.url : "https://placehold.co/64x64?text=Mc";
  els.extPreviewDownloads.textContent = `📥 ${data.downloadCount.toLocaleString()} descargas`;
  const cfAuthorText = data.authors && data.authors[0] ? `Autor: ${data.authors[0].name}` : `Slug: ${data.slug}`;
  if (els.extPreviewDialogAuthor) els.extPreviewDialogAuthor.textContent = cfAuthorText;
  else if (els.extPreviewAuthor) els.extPreviewAuthor.textContent = cfAuthorText;

  // Gallery
  if (data.screenshots && data.screenshots.length > 0) {
    els.extPreviewGalleryContainer.hidden = false;
    data.screenshots.forEach(img => {
      const gImg = document.createElement("img");
      gImg.src = img.url;
      gImg.style = "height: 100px; border-radius: 6px; border: 1px solid var(--border-color); object-fit: contain; cursor: pointer;";
      gImg.onclick = () => window.open(img.url, "_blank");
      els.extPreviewGallery.appendChild(gImg);
    });
  }

  const descRes = await fetch(`https://api.curse.tools/v1/cf/mods/${projectId}/description`, {
    headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
  });
  if (descRes.ok) {
    const descData = await descRes.json();
    els.panelPreviewDesc.innerHTML = descData.data || "No hay descripción disponible.";
  } else {
    els.panelPreviewDesc.textContent = data.summary || "No hay descripción disponible.";
  }

  await loadCurseForgeVersions(projectId, projectTitle, projectType);
}

async function loadModrinthVersions(projectId, projectTitle, projectType) {
  try {
    let loaders = [];
    if (activeCategory === "plugin") {
      loaders = ["paper", "spigot", "bukkit", "purpur"];
    } else if (activeCategory === "mod") {
      if (activeEngine === "fabric") loaders = ["fabric"];
      else if (activeEngine === "forge") loaders = ["forge"];
      else if (activeEngine === "neoforge") loaders = ["neoforge"];
      else if (activeEngine === "quilt") loaders = ["quilt", "fabric"];
    }
    
    let url = `https://api.modrinth.com/v2/project/${projectId}/version`;
    let queryParams = [];
    if (loaders.length > 0) queryParams.push(`loaders=${encodeURIComponent(JSON.stringify(loaders))}`);
    if (activeMcVersion !== "unknown") queryParams.push(`game_versions=${encodeURIComponent(JSON.stringify([activeMcVersion]))}`);
    
    if (queryParams.length > 0) {
      url += `?` + queryParams.join("&");
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
    });
    if (!response.ok) throw new Error("No se pudieron obtener las versiones del servidor.");
    const versions = await response.json();
    
    renderVersionsList(versions, "modrinth", projectTitle, projectType);
  } catch (err) {
    els.extPreviewVersionsList.innerHTML = `<p class="hint" style="color: var(--error);">Error al cargar versiones: ${err.message || err}</p>`;
  }
}

async function loadCurseForgeVersions(projectId, projectTitle, projectType) {
  try {
    let url = `https://api.curse.tools/v1/cf/mods/${projectId}/files?`;
    let queryParams = [];
    if (activeMcVersion !== "unknown") queryParams.push(`gameVersion=${activeMcVersion}`);
    
    if (activeCategory === "mod" && activeEngine !== "unknown") {
      let modLoaderType = 0;
      if (activeEngine === "forge") modLoaderType = 1;
      else if (activeEngine === "fabric") modLoaderType = 4;
      else if (activeEngine === "quilt") modLoaderType = 5;
      else if (activeEngine === "neoforge") modLoaderType = 6;
      if (modLoaderType !== 0) queryParams.push(`modLoaderType=${modLoaderType}`);
    }

    url += queryParams.join("&");

    const response = await fetch(url, {
      headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
    });
    if (!response.ok) throw new Error("No se pudieron obtener los archivos de CurseForge.");
    const resData = await response.json();
    
    const versions = (resData.data || []).map(file => {
      const loaders = [];
      const gameVersions = [];
      const cfLoaders = ["fabric", "forge", "neoforge", "quilt", "bukkit", "spigot", "paper"];
      
      file.gameVersions.forEach(gv => {
        const lower = gv.toLowerCase();
        if (cfLoaders.includes(lower)) {
          loaders.push(lower);
        } else {
          gameVersions.push(gv);
        }
      });

      return {
        id: file.id.toString(),
        name: file.displayName,
        game_versions: gameVersions,
        loaders: loaders,
        files: [{
          url: file.downloadUrl,
          filename: file.fileName,
          primary: true
        }],
        dependencies: file.dependencies || []
      };
    });

    renderVersionsList(versions, "curseforge", projectTitle, projectType);
  } catch (err) {
    els.extPreviewVersionsList.innerHTML = `<p class="hint" style="color: var(--error);">Error al cargar versiones: ${err.message || err}</p>`;
  }
}

function renderVersionsList(versions, provider, projectTitle, projectType) {
  els.extPreviewVersionsList.innerHTML = "";

  if (!versions || versions.length === 0) {
    els.extPreviewVersionsList.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No se encontraron versiones disponibles.</p>';
    return;
  }

  const compatibleVersions = versions.filter(v => {
    if (activeMcVersion !== "unknown" && !v.game_versions.includes(activeMcVersion)) {
      return false;
    }

    if (activeCategory === "plugin") {
      const validLoaders = ["paper", "spigot", "bukkit", "purpur"];
      if (!v.loaders.some(l => validLoaders.includes(l))) {
        return false;
      }
    } else if (activeCategory === "mod") {
      if (activeEngine === "fabric") {
        if (!v.loaders.includes("fabric")) return false;
      } else if (activeEngine === "forge") {
        if (!v.loaders.includes("forge")) return false;
      } else if (activeEngine === "neoforge") {
        if (!v.loaders.includes("neoforge")) return false;
      } else if (activeEngine === "quilt") {
        if (!v.loaders.includes("quilt") && !v.loaders.includes("fabric")) return false;
      } else {
        if (!v.loaders.includes("fabric") && !v.loaders.includes("forge") && !v.loaders.includes("neoforge")) return false;
      }
    }
    
    return true;
  });

  if (compatibleVersions.length === 0) {
    const loaderInfo = activeCategory === "plugin" ? "Paper/Spigot" : activeEngine.toUpperCase();
    const mcInfo = activeMcVersion === "unknown" ? "cualquier versión" : `versión ${activeMcVersion}`;
    els.extPreviewVersionsList.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0; color: var(--error); font-weight: 500;">No hay versiones disponibles compatibles con tu servidor (${loaderInfo} - Minecraft ${mcInfo}).</p>`;
    return;
  }

  const displayedVersions = compatibleVersions.slice(0, 30);

  displayedVersions.forEach(v => {
    const container = document.createElement("div");
    container.className = "minecraft-table";
    container.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-panel); border: 2px solid #111; gap: 12px; margin-bottom: 6px;";

    const info = document.createElement("div");
    info.style = "display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;";

    const name = document.createElement("strong");
    name.style = "font-size: 0.9rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
    name.textContent = v.name;

    const details = document.createElement("span");
    details.style = "font-size: 0.8rem; color: var(--text-secondary);";
    
    const gameVers = v.game_versions.slice(0, 3).join(", ") + (v.game_versions.length > 3 ? "..." : "");
    const loaders = v.loaders.join(", ");
    details.textContent = `Minecraft: [${gameVers}] | Loader: [${loaders}]`;

    info.appendChild(name);
    info.appendChild(details);

    const downloadFile = v.files.find(f => f.primary) || v.files[0];

    if (downloadFile) {
      const btnDownload = document.createElement("button");
      btnDownload.type = "button";
      btnDownload.className = "mc-btn-primary btn-small";
      btnDownload.style = "flex-shrink: 0;";
      btnDownload.textContent = "Descargar";
      btnDownload.onclick = async () => {
        btnDownload.disabled = true;
        btnDownload.textContent = "Descargando...";
        
        try {
          await resolveAndDownloadDependencies(v, provider);
          
          showFeedback(`Descargando complemento principal: ${projectTitle}...`, "info");
          await invoke("instalar_extension", {
            downloadUrl: downloadFile.url,
            fileName: downloadFile.filename,
            extensionType: activeCategory
          });
          
          showFeedback(`Instalación de "${projectTitle}" completada con éxito.`, "success");
          els.extensionPreviewDialog.close();
          
          if (activeSubTab === "installed") {
            loadInstalledExtensions();
          }
        } catch (err) {
          btnDownload.disabled = false;
          btnDownload.textContent = "Descargar";
          showFeedback(`Error al descargar: ${err.message || err}`, "error");
        }
      };
      container.appendChild(btnDownload);
    }

    container.appendChild(info);
    els.extPreviewVersionsList.appendChild(container);
  });
}

async function resolveAndDownloadDependencies(versionObject, provider) {
  if (!versionObject.dependencies || versionObject.dependencies.length === 0) return;

  if (provider === "modrinth") {
    const required = versionObject.dependencies.filter(d => d.dependency_type === "required");
    if (required.length === 0) return;

    for (const dep of required) {
      if (!dep.project_id) continue;
      
      showFeedback(`Resolviendo dependencia de Modrinth: ID ${dep.project_id}...`, "info");
      
      const pRes = await fetch(`https://api.modrinth.com/v2/project/${dep.project_id}`, {
        headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
      });
      if (!pRes.ok) continue;
      const pData = await pRes.json();
      
      let loaders = [];
      if (activeCategory === "plugin") {
        loaders = ["paper", "spigot", "bukkit", "purpur"];
      } else if (activeCategory === "mod") {
        if (activeEngine === "fabric") loaders = ["fabric"];
        else if (activeEngine === "forge") loaders = ["forge"];
        else if (activeEngine === "neoforge") loaders = ["neoforge"];
        else if (activeEngine === "quilt") loaders = ["quilt", "fabric"];
      }
      
      let url = `https://api.modrinth.com/v2/project/${dep.project_id}/version`;
      let queryParams = [];
      if (loaders.length > 0) queryParams.push(`loaders=${encodeURIComponent(JSON.stringify(loaders))}`);
      if (activeMcVersion !== "unknown") queryParams.push(`game_versions=${encodeURIComponent(JSON.stringify([activeMcVersion]))}`);
      if (queryParams.length > 0) url += `?` + queryParams.join("&");

      const vRes = await fetch(url, {
        headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
      });
      if (!vRes.ok) continue;
      const versions = await vRes.json();
      
      const compVersion = versions.find(v => {
        if (activeMcVersion !== "unknown" && !v.game_versions.includes(activeMcVersion)) return false;
        
        if (activeCategory === "plugin") {
          return v.loaders.some(l => ["paper", "spigot", "bukkit"].includes(l));
        } else if (activeCategory === "mod") {
          if (activeEngine === "fabric") return v.loaders.includes("fabric");
          if (activeEngine === "forge") return v.loaders.includes("forge");
          if (activeEngine === "neoforge") return v.loaders.includes("neoforge");
          if (activeEngine === "quilt") return v.loaders.includes("quilt") || v.loaders.includes("fabric");
        }
        return true;
      });
      
      if (compVersion) {
        const file = compVersion.files.find(f => f.primary) || compVersion.files[0];
        if (file) {
          showFeedback(`Descargando dependencia requerida: ${pData.title}...`, "info");
          await invoke("instalar_extension", {
            downloadUrl: file.url,
            fileName: file.filename,
            extensionType: activeCategory
          });
        }
      }
    }
  } else {
    const required = versionObject.dependencies.filter(d => d.relationType === 3);
    if (required.length === 0) return;

    for (const dep of required) {
      if (!dep.modId) continue;

      showFeedback(`Resolviendo dependencia de CurseForge: ID ${dep.modId}...`, "info");

      const pRes = await fetch(`https://api.curse.tools/v1/cf/mods/${dep.modId}`, {
        headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
      });
      if (!pRes.ok) continue;
      const pResJson = await pRes.json();
      const pData = pResJson.data;

      let url = `https://api.curse.tools/v1/cf/mods/${dep.modId}/files?`;
      let queryParams = [];
      if (activeMcVersion !== "unknown") queryParams.push(`gameVersion=${activeMcVersion}`);
      
      if (activeCategory === "mod" && activeEngine !== "unknown") {
        let modLoaderType = 0;
        if (activeEngine === "forge") modLoaderType = 1;
        else if (activeEngine === "fabric") modLoaderType = 4;
        else if (activeEngine === "quilt") modLoaderType = 5;
        else if (activeEngine === "neoforge") modLoaderType = 6;
        if (modLoaderType !== 0) queryParams.push(`modLoaderType=${modLoaderType}`);
      }
      url += queryParams.join("&");

      const fRes = await fetch(url, {
        headers: { "User-Agent": "norditex/minecraft-server-gui (gemini-agent)" }
      });
      if (!fRes.ok) continue;
      const fResJson = await fRes.json();
      const files = fResJson.data || [];

      const compFile = files.find(file => {
        if (activeMcVersion !== "unknown" && !file.gameVersions.includes(activeMcVersion)) return false;
        
        const fileLoaders = file.gameVersions.map(gv => gv.toLowerCase());
        
        if (activeCategory === "plugin") {
          return fileLoaders.some(l => ["paper", "spigot", "bukkit"].includes(l));
        } else if (activeCategory === "mod") {
          if (activeEngine === "fabric") return fileLoaders.includes("fabric");
          if (activeEngine === "forge") return fileLoaders.includes("forge");
          if (activeEngine === "neoforge") return fileLoaders.includes("neoforge");
          if (activeEngine === "quilt") return fileLoaders.includes("quilt") || fileLoaders.includes("fabric");
        }
        return true;
      });

      if (compFile && compFile.downloadUrl) {
        showFeedback(`Descargando dependencia requerida: ${pData.name}...`, "info");
        await invoke("instalar_extension", {
          downloadUrl: compFile.downloadUrl,
          fileName: compFile.fileName,
          extensionType: activeCategory
        });
      }
    }
  }
}

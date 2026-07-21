import { invoke } from "./api.js";
import { els } from "./dom.js";
import { showFeedback, requestConfirm } from "./utils.js";

// Variable de estado local para el motor y la categoría activa
export let activeEngine = "vanilla";
export let activeCategory = "datapack"; // "plugin" | "mod" | "datapack"
export let activeSubTab = "installed"; // "installed" | "search"
export let activeMcVersion = "unknown";

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

export async function initExtensionsPage() {
  try {
    showFeedback("Detectando motor y versión del servidor...", "info");
    const engine = await invoke("detectar_motor_servidor");
    activeEngine = engine;
    
    const mcVersion = await invoke("detectar_version_minecraft");
    activeMcVersion = mcVersion;
    
    // Configurar etiqueta del motor y versión
    if (els.extensionsEngineHint) {
      const versionStr = mcVersion === "unknown" ? "Versión no detectada" : mcVersion;
      els.extensionsEngineHint.textContent = `Motor del servidor: ${ENGINE_LABELS[engine] || engine.toUpperCase()} - Minecraft ${versionStr}`;
    }

    const isModsSupported = ["fabric", "forge", "neoforge", "quilt"].includes(engine);
    const isPluginsSupported = ["paper", "purpur"].includes(engine);

    // Configurar visibilidad de las pestañas de categorías superiores
    if (els.tabCategoryPlugins) {
      els.tabCategoryPlugins.style.display = isPluginsSupported ? "inline-block" : "none";
    }
    if (els.tabCategoryMods) {
      els.tabCategoryMods.style.display = isModsSupported ? "inline-block" : "none";
    }
    // Datapacks siempre visible
    if (els.tabCategoryDatapacks) {
      els.tabCategoryDatapacks.style.display = "inline-block";
    }

    // Establecer categoría inicial por defecto según el motor
    if (isPluginsSupported) {
      activeCategory = "plugin";
      selectCategoryTab(els.tabCategoryPlugins);
    } else if (isModsSupported) {
      activeCategory = "mod";
      selectCategoryTab(els.tabCategoryMods);
    } else {
      activeCategory = "datapack";
      selectCategoryTab(els.tabCategoryDatapacks);
    }

    // Resetear subpestaña a "installed"
    if (els.tabViewInstalled) {
      els.tabViewInstalled.click();
    }
  } catch (err) {
    showFeedback(`Error al inicializar gestor de extensiones: ${err}`, "error");
  }
}

function selectCategoryTab(activeButton) {
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

      const iconUrl = ext.icon_url || "assets/creeper_head.svg";
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
  
  const cleanQuery = query.trim();

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

async function searchModrinthInternal(query, page = 0) {
  try {
    if (page === 0) els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Buscando en Modrinth...</p>';
    const searchType = activeCategory === "plugin" ? "plugin" : activeCategory === "mod" ? "mod" : "datapack";
    
    let facets = [[`project_type:${searchType}`]];
    if (activeMcVersion !== "unknown") {
      facets.push([`versions:${activeMcVersion}`]);
    }
    
    if (activeEngine !== "unknown") {
      if (activeCategory === "plugin") {
        facets.push(["categories:paper", "categories:spigot", "categories:bukkit", "categories:purpur"]);
      } else if (activeCategory === "mod") {
        if (activeEngine === "fabric") facets.push(["categories:fabric"]);
        else if (activeEngine === "forge") facets.push(["categories:forge"]);
        else if (activeEngine === "neoforge") facets.push(["categories:neoforge", "categories:forge"]);
        else if (activeEngine === "quilt") facets.push(["categories:quilt", "categories:fabric"]);
      }
    }
    
    const limit = 20;
    const offset = page * limit;
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=${limit}&offset=${offset}`;
    
    const response = await fetch(url, {
        headers: {
            "User-Agent": "norditex/minecraft-server-gui (gemini-agent)"
        }
    });

    if (!response.ok) {
        throw new Error(`Error de Modrinth: ${response.status}`);
    }

    const data = await response.json();
    
    const hits = (data.hits || []).map(h => ({
      project_id: h.project_id,
      title: h.title,
      project_type: h.project_type,
      downloads: h.downloads,
      description: h.description,
      author: h.author || "",
      icon_url: h.icon_url,
      slug: h.slug,
      provider: "modrinth"
    }));

    renderSearchResults(hits, page, query, "modrinth");
  } catch (err) {
    els.listSearchResults.innerHTML = `<p class="hint" style="color: var(--error); text-align: center; margin: 16px 0;">Error de red: ${err.message || err}</p>`;
  }
}

async function searchCurseForgeInternal(query, page = 0) {
  try {
    if (page === 0) els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Buscando en CurseForge...</p>';
    
    let classId = 6; 
    if (activeCategory === "plugin") classId = 5;
    else if (activeCategory === "datapack") classId = 6945;

    const pageSize = 20;
    const index = page * pageSize;
    let url = `https://api.curse.tools/v1/cf/mods/search?gameId=432&classId=${classId}&searchFilter=${encodeURIComponent(query)}&pageSize=${pageSize}&index=${index}`;
    
    if (activeMcVersion !== "unknown") {
      url += `&gameVersion=${activeMcVersion}`;
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

    if (!response.ok) {
        throw new Error(`Error de CurseForge: ${response.status}`);
    }

    const resData = await response.json();
    
    const hits = (resData.data || []).map(h => ({
      project_id: h.id.toString(),
      title: h.name,
      project_type: activeCategory,
      downloads: h.downloadCount,
      description: h.summary,
      author: h.authors && h.authors[0] ? h.authors[0].name : "",
      icon_url: h.logo ? h.logo.url : null,
      slug: h.slug,
      provider: "curseforge"
    }));

    renderSearchResults(hits, page, query, "curseforge");
  } catch (err) {
    els.listSearchResults.innerHTML = `<p class="hint" style="color: var(--error); text-align: center; margin: 16px 0;">Error de red: ${err.message || err}</p>`;
  }
}

export async function loadRecommendedExtensions() {
  if (!els.listSearchResults) return;

  const slugs = RECOMMENDED_SLUGS[activeCategory];
  if (!slugs || slugs.length === 0) {
    els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No hay recomendaciones disponibles para esta categoría.</p>';
    return;
  }

  try {
    els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Cargando recomendaciones...</p>';
    
    const response = await fetch(`https://api.modrinth.com/v2/projects?ids=${JSON.stringify(slugs)}`, {
        headers: {
            "User-Agent": "norditex/minecraft-server-gui (gemini-agent)"
        }
    });

    if (!response.ok) {
      throw new Error(`Error al obtener recomendados: ${response.status}`);
    }

    const projects = await response.json();
    
    const mappedHits = projects.map(p => ({
      project_id: p.id,
      title: p.title,
      project_type: p.project_type,
      downloads: p.downloads,
      description: p.description,
      author: "", 
      icon_url: p.icon_url,
      slug: p.slug,
      provider: "modrinth"
    }));

    els.listSearchResults.innerHTML = "";
    
    const header = document.createElement("h3");
    header.style = "margin: 0 0 12px; font-size: 1.1rem; color: #fff; font-weight: 600;";
    header.textContent = `Descargas Recomendadas (${activeCategory === "plugin" ? "Plugins" : activeCategory === "mod" ? "Mods" : "Datapacks"})`;
    els.listSearchResults.appendChild(header);

    const container = document.createElement("div");
    container.style = "display: flex; flex-direction: column; gap: 16px;";
    els.listSearchResults.appendChild(container);

    renderSearchResultsInto(mappedHits, container);
  } catch (err) {
    els.listSearchResults.innerHTML = `<p class="hint" style="color: var(--error); text-align: center; margin: 16px 0;">Error al cargar sugerencias: ${err.message || err}</p>`;
  }
}

let currentSearchPage = 0;
let currentSearchHits = [];
let currentSearchQuery = "";
let currentSearchProvider = "modrinth";
let selectedSearchProject = null;

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
    els.listSearchResults.innerHTML = '<p class="hint" style="grid-column: span 3; text-align: center; margin: 16px 0;">No se encontraron resultados.</p>';
    if (els.btnExtPagePrev) els.btnExtPagePrev.disabled = true;
    if (els.btnExtPageNext) els.btnExtPageNext.disabled = true;
    return;
  }

  // Paginación de 6 elementos por página para el grid 2x3
  const pageSize = 6;
  const totalPages = Math.ceil(hits.length / pageSize);
  const start = page * pageSize;
  const pageHits = hits.slice(start, start + pageSize);

  if (els.btnExtPagePrev) {
    els.btnExtPagePrev.disabled = page === 0;
    els.btnExtPagePrev.onclick = () => {
      if (page > 0) renderSearchResults(hits, page - 1, query, provider);
    };
  }

  if (els.btnExtPageNext) {
    els.btnExtPageNext.disabled = (page >= totalPages - 1 && hits.length < 20);
    els.btnExtPageNext.onclick = async () => {
      if (page < totalPages - 1) {
        renderSearchResults(hits, page + 1, query, provider);
      } else if (hits.length >= 20) {
        if (provider === "modrinth") {
          await searchModrinthInternal(query, Math.floor(hits.length / 20));
        } else {
          await searchCurseForgeInternal(query, Math.floor(hits.length / 20));
        }
      }
    };
  }

  pageHits.forEach((project, idx) => {
    const card = document.createElement("div");
    card.className = "ext-mod-card";
    
    const iconUrl = project.icon_url || "assets/creeper_head.svg";
    card.innerHTML = `
      <img src="${iconUrl}" />
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

function resetPreviewPanel() {
  if (els.extPreviewTitle) els.extPreviewTitle.textContent = "Selecciona un complemento";
  if (els.extPreviewAuthor) { els.extPreviewAuthor.textContent = ""; els.extPreviewAuthor.style.display = "none"; }
  if (els.extPreviewDesc) els.extPreviewDesc.textContent = "Haz clic en un complemento de la lista para ver sus detalles y descargarlo.";
  if (els.btnExtInstallSelected) {
    els.btnExtInstallSelected.disabled = true;
    els.btnExtInstallSelected.style.opacity = "0.5";
  }
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

  if (els.btnExtInstallSelected) {
    els.btnExtInstallSelected.disabled = false;
    els.btnExtInstallSelected.style.opacity = "1";
    els.btnExtInstallSelected.onclick = () => {
      showPreview(project.project_id || project.slug, project.title, project.project_type, project.provider, project.slug);
    };
  }
}

export async function showPreview(projectId, projectTitle, projectType, provider, slug) {
  if (!els.extensionPreviewDialog) return;

  // Reset dialog view
  els.extPreviewTitle.textContent = projectTitle;
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
  els.extPreviewAuthor.textContent = "";
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
  els.extPreviewAuthor.textContent = `Slug: ${project.slug}`;

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
  els.extPreviewAuthor.textContent = data.authors && data.authors[0] ? `Autor: ${data.authors[0].name}` : `Slug: ${data.slug}`;

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
      else if (activeEngine === "neoforge") loaders = ["neoforge", "forge"];
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
        if (!v.loaders.includes("neoforge") && !v.loaders.includes("forge")) return false;
      } else if (activeEngine === "quilt") {
        if (!v.loaders.includes("quilt") && !v.loaders.includes("fabric")) return false;
      } else {
        if (!v.loaders.includes("fabric") && !v.loaders.includes("forge")) return false;
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
        else if (activeEngine === "neoforge") loaders = ["neoforge", "forge"];
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
          if (activeEngine === "neoforge") return v.loaders.includes("neoforge") || v.loaders.includes("forge");
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
          if (activeEngine === "neoforge") return fileLoaders.includes("neoforge") || fileLoaders.includes("forge");
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

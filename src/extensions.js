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
  fabric: "Fabric (Admite Mods y Datapacks)"
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

    // Configurar visibilidad de las pestañas de categorías superiores
    if (els.tabCategoryPlugins) {
      els.tabCategoryPlugins.style.display = (engine === "paper") ? "inline-block" : "none";
    }
    if (els.tabCategoryMods) {
      els.tabCategoryMods.style.display = (engine === "fabric") ? "inline-block" : "none";
    }
    // Datapacks siempre visible
    if (els.tabCategoryDatapacks) {
      els.tabCategoryDatapacks.style.display = "inline-block";
    }

    // Establecer categoría inicial por defecto según el motor
    if (engine === "paper") {
      activeCategory = "plugin";
      selectCategoryTab(els.tabCategoryPlugins);
    } else if (engine === "fabric") {
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

export async function loadInstalledExtensions() {
  if (!els.listInstalledExtensions) return;

  try {
    els.listInstalledExtensions.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Cargando extensiones...</p>';
    const extensions = await invoke("listar_extensiones");

    els.listInstalledExtensions.innerHTML = "";
    
    // Filtrar localmente según la categoría activa
    const filtered = (extensions || []).filter(ext => ext.extension_type === activeCategory);

    if (filtered.length === 0) {
      const typeText = activeCategory === "plugin" ? "plugins" : activeCategory === "mod" ? "mods" : "datapacks";
      els.listInstalledExtensions.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">No hay ${typeText} instalados.</p>`;
      return;
    }

    filtered.forEach(ext => {
      const card = document.createElement("div");
      card.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-hover); border-radius: 8px; border: 1px solid var(--border-color);";

      const infoDiv = document.createElement("div");
      infoDiv.style = "display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;";

      const headerRow = document.createElement("div");
      headerRow.style = "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;";

      const name = document.createElement("strong");
      name.style.fontSize = "1rem";
      name.style.color = "#fff";
      name.textContent = ext.name;

      const badge = document.createElement("span");
      const isPlugin = ext.extension_type === "plugin";
      const isMod = ext.extension_type === "mod";
      
      let badgeBg = "rgba(234, 179, 8, 0.2)"; // datapack default yellow
      let badgeColor = "#eab308";
      let badgeBorder = "rgba(234, 179, 8, 0.4)";
      
      if (isPlugin) {
        badgeBg = "rgba(79, 70, 229, 0.2)";
        badgeColor = "#818cf8";
        badgeBorder = "rgba(79, 70, 229, 0.4)";
      } else if (isMod) {
        badgeBg = "rgba(16, 185, 129, 0.2)";
        badgeColor = "#34d399";
        badgeBorder = "rgba(16, 185, 129, 0.4)";
      }
      
      badge.style = `font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};`;
      badge.textContent = ext.extension_type;

      const version = document.createElement("span");
      version.style = "font-size: 0.85rem; color: var(--text-secondary);";
      version.textContent = ext.extension_type === "datapack" ? "" : `v${ext.version}`;

      headerRow.appendChild(name);
      headerRow.appendChild(badge);
      if (version.textContent) {
        headerRow.appendChild(version);
      }

      const fileName = document.createElement("span");
      fileName.style = "font-size: 0.8rem; color: var(--text-secondary); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.7;";
      fileName.textContent = ext.file_name;

      infoDiv.appendChild(headerRow);
      infoDiv.appendChild(fileName);

      if (ext.description) {
          const desc = document.createElement("p");
          desc.style = "margin: 4px 0 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;";
          desc.textContent = ext.description;
          infoDiv.appendChild(desc);
      }

      const btnDelete = document.createElement("button");
      btnDelete.className = "warning";
      btnDelete.style = "padding: 6px 12px; font-size: 0.85rem; margin-left: 16px; border-radius: 6px; flex-shrink: 0;";
      btnDelete.textContent = "Eliminar";
      btnDelete.onclick = () => {
        requestConfirm(
          "Eliminar Extensión",
          `¿Estás seguro de que quieres eliminar la extensión "${ext.name}"?`,
          async () => {
            try {
              showFeedback(`Eliminando "${ext.name}"...`, "info");
              await invoke("eliminar_extension", { fileName: ext.file_name, extensionType: ext.extension_type });
              showFeedback(`Extensión "${ext.name}" eliminada correctamente.`, "success");
              loadInstalledExtensions();
            } catch (err) {
              showFeedback(`Error al eliminar: ${err}`, "error");
            }
          }
        );
      };

      card.appendChild(infoDiv);
      card.appendChild(btnDelete);
      els.listInstalledExtensions.appendChild(card);
    });
  } catch (err) {
    els.listInstalledExtensions.innerHTML = `<p class="hint" style="color: var(--error);">Error al cargar extensiones: ${err}</p>`;
  }
}

export async function searchModrinth(query) {
  if (!els.listSearchResults) return;
  
  const cleanQuery = query.trim();

  // Si la barra está vacía, cargamos recomendados
  if (!cleanQuery) {
    await loadRecommendedExtensions();
    return;
  }

  try {
    els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Buscando en Modrinth...</p>';
    
    // Modrinth search query filtered by the active category type
    const searchType = activeCategory === "plugin" ? "plugin" : activeCategory === "mod" ? "mod" : "datapack";
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(cleanQuery)}&facets=[["project_type:${searchType}"]]`;
    const response = await fetch(url, {
        headers: {
            "User-Agent": "norditex/minecraft-server-gui (gemini-agent)"
        }
    });

    if (!response.ok) {
        throw new Error(`Error de Modrinth: ${response.status}`);
    }

    const data = await response.json();
    renderSearchResults(data.hits);
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
    
    // Map response projects to a similar structure as search hits
    const mappedHits = projects.map(p => ({
      project_id: p.id,
      title: p.title,
      project_type: p.project_type,
      downloads: p.downloads,
      description: p.description,
      author: "", // Will be empty or fetched separately if needed, but not critical
      icon_url: p.icon_url,
      slug: p.slug
    }));

    // Render results under a recommended header
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

function renderSearchResults(hits) {
  els.listSearchResults.innerHTML = "";
  if (!hits || hits.length === 0) {
    els.listSearchResults.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No se encontraron resultados.</p>';
    return;
  }

  const container = document.createElement("div");
  container.style = "display: flex; flex-direction: column; gap: 16px;";
  els.listSearchResults.appendChild(container);

  renderSearchResultsInto(hits, container);
}

function renderSearchResultsInto(hits, parentElement) {
  hits.forEach(project => {
    const card = document.createElement("div");
    card.style = "display: flex; gap: 16px; padding: 16px; background: var(--bg-hover); border-radius: 8px; border: 1px solid var(--border-color); align-items: flex-start;";

    // Icon
    const img = document.createElement("img");
    img.src = project.icon_url || "https://placehold.co/64x64?text=Mc";
    img.style = "width: 56px; height: 56px; border-radius: 8px; background: rgba(0,0,0,0.2); object-fit: cover; flex-shrink: 0;";
    img.onerror = () => { img.src = "https://placehold.co/64x64?text=Mc"; };

    const content = document.createElement("div");
    content.style = "display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0;";

    const titleRow = document.createElement("div");
    titleRow.style = "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;";

    const title = document.createElement("strong");
    title.style.fontSize = "1.05rem";
    title.style.color = "#fff";
    title.textContent = project.title;

    const badge = document.createElement("span");
    const isMod = project.project_type === "mod";
    const isPlugin = project.project_type === "plugin";
    
    let badgeBg = "rgba(234, 179, 8, 0.2)";
    let badgeColor = "#eab308";
    let badgeBorder = "rgba(234, 179, 8, 0.4)";
    
    if (isPlugin) {
      badgeBg = "rgba(79, 70, 229, 0.2)";
      badgeColor = "#818cf8";
      badgeBorder = "rgba(79, 70, 229, 0.4)";
    } else if (isMod) {
      badgeBg = "rgba(16, 185, 129, 0.2)";
      badgeColor = "#34d399";
      badgeBorder = "rgba(16, 185, 129, 0.4)";
    }

    badge.style = `font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};`;
    badge.textContent = project.project_type;

    const downloads = document.createElement("span");
    downloads.style = "font-size: 0.8rem; color: var(--text-secondary); opacity: 0.8;";
    downloads.textContent = `📥 ${project.downloads.toLocaleString()} descargas`;

    titleRow.appendChild(title);
    titleRow.appendChild(badge);
    titleRow.appendChild(downloads);

    const desc = document.createElement("p");
    desc.style = "margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;";
    desc.textContent = project.description;

    const footerDetails = document.createElement("span");
    footerDetails.style = "font-size: 0.8rem; color: var(--text-secondary); opacity: 0.6;";
    footerDetails.textContent = project.author ? `Autor: ${project.author}` : `Slug: ${project.slug}`;

    content.appendChild(titleRow);
    content.appendChild(desc);
    content.appendChild(footerDetails);

    const btnVersions = document.createElement("button");
    btnVersions.style = "padding: 6px 12px; font-size: 0.85rem; border-radius: 6px; align-self: center; flex-shrink: 0;";
    btnVersions.textContent = "Instalar";
    btnVersions.onclick = () => showVersions(project.project_id || project.slug, project.title, project.project_type);

    card.appendChild(img);
    card.appendChild(content);
    card.appendChild(btnVersions);
    parentElement.appendChild(card);
  });
}

export async function showVersions(projectId, projectTitle, projectType) {
  if (!els.extensionVersionsDialog || !els.extVersionsList) return;

  try {
    els.extDialogTitle.textContent = `${projectTitle} - Elegir Versión`;
    els.extVersionsList.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">Obteniendo versiones desde Modrinth...</p>';
    els.extensionVersionsDialog.showModal();

    const response = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`, {
        headers: {
            "User-Agent": "norditex/minecraft-server-gui (gemini-agent)"
        }
    });

    if (!response.ok) {
        throw new Error("No se pudieron obtener las versiones del servidor.");
    }

    const versions = await response.json();
    els.extVersionsList.innerHTML = "";

    if (!versions || versions.length === 0) {
      els.extVersionsList.innerHTML = '<p class="hint" style="text-align: center; margin: 16px 0;">No se encontraron versiones disponibles.</p>';
      return;
    }

    // Filtrar versiones compatibles
    const compatibleVersions = versions.filter(v => {
      // 1. Filtrar por versión de Minecraft
      if (activeMcVersion !== "unknown" && !v.game_versions.includes(activeMcVersion)) {
        return false;
      }

      // 2. Filtrar por Loader según la categoría activa
      if (activeCategory === "plugin") {
        const validLoaders = ["paper", "spigot", "bukkit", "purpur"];
        if (!v.loaders.some(l => validLoaders.includes(l))) {
          return false;
        }
      } else if (activeCategory === "mod") {
        if (!v.loaders.includes("fabric")) {
          return false;
        }
      }
      
      return true;
    });

    if (compatibleVersions.length === 0) {
      const loaderInfo = activeCategory === "plugin" ? "Paper/Spigot" : activeCategory === "mod" ? "Fabric" : "Datapacks";
      const mcInfo = activeMcVersion === "unknown" ? "cualquier versión" : `versión ${activeMcVersion}`;
      els.extVersionsList.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0; color: var(--error); font-weight: 500;">No hay versiones disponibles compatibles con tu servidor (${loaderInfo} - Minecraft ${mcInfo}).</p>`;
      return;
    }

    // Limit to first 30 versions to keep it readable
    const displayedVersions = compatibleVersions.slice(0, 30);

    displayedVersions.forEach(v => {
      const container = document.createElement("div");
      container.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; gap: 12px;";

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

      // Find primary file or the first file to download
      const downloadFile = v.files.find(f => f.primary) || v.files[0];

      if (downloadFile) {
        const btnDownload = document.createElement("button");
        btnDownload.style = "padding: 4px 10px; font-size: 0.8rem; border-radius: 4px; flex-shrink: 0;";
        btnDownload.textContent = "Descargar";
        btnDownload.onclick = async () => {
          btnDownload.disabled = true;
          btnDownload.textContent = "Descargando...";
          showFeedback(`Descargando ${projectTitle} (${downloadFile.filename})...`, "info");
          try {
            await invoke("instalar_extension", {
              downloadUrl: downloadFile.url,
              fileName: downloadFile.filename,
              extensionType: activeCategory
            });
            showFeedback(`Instalación de "${projectTitle}" completada con éxito.`, "success");
            els.extensionVersionsDialog.close();
            
            // Refresh
            if (activeSubTab === "installed") {
              loadInstalledExtensions();
            }
          } catch (err) {
            btnDownload.disabled = false;
            btnDownload.textContent = "Descargar";
            showFeedback(`Error al descargar: ${err}`, "error");
          }
        };
        container.appendChild(btnDownload);
      }

      container.appendChild(info);
      els.extVersionsList.appendChild(container);
    });

  } catch (err) {
    els.extVersionsList.innerHTML = `<p class="hint" style="color: var(--error); text-align: center; margin: 16px 0;">Error: ${err.message || err}</p>`;
  }
}

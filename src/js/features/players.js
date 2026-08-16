import { invoke } from "../core/api.js";
import { els } from "../core/dom.js";
import { showFeedback } from "../utils/utils.js";
import { t } from "../i18n/i18n.js";

export async function checkWhitelistStatus() {
  try {
    const content = await invoke("leer_server_properties");
    if (!content) return;
    const match = content.match(/^white-list\s*=\s*(true|false)/m);
    if (match && match[1] === "false") {
      if (els.inputAddWhitelist) els.inputAddWhitelist.disabled = true;
      if (els.btnAddWhitelist) els.btnAddWhitelist.disabled = true;
      if (els.whitelistStatusBadge) els.whitelistStatusBadge.textContent = t("players.whitelist_disabled_badge");

      if (els.listWhitelist) {
        const removeBtns = els.listWhitelist.querySelectorAll("button");
        removeBtns.forEach(btn => btn.disabled = true);
      }
    } else {
      if (els.inputAddWhitelist) els.inputAddWhitelist.disabled = false;
      if (els.btnAddWhitelist) els.btnAddWhitelist.disabled = false;
      if (els.whitelistStatusBadge) els.whitelistStatusBadge.textContent = "";
    }
  } catch (e) {
    // Fallback to active if error
  }
}

export async function loadAllPlayerLists() {
  await loadPlayerList("ops.json", els.listOps, handleRemoveOp);
  await loadPlayerList("whitelist.json", els.listWhitelist, handleRemoveWhitelist);
  await loadPlayerList("banned-players.json", els.listBannedPlayers, handleRemoveBannedPlayer);
  await loadPlayerList("banned-ips.json", els.listBannedIps, handleRemoveBannedIp);
  await checkWhitelistStatus();
}

export async function loadPlayerList(filename, containerEl, removeHandler) {
  if (!containerEl) return;
  try {
    const content = await invoke("leer_archivo_servidor", { archivo: filename });
    containerEl.innerHTML = "";
    if (!content) {
      containerEl.innerHTML = '<p class="hint" style="font-size: 0.9rem;">No hay registros.</p>';
      return;
    }

    let arr = [];
    try { arr = JSON.parse(content); } catch (e) { arr = []; }

    if (!Array.isArray(arr) || arr.length === 0) {
      containerEl.innerHTML = '<p class="hint" style="font-size: 0.9rem;">No hay registros.</p>';
      return;
    }

    arr.forEach(item => {
      const div = document.createElement("div");
      div.style = "display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-hover); border-radius: 6px; border: 1px solid var(--border-color);";

      const nameEl = document.createElement("strong");
      nameEl.style.fontSize = "0.95rem";
      nameEl.textContent = item.name || item.ip || "Desconocido";

      const btnRemove = document.createElement("button");
      btnRemove.className = "mc-btn-secondary btn-small";
      btnRemove.style.padding = "4px 8px";
      btnRemove.style.fontSize = "0.8rem";
      btnRemove.textContent = "Eliminar";
      btnRemove.onclick = () => removeHandler(item);

      div.appendChild(nameEl);
      div.appendChild(btnRemove);
      containerEl.appendChild(div);
    });
  } catch (err) {
    containerEl.innerHTML = `<p class="hint" style="color: var(--error);">Error: ${err}</p>`;
  }
}

export async function addItemToList(filename, itemTemplate, containerEl, removeHandler) {
  try {
    const content = await invoke("leer_archivo_servidor", { archivo: filename });
    let arr = [];
    if (content) {
      try { arr = JSON.parse(content); } catch (e) { arr = []; }
    }
    if (!Array.isArray(arr)) arr = [];

    arr.push(itemTemplate);

    await invoke("guardar_archivo_servidor", {
      archivo: filename,
      contenido: JSON.stringify(arr, null, 2)
    });

    showFeedback("Lista actualizada correctamente.", "success");
    await loadPlayerList(filename, containerEl, removeHandler);
  } catch (err) {
    showFeedback(`Error al guardar: ${err}`, "error");
  }
}

export async function removeItemFromList(filename, matchFn, containerEl, removeHandler) {
  try {
    const content = await invoke("leer_archivo_servidor", { archivo: filename });
    if (!content) return;

    let arr = [];
    try { arr = JSON.parse(content); } catch (e) { return; }
    if (!Array.isArray(arr)) return;

    arr = arr.filter(item => !matchFn(item));

    await invoke("guardar_archivo_servidor", {
      archivo: filename,
      contenido: JSON.stringify(arr, null, 2)
    });

    showFeedback("Elemento eliminado de la lista.", "success");
    await loadPlayerList(filename, containerEl, removeHandler);
  } catch (err) {
    showFeedback(`Error al guardar: ${err}`, "error");
  }
}

export function handleRemoveOp(item) { removeItemFromList("ops.json", i => i.name === item.name, els.listOps, handleRemoveOp); }
export function handleRemoveWhitelist(item) { removeItemFromList("whitelist.json", i => i.name === item.name, els.listWhitelist, handleRemoveWhitelist); }
export function handleRemoveBannedPlayer(item) { removeItemFromList("banned-players.json", i => i.name === item.name, els.listBannedPlayers, handleRemoveBannedPlayer); }
export function handleRemoveBannedIp(item) { removeItemFromList("banned-ips.json", i => i.ip === item.ip, els.listBannedIps, handleRemoveBannedIp); }

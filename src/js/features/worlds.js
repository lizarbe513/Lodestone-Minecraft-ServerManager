import { invoke } from "../core/api.js";
import { els } from "../core/dom.js";
import { showFeedback, requestConfirm } from "../utils/utils.js";
import { t } from "../i18n/i18n.js";

export async function loadWorlds() {
  if (!els.listWorlds) return;
  try {
    els.listWorlds.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">${t("worlds.loading")}</p>`;
    const mundos = await invoke("listar_mundos");
    const mundoActivo = await invoke("obtener_mundo_activo");

    els.listWorlds.innerHTML = "";
    if (!mundos || mundos.length === 0) {
      els.listWorlds.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">${t("worlds.no_worlds")}</p>`;
      return;
    }

    for (const mundo of mundos) {
      const div = document.createElement("div");
      div.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-hover); border-radius: 6px; border: 1px solid var(--border-color);";

      const nameEl = document.createElement("strong");
      nameEl.style.fontSize = "1rem";
      nameEl.textContent = mundo;

      const row = document.createElement("div");
      row.className = "row";
      row.style.gap = "8px";

      if (mundo === mundoActivo) {
        const badge = document.createElement("span");
        badge.style = "font-size: 0.8rem; padding: 4px 8px; background: var(--primary); color: #fff; border-radius: 4px; font-weight: bold;";
        badge.textContent = t("common.active");
        row.appendChild(badge);
      } else {
        const btnActive = document.createElement("button");
        btnActive.className = "mc-btn-secondary btn-small";
        btnActive.style = "padding: 4px 12px; font-size: 0.85rem;";
        btnActive.textContent = t("worlds.make_active");
        btnActive.onclick = () => {
          requestConfirm(t("worlds.confirm_switch_title"), t("worlds.confirm_switch_msg", { name: mundo }), async () => {
            try {
              await invoke("cambiar_mundo_activo", { mundo });
              showFeedback(t("worlds.switched_feedback", { name: mundo }), "success");
              loadWorlds();
            } catch (e) {
              showFeedback(`Error: ${e}`, "error");
            }
          });
        };
        row.appendChild(btnActive);

        const btnRename = document.createElement("button");
        btnRename.className = "mc-btn-secondary btn-small";
        btnRename.style = "padding: 4px 12px; font-size: 0.85rem;";
        btnRename.textContent = t("worlds.rename");
        btnRename.onclick = () => {
          const newName = window.prompt(t("worlds.rename_prompt"), mundo);
          if (newName && newName.trim() !== "" && newName !== mundo) {
            invoke("renombrar_mundo", { oldName: mundo, newName: newName.trim() }).then(() => {
              showFeedback(`El mundo "${mundo}" fue renombrado a "${newName.trim()}".`, "success");
              loadWorlds();
            }).catch(e => {
              showFeedback(`Error: ${e}`, "error");
            });
          }
        };
        row.appendChild(btnRename);

        const btnDelete = document.createElement("button");
        btnDelete.className = "mc-btn-warning btn-small";
        btnDelete.style = "padding: 4px 12px; font-size: 0.85rem;";
        btnDelete.textContent = "Eliminar";
        btnDelete.onclick = () => {
          requestConfirm("Eliminar Mundo", `¿Estás completamente seguro de eliminar permanentemente el mundo "${mundo}"? Esto no se puede deshacer.`, async () => {
            try {
              await invoke("borrar_mundo", { mundo });
              showFeedback(`El mundo "${mundo}" fue eliminado.`, "success");
              loadWorlds();
            } catch (e) {
              showFeedback(`Error: ${e}`, "error");
            }
          });
        };
        row.appendChild(btnDelete);
      }

      const btnBackup = document.createElement("button");
      btnBackup.className = "mc-btn-secondary btn-small";
      btnBackup.style = "padding: 4px 12px; font-size: 0.85rem;";
      btnBackup.textContent = "Respaldar (.zip)";
      btnBackup.onclick = async () => {
        try {
          showFeedback(`Creando respaldo de "${mundo}"...`, "info");
          const path = await invoke("respaldar_mundo", { mundo });
          showFeedback(`Respaldo creado en: ${path}`, "success");
        } catch (e) {
          showFeedback(`Error al crear respaldo: ${e}`, "error");
        }
      };
      row.appendChild(btnBackup);

      const btnOpenDir = document.createElement("button");
      btnOpenDir.className = "mc-btn-secondary btn-small";
      btnOpenDir.style = "padding: 4px 12px; font-size: 0.85rem;";
      btnOpenDir.textContent = "Abrir";
      btnOpenDir.onclick = async () => {
        try {
          await invoke("abrir_carpeta_servidor");
        } catch (e) {
          showFeedback(`Error abriendo carpeta: ${e}`, "error");
        }
      };
      row.appendChild(btnOpenDir);

      div.appendChild(nameEl);
      div.appendChild(row);
      els.listWorlds.appendChild(div);
    }
  } catch (err) {
    els.listWorlds.innerHTML = `<p class="hint" style="color: var(--error);">Error: ${err}</p>`;
  }
}

export function initWorldsPage() {
  const btnOpenFolder = document.querySelector("#btn-worlds-open-folder");
  if (btnOpenFolder) {
    btnOpenFolder.onclick = async () => {
      try {
        await invoke("abrir_carpeta_servidor");
      } catch (e) {
        showFeedback(`Error abriendo carpeta del servidor: ${e}`, "error");
      }
    };
  }
}

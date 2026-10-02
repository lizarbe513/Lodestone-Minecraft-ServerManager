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
      div.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.3); border: 2px solid #000; border-radius: 0; box-shadow: inset 1px 1px 0 rgba(255,255,255,0.05);";

      const nameEl = document.createElement("strong");
      nameEl.style.fontSize = "1rem";
      nameEl.textContent = mundo;

      const row = document.createElement("div");
      row.className = "row";
      row.style.gap = "8px";

      if (mundo === mundoActivo) {
        const badge = document.createElement("span");
        badge.style = "font-family: var(--font-title); font-size: 0.85rem; padding: 4px 8px; background: var(--mc-green); color: #fff; border: 1px solid #111; text-shadow: 1px 1px 0 rgba(0,0,0,0.8); border-radius: 0; text-transform: uppercase;";
        badge.textContent = t("common.active");
        row.appendChild(badge);
      } else {
        const btnActive = document.createElement("button");
        btnActive.className = "mc-btn-secondary btn-small";
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
        btnDelete.className = "mc-btn-danger btn-small";
        btnDelete.textContent = t("common.delete");
        btnDelete.onclick = () => {
          requestConfirm(
            t("worlds.delete_title"),
            t("worlds.delete_msg", { name: mundo }),
            {
              type: "danger",
              acceptText: t("common.delete"),
              action: async () => {
                try {
                  await invoke("borrar_mundo", { mundo });
                  showFeedback(t("worlds.deleted_feedback", { name: mundo }), "success");
                  loadWorlds();
                } catch (e) {
                  showFeedback(`Error: ${e}`, "error");
                }
              }
            }
          );
        };
        row.appendChild(btnDelete);
      }

      const btnBackup = document.createElement("button");
      btnBackup.className = "mc-btn-secondary btn-small";
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
      btnOpenDir.textContent = t("common.open");
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

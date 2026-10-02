import { invoke } from "../core/api.js";
import { els } from "../core/dom.js";
import { showFeedback, requestConfirm } from "../utils/utils.js";
import { appState } from "../core/state.js";
import { t } from "../i18n/i18n.js";

// Estado local
export let activeAdminTab = "backups"; // "backups" | "tasks"
export let configuredTasks = [];
let schedulerIntervalId = null;

// Formatear tamaño de bytes a algo legible
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ----------------------------------------------------
// COPIAS DE SEGURIDAD (BACKUPS)
// ----------------------------------------------------

export async function loadBackupsList() {
  if (!els.listBackups) return;
  els.listBackups.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">${t("backups.loading_backups")}</p>`;

  try {
    const list = await invoke("listar_backups");
    els.listBackups.innerHTML = "";

    if (list.length === 0) {
      els.listBackups.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">${t("backups.no_backups")}</p>`;
      return;
    }

    list.forEach(backup => {
      const container = document.createElement("div");
      container.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.3); border: 2px solid #000; border-radius: 0; gap: 12px; box-shadow: inset 1px 1px 0 rgba(255,255,255,0.05);";

      const info = document.createElement("div");
      info.style = "display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;";

      const name = document.createElement("strong");
      name.style = "font-size: 0.95rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      name.textContent = backup.filename;

      const details = document.createElement("span");
      details.style = "font-size: 0.8rem; color: var(--text-secondary);";
      
      const dateStr = new Date(backup.timestamp * 1000).toLocaleString();
      details.textContent = `${dateStr} | ${t("backups.size_label", { size: formatBytes(backup.size_bytes) })}`;

      info.appendChild(name);
      info.appendChild(details);

      const actions = document.createElement("div");
      actions.style = "display: flex; gap: 8px;";

      // Restaurar
      const btnRestore = document.createElement("button");
      btnRestore.className = "mc-btn-secondary btn-small";
      btnRestore.textContent = t("backups.btn_restore");
      btnRestore.onclick = () => {
        if (appState.status === "starting" || appState.status === "running") {
          showFeedback(t("backups.restore_busy_error"), "error");
          return;
        }

        requestConfirm(
          t("backups.restore_confirm_title"),
          t("backups.restore_confirm_msg"),
          {
            type: "danger",
            acceptText: t("backups.btn_restore"),
            action: async () => {
              showFeedback(t("backups.restoring"), "info");
              try {
                await invoke("restaurar_backup", { backupName: backup.filename });
                showFeedback(t("backups.restore_success"), "success");
              } catch (err) {
                showFeedback(`Error: ${err}`, "error");
              }
            }
          }
        );
      };

      // Eliminar
      const btnDelete = document.createElement("button");
      btnDelete.className = "mc-btn-danger btn-small";
      btnDelete.textContent = t("common.delete");
      btnDelete.onclick = () => {
        requestConfirm(
          t("backups.delete_confirm_title"),
          t("backups.delete_confirm_msg"),
          {
            type: "danger",
            acceptText: t("common.delete"),
            action: async () => {
              try {
                await invoke("eliminar_backup", { backupName: backup.filename });
                showFeedback(t("backups.delete_success"), "success");
                loadBackupsList();
              } catch (err) {
                showFeedback(`Error: ${err}`, "error");
              }
            }
          }
        );
      };

      actions.appendChild(btnRestore);
      actions.appendChild(btnDelete);

      container.appendChild(info);
      container.appendChild(actions);

      els.listBackups.appendChild(container);
    });
  } catch (err) {
    els.listBackups.innerHTML = `<p class="hint" style="color: var(--mc-red); text-align: center; margin: 16px 0;">Error: ${err}</p>`;
  }
}

export function createFullBackup() {
  requestConfirm(
    t("backups.create_confirm_title"),
    t("backups.create_confirm_msg"),
    {
      type: "primary",
      acceptText: t("backups.btn_backup"),
      action: async () => {
        showFeedback(t("backups.creating"), "info");
        
        // Disable the button to prevent multiple clicks
        if (els.btnCreateBackup) els.btnCreateBackup.disabled = true;

        try {
          const filename = await invoke("crear_backup_completo");
          showFeedback(t("backups.create_success", { name: filename }), "success");
          loadBackupsList();
        } catch (err) {
          showFeedback(`Error: ${err}`, "error");
        } finally {
          if (els.btnCreateBackup) els.btnCreateBackup.disabled = false;
        }
      }
    }
  );
}

// ----------------------------------------------------
// PLANIFICADOR DE TAREAS (SCHEDULER)
// ----------------------------------------------------

export async function loadTasksList() {
  if (!els.listTasks) return;
  els.listTasks.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">${t("common.loading")}</p>`;

  try {
    const rawContent = await invoke("leer_archivo_servidor", { archivo: "scheduler.json" });
    if (rawContent && rawContent.trim() !== "") {
      configuredTasks = JSON.parse(rawContent);
    } else {
      configuredTasks = [];
    }

    els.listTasks.innerHTML = "";

    if (configuredTasks.length === 0) {
      els.listTasks.innerHTML = `<p class="hint" style="text-align: center; margin: 16px 0;">${t("backups.no_tasks")}</p>`;
      return;
    }

    configuredTasks.forEach((task, index) => {
      const container = document.createElement("div");
      container.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(0,0,0,0.3); border: 2px solid #000; border-radius: 0; gap: 12px; box-shadow: inset 1px 1px 0 rgba(255,255,255,0.05);";

      const info = document.createElement("div");
      info.style = "display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;";

      const title = document.createElement("strong");
      title.style = "font-size: 0.95rem; color: #fff;";

      let typeLabel = "";
      if (task.type === "backup") typeLabel = t("tasks.type_backup");
      else if (task.type === "restart") typeLabel = t("tasks.type_restart");
      else if (task.type === "command") typeLabel = `${t("tasks.type_command")}: "${task.command_text}"`;

      title.textContent = typeLabel;

      const details = document.createElement("span");
      details.style = "font-size: 0.8rem; color: var(--text-secondary);";

      let triggerLabel = "";
      if (task.trigger === "start") triggerLabel = t("tasks.trigger_start");
      else if (task.trigger === "interval") triggerLabel = t("tasks.trigger_interval_desc", { min: task.interval_minutes });
      else if (task.trigger === "daily") triggerLabel = t("tasks.trigger_daily_desc", { time: task.daily_time });

      const lastExec = task.last_executed ? new Date(task.last_executed).toLocaleString() : t("tasks.never_executed");
      details.textContent = `${t("tasks.trigger_label")}: ${triggerLabel} | ${t("tasks.last_exec", { date: lastExec })}`;

      info.appendChild(title);
      info.appendChild(details);

      // Eliminar tarea
      const btnDelete = document.createElement("button");
      btnDelete.className = "mc-btn-danger btn-small";
      btnDelete.textContent = t("common.delete");
      btnDelete.onclick = () => {
        requestConfirm(
          t("tasks.delete_title"),
          t("tasks.delete_msg"),
          {
            type: "danger",
            acceptText: t("common.delete"),
            action: async () => {
              configuredTasks.splice(index, 1);
              await saveTasks();
              showFeedback(t("tasks.deleted_feedback"), "success");
              loadTasksList();
            }
          }
        );
      };

      container.appendChild(info);
      container.appendChild(btnDelete);
      els.listTasks.appendChild(container);
    });
  } catch (err) {
    els.listTasks.innerHTML = `<p class="hint" style="color: var(--mc-red); text-align: center; margin: 16px 0;">Error: ${err}</p>`;
  }
}

async function saveTasks() {
  try {
    await invoke("guardar_archivo_servidor", {
      archivo: "scheduler.json",
      contenido: JSON.stringify(configuredTasks, null, 2)
    });
  } catch (err) {
    showFeedback(`Error al guardar tareas: ${err}`, "error");
  }
}

export async function addNewTask() {
  const type = els.taskType.value;
  const trigger = els.taskTrigger.value;
  const command = els.taskCommand.value.trim();
  const interval = parseInt(els.taskInterval.value, 10);
  const time = els.taskTime.value;

  if (type === "command" && command === "") {
    showFeedback("Debes ingresar un comando válido.", "error");
    return;
  }

  if (trigger === "interval" && (isNaN(interval) || interval <= 0)) {
    showFeedback("Debes ingresar un intervalo de minutos válido.", "error");
    return;
  }

  const newTask = {
    id: "task_" + Date.now(),
    type,
    trigger,
    command_text: type === "command" ? command : "",
    interval_minutes: trigger === "interval" ? interval : 0,
    daily_time: trigger === "daily" ? time : "",
    last_executed: 0
  };

  configuredTasks.push(newTask);
  await saveTasks();
  showFeedback("Nueva tarea programada guardada con éxito.", "success");
  
  // Limpiar campos
  els.taskCommand.value = "";
  els.taskInterval.value = "60";
  els.taskTime.value = "03:00";
  
  els.newTaskDialog.close();
  loadTasksList();
}

// ----------------------------------------------------
// EJECUCIÓN DEL SCHEDULER (JS TICK LOOP)
// ----------------------------------------------------

async function runScheduledTask(task) {
  console.log(`[Scheduler] Ejecutando tarea programada: ${task.type}`);
  
  task.last_executed = Date.now();
  await saveTasks();
  
  if (task.type === "backup") {
    showFeedback("[Planificador] Ejecutando copia de seguridad programada...", "info");
    try {
      await invoke("crear_backup_completo");
      showFeedback("[Planificador] Copia de seguridad programada creada con éxito.", "success");
      if (activeAdminTab === "backups") loadBackupsList();
    } catch (err) {
      showFeedback(`[Planificador] Error al crear backup programado: ${err}`, "error");
    }
  } else if (task.type === "command") {
    if (appState.status === "running") {
      showFeedback(`[Planificador] Enviando comando programado: ${task.command_text}`, "info");
      try {
        await invoke("enviar_comando", { comando: task.command_text });
      } catch (err) {
        showFeedback(`[Planificador] Error al enviar comando programado: ${err}`, "error");
      }
    }
  } else if (task.type === "restart") {
    if (appState.status === "running") {
      showFeedback("[Planificador] Iniciando ciclo de reinicio automático del servidor...", "info");
      try {
        // Notificar y esperar 60s
        await invoke("enviar_comando", { comando: "say El servidor se reiniciará en 60 segundos por mantenimiento programado." });
        
        setTimeout(async () => {
          showFeedback("[Planificador] Apagando el servidor para reinicio...", "info");
          try {
            await invoke("detener_servidor");
            
            // Bucle para esperar a que esté Offline y volver a iniciarlo
            const waitAndStart = setInterval(async () => {
              if (appState.status === "offline") {
                clearInterval(waitAndStart);
                showFeedback("[Planificador] Iniciando el servidor nuevamente...", "info");
                try {
                  await invoke("iniciar_servidor_actual");
                } catch (err) {
                  showFeedback(`[Planificador] Error al volver a iniciar servidor: ${err}`, "error");
                }
              }
            }, 2000);
          } catch (err) {
            showFeedback(`[Planificador] Error al detener servidor para reinicio: ${err}`, "error");
          }
        }, 60000);

      } catch (err) {
        showFeedback(`[Planificador] Error al iniciar reinicio automático: ${err}`, "error");
      }
    }
  }
}

export function startScheduler() {
  if (schedulerIntervalId) clearInterval(schedulerIntervalId);

  console.log("[Scheduler] Iniciando temporizador en segundo plano.");
  schedulerIntervalId = setInterval(async () => {
    // Solo evaluar si hay una sesión activa abierta en la GUI
    if (!appState.activeSession) return;

    const now = new Date();
    const nowMs = now.getTime();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    let tasksModified = false;

    for (const task of configuredTasks) {
      // 1. Disparador por Intervalo
      if (task.trigger === "interval") {
        const lastExec = task.last_executed || 0;
        const diffMins = (nowMs - lastExec) / (60 * 1000);
        if (diffMins >= task.interval_minutes) {
          tasksModified = true;
          await runScheduledTask(task);
        }
      } 
      // 2. Disparador por Hora Fija
      else if (task.trigger === "daily" && task.daily_time === hhmm) {
        const lastDateStr = task.last_executed ? new Date(task.last_executed).toDateString() : "";
        const todayDateStr = now.toDateString();
        if (lastDateStr !== todayDateStr) {
          tasksModified = true;
          await runScheduledTask(task);
        }
      }
    }

    if (tasksModified && activeAdminTab === "tasks") {
      loadTasksList();
    }
  }, 60000); // Comprobación cada minuto
}

// Disparar las tareas asociadas a la inicialización del servidor (start)
export async function triggerStartTasks() {
  for (const task of configuredTasks) {
    if (task.trigger === "start") {
      await runScheduledTask(task);
    }
  }
}

// Configuración inicial de pestañas
export function setActiveAdminTab(tab) {
  activeAdminTab = tab;
}

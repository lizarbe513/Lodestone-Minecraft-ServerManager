use crate::{
    constants::START_SCRIPT_NAME,
    events::{emit_log, emit_status},
    java::collect_java_versions,
    models::{AppConfig, AppSnapshot, LogKind, ServerSession, ServerStatus},
    server_files::eula_needs_acceptance,
    sessions::{
        load_app_config, save_app_config, save_session_metadata, validate_existing_session,
    },
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use sysinfo::{System, Pid};

pub struct AppState {
    pub runtime: Arc<Mutex<ServerRuntime>>,
}

pub struct ServerRuntime {
    pub child: Option<CommandChild>,
    pub status: ServerStatus,
    pub active_session: Option<ServerSession>,
    pub eula_pending: bool,
    pub system: System,
}

impl Default for ServerRuntime {
    fn default() -> Self {
        Self {
            child: None,
            status: ServerStatus::Offline,
            active_session: None,
            eula_pending: false,
            system: System::new_all(),
        }
    }
}

fn emit_runtime_status(app_handle: &tauri::AppHandle, status: ServerStatus) {
    if let Err(error) = emit_status(app_handle, status) {
        eprintln!("No se pudo emitir el estado del servidor: {error}");
    }
}

fn emit_runtime_log(app_handle: &tauri::AppHandle, kind: LogKind, message: impl Into<String>) {
    if let Err(error) = emit_log(app_handle, kind, message) {
        eprintln!("No se pudo emitir un log del servidor: {error}");
    }
}

pub fn build_snapshot(runtime: &ServerRuntime) -> AppSnapshot {
    AppSnapshot {
        status: runtime.status.clone(),
        active_session: runtime.active_session.clone(),
        java_versions: collect_java_versions(runtime.active_session.as_ref()),
        eula_pending: runtime.eula_pending,
    }
}

pub fn update_active_session(
    app_handle: &tauri::AppHandle,
    runtime: &Arc<Mutex<ServerRuntime>>,
    session: Option<ServerSession>,
) -> Result<(), String> {
    save_app_config(
        app_handle,
        &AppConfig {
            active_session: session.clone(),
        },
    )?;

    if let Some(active_session) = &session {
        save_session_metadata(active_session)?;
    }

    let mut runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo actualizar la sesión activa.".to_string())?;
    runtime_guard.active_session = session;
    runtime_guard.eula_pending = false;
    if runtime_guard.child.is_none() {
        runtime_guard.status = ServerStatus::Offline;
    }

    Ok(())
}

pub fn sync_runtime_from_saved_config(
    app_handle: &tauri::AppHandle,
    runtime: &Arc<Mutex<ServerRuntime>>,
) -> Result<(), String> {
    let config = load_app_config(app_handle)?;
    let mut runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo sincronizar la configuración guardada.".to_string())?;

    if runtime_guard.child.is_none() {
        runtime_guard.active_session = config.active_session;
        runtime_guard.eula_pending = false;
        runtime_guard.status = ServerStatus::Offline;
    }

    Ok(())
}

pub fn ensure_server_is_idle(runtime: &Arc<Mutex<ServerRuntime>>) -> Result<(), String> {
    let runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder al estado del servidor.".to_string())?;

    if runtime_guard.child.is_some() || runtime_guard.status != ServerStatus::Offline {
        return Err("Debes detener o cerrar la sesión actual antes de cambiar de servidor.".into());
    }

    Ok(())
}

pub fn current_session(runtime: &Arc<Mutex<ServerRuntime>>) -> Result<ServerSession, String> {
    let runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión actual.".to_string())?;

    runtime_guard
        .active_session
        .clone()
        .ok_or_else(|| "No hay una sesión de servidor activa.".to_string())
}

pub fn pending_eula_session(runtime: &Arc<Mutex<ServerRuntime>>) -> Result<ServerSession, String> {
    let runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión actual.".to_string())?;

    if runtime_guard.status != ServerStatus::WaitingEula || !runtime_guard.eula_pending {
        return Err("No hay un EULA pendiente por aceptar.".into());
    }

    runtime_guard
        .active_session
        .clone()
        .ok_or_else(|| "No hay una sesión de servidor activa.".to_string())
}

fn send_command_to_server(process: &mut CommandChild, command: &str) -> Result<(), String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("El comando no puede estar vacío.".into());
    }

    let payload = format!("{command}\n");
    process
        .write(payload.as_bytes())
        .map_err(|e| format!("No se pudo enviar el comando al servidor: {e}"))
}

pub fn send_console_command(
    runtime: &Arc<Mutex<ServerRuntime>>,
    command: &str,
) -> Result<(), String> {
    let mut runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder al proceso del servidor.".to_string())?;

    if runtime_guard.status != ServerStatus::Running {
        return Err("El servidor aún no está listo para recibir comandos.".into());
    }

    let child = runtime_guard
        .child
        .as_mut()
        .ok_or_else(|| "El servidor no está en ejecución.".to_string())?;

    send_command_to_server(child, command)
}

pub fn stop_server(runtime: &Arc<Mutex<ServerRuntime>>) -> Result<(), String> {
    let mut runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder al proceso del servidor.".to_string())?;

    let child = runtime_guard
        .child
        .as_mut()
        .ok_or_else(|| "El servidor no está en ejecución.".to_string())?;

    send_command_to_server(child, "stop")
}

fn output_indicates_server_ready(output: &str) -> bool {
    output.lines().any(|line| {
        let normalized = line.to_ascii_lowercase();
        normalized.contains("done (") && normalized.contains("for help")
    })
}

fn mark_server_as_running_if_ready(
    app_handle: &tauri::AppHandle,
    runtime: &Arc<Mutex<ServerRuntime>>,
    output: &str,
) -> Result<(), String> {
    if !output_indicates_server_ready(output) {
        return Ok(());
    }

    let should_emit = {
        let mut runtime_guard = runtime
            .lock()
            .map_err(|_| "No se pudo actualizar el estado del servidor.".to_string())?;

        if runtime_guard.status == ServerStatus::Starting && runtime_guard.child.is_some() {
            runtime_guard.status = ServerStatus::Running;
            runtime_guard.eula_pending = false;
            true
        } else {
            false
        }
    };

    if should_emit {
        emit_runtime_status(app_handle, ServerStatus::Running);
        emit_runtime_log(
            app_handle,
            LogKind::System,
            "Servidor listo para recibir comandos.",
        );
    }

    Ok(())
}

pub fn spawn_server_process(
    app_handle: &tauri::AppHandle,
    runtime: &Arc<Mutex<ServerRuntime>>,
    session: ServerSession,
) -> Result<(), String> {
    validate_existing_session(&session)?;

    let server_dir = PathBuf::from(&session.server_dir);
    let command = app_handle
        .shell()
        .command("bash")
        .arg(START_SCRIPT_NAME)
        .current_dir(&server_dir);

    {
        let mut runtime_guard = runtime
            .lock()
            .map_err(|_| "No se pudo preparar el estado del servidor.".to_string())?;
        runtime_guard.status = ServerStatus::Starting;
        runtime_guard.eula_pending = false;
        runtime_guard.active_session = Some(session.clone());
    }

    emit_runtime_status(app_handle, ServerStatus::Starting);
    emit_runtime_log(
        app_handle,
        LogKind::System,
        format!("Iniciando `{}`...", session.server_name),
    );

    match command.spawn() {
        Ok((mut rx, child)) => {
            {
                let mut runtime_guard = runtime
                    .lock()
                    .map_err(|_| "No se pudo actualizar el proceso del servidor.".to_string())?;
                runtime_guard.child = Some(child);
                runtime_guard.status = ServerStatus::Starting;
                runtime_guard.eula_pending = false;
            }

            emit_runtime_log(
                app_handle,
                LogKind::System,
                format!(
                    "Script `{}` ejecutado dentro de `{}`.",
                    START_SCRIPT_NAME, session.server_dir
                ),
            );

            let app_handle_for_task = app_handle.clone();
            let runtime_for_task = runtime.clone();
            let session_for_task = session.clone();

            tauri::async_runtime::spawn(async move {
                let mut terminated = false;

                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            let _ = mark_server_as_running_if_ready(
                                &app_handle_for_task,
                                &runtime_for_task,
                                &text,
                            );
                            emit_runtime_log(&app_handle_for_task, LogKind::Stdout, text);
                        }
                        CommandEvent::Stderr(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            let _ = mark_server_as_running_if_ready(
                                &app_handle_for_task,
                                &runtime_for_task,
                                &text,
                            );
                            emit_runtime_log(&app_handle_for_task, LogKind::Stderr, text);
                        }
                        CommandEvent::Terminated(payload) => {
                            terminated = true;

                            if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                runtime_guard.child = None;
                            }

                            let session_dir = PathBuf::from(&session_for_task.server_dir);
                            if eula_needs_acceptance(&session_dir) {
                                if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                    runtime_guard.status = ServerStatus::WaitingEula;
                                    runtime_guard.eula_pending = true;
                                }

                                emit_runtime_status(&app_handle_for_task, ServerStatus::WaitingEula);
                                emit_runtime_log(
                                    &app_handle_for_task,
                                    LogKind::System,
                                    "El servidor generó `eula.txt`. Acepta el EULA para continuar.",
                                );
                            } else {
                                if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                    runtime_guard.status = ServerStatus::Offline;
                                    runtime_guard.eula_pending = false;
                                }

                                emit_runtime_status(&app_handle_for_task, ServerStatus::Offline);
                                emit_runtime_log(
                                    &app_handle_for_task,
                                    LogKind::System,
                                    format!(
                                        "El proceso del servidor terminó. Código de salida: {:?}",
                                        payload.code
                                    ),
                                );
                            }
                        }
                        _ => {}
                    }
                }

                if !terminated {
                    if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                        runtime_guard.child = None;
                        if runtime_guard.status != ServerStatus::WaitingEula {
                            runtime_guard.status = ServerStatus::Offline;
                            runtime_guard.eula_pending = false;
                        }
                    }

                    emit_runtime_status(&app_handle_for_task, ServerStatus::Offline);
                }
            });

            Ok(())
        }
        Err(error) => {
            let mut runtime_guard = runtime
                .lock()
                .map_err(|_| "No se pudo restaurar el estado del servidor.".to_string())?;
            runtime_guard.child = None;
            runtime_guard.status = ServerStatus::Offline;
            runtime_guard.eula_pending = false;

            emit_runtime_status(app_handle, ServerStatus::Offline);
            emit_runtime_log(
                app_handle,
                LogKind::Stderr,
                format!("No se pudo iniciar el servidor: {error}"),
            );

            Err(format!("No se pudo iniciar el servidor: {error}"))
        }
    }
}

pub fn get_server_stats(runtime: &Arc<Mutex<ServerRuntime>>) -> (f32, u64) {
    let mut runtime_guard = match runtime.lock() {
        Ok(guard) => guard,
        Err(_) => return (0.0, 0),
    };

    let bash_pid_raw = match &runtime_guard.child {
        Some(child) => child.pid(),
        None => return (0.0, 0),
    };

    let bash_pid = Pid::from_u32(bash_pid_raw);
    
    runtime_guard.system.refresh_all();

    let java_proc = runtime_guard.system.processes().values().find(|p| {
        p.parent() == Some(bash_pid) || p.pid() == bash_pid
    });

    if let Some(p) = java_proc {
        (p.cpu_usage(), p.memory())
    } else {
        (0.0, 0)
    }
}

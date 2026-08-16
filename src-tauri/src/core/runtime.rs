use crate::{
    core::constants::START_SCRIPT_NAME,
    core::events::{emit_log, emit_status},
    commands::java::collect_java_versions,
    core::models::{AppSnapshot, LogKind, ServerSession, ServerStatus},
    commands::server_files::eula_needs_acceptance,
    commands::sessions::{
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
use sysinfo::System;

pub struct AppState {
    pub runtime: Arc<Mutex<ServerRuntime>>,
}

pub struct ServerRuntime {
    pub child: Option<CommandChild>,
    pub status: ServerStatus,
    pub active_session: Option<ServerSession>,
    pub saved_servers: Vec<ServerSession>,
    pub eula_pending: bool,
    pub system: System,
}

impl Default for ServerRuntime {
    fn default() -> Self {
        Self {
            child: None,
            status: ServerStatus::Offline,
            active_session: None,
            saved_servers: Vec::new(),
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

fn emit_runtime_log_i18n(
    app_handle: &tauri::AppHandle,
    kind: LogKind,
    fallback_message: impl Into<String>,
    i18n_key: impl Into<String>,
    i18n_params: Option<serde_json::Value>,
) {
    if let Err(error) = crate::core::events::emit_log_i18n(
        app_handle,
        kind,
        fallback_message,
        i18n_key,
        i18n_params,
    ) {
        eprintln!("No se pudo emitir un log del servidor: {error}");
    }
}

pub fn build_snapshot(runtime: &ServerRuntime) -> AppSnapshot {
    AppSnapshot {
        status: runtime.status.clone(),
        active_session: runtime.active_session.clone(),
        java_versions: collect_java_versions(runtime.active_session.as_ref()),
        eula_pending: runtime.eula_pending,
        saved_servers: runtime.saved_servers.clone(),
    }
}

pub fn update_active_session(
    app_handle: &tauri::AppHandle,
    runtime: &Arc<Mutex<ServerRuntime>>,
    session: Option<ServerSession>,
) -> Result<(), String> {
    let mut config = load_app_config(app_handle).unwrap_or_default();
    config.active_session = session.clone();

    if let Some(active_session) = &session {
        // Remove existing duplicate by server_dir, then insert/update it
        config.saved_servers.retain(|s| s.server_dir != active_session.server_dir);
        config.saved_servers.push(active_session.clone());
        save_session_metadata(active_session)?;
    }

    save_app_config(app_handle, &config)?;

    let mut runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo actualizar la sesión activa.".to_string())?;
    runtime_guard.saved_servers = config.saved_servers;
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

    runtime_guard.saved_servers = config.saved_servers;

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

    if runtime_guard.status != ServerStatus::Running && runtime_guard.status != ServerStatus::WaitingEula {
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
        emit_runtime_log_i18n(
            app_handle,
            LogKind::System,
            "Servidor listo para recibir comandos.",
            "terminal.server_ready",
            None,
        );
    }

    Ok(())
}

fn get_server_ip_and_port(server_dir: &std::path::Path) -> (String, u16) {
    let properties_path = server_dir.join("server.properties");
    let mut ip = "0.0.0.0".to_string();
    let mut port = 25565;
    
    if let Ok(content) = std::fs::read_to_string(properties_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim();
                let val = val.trim();
                if key == "server-port" {
                    if let Ok(p) = val.parse::<u16>() {
                        port = p;
                    }
                } else if key == "server-ip" {
                    if !val.is_empty() {
                        ip = val.to_string();
                    }
                }
            }
        }
    }
    (ip, port)
}

fn is_port_in_use(ip: &str, port: u16) -> bool {
    use std::net::TcpListener;
    if !ip.is_empty() && ip != "0.0.0.0" {
        TcpListener::bind(format!("{}:{}", ip, port)).is_err()
    } else {
        if TcpListener::bind(format!("127.0.0.1:{}", port)).is_err() {
            return true;
        }
        TcpListener::bind(format!("0.0.0.0:{}", port)).is_err()
    }
}

pub fn setup_and_spawn_forge_server(
    app_handle: &tauri::AppHandle,
    server_dir: &std::path::Path,
    session: &ServerSession,
) -> Result<tauri_plugin_shell::process::Command, String> {
    // let _ = crate::commands::server_files::ensure_eula_accepted(server_dir); // Let the normal server execution handle EULA creation, not here.
    let memory_mb = session.memory_gb * 1024;
    let run_bat = server_dir.join("run.bat");
    let run_sh = server_dir.join("run.sh");

    // Configure memory in user_jvm_args.txt if it exists
    let jvm_args_path = server_dir.join("user_jvm_args.txt");
    if jvm_args_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&jvm_args_path) {
            let mut new_lines = Vec::new();
            for line in content.lines() {
                if !line.trim_start().starts_with("-Xmx") && !line.trim_start().starts_with("-Xms") {
                    new_lines.push(line.to_string());
                }
            }
            new_lines.push(format!("-Xmx{}M", memory_mb));
            new_lines.push(format!("-Xms{}M", memory_mb));
            let _ = std::fs::write(&jvm_args_path, new_lines.join("\n"));
        }
    }

    let java_exe = if session.java_path.trim().is_empty() { "java".to_string() } else { session.java_path.clone() };

    // Si no existen los scripts de arranque, pero es un instalador, lo corremos como instalador para capturar logs en la consola
    if !run_bat.is_file() && !run_sh.is_file() && session.jar_file_name.ends_with("-installer.jar") {
        let installer_path = server_dir.join(&session.jar_file_name);
        if installer_path.is_file() {
            return Ok(app_handle.shell().command(java_exe).args(["-jar", &session.jar_file_name, "--installServer"]).current_dir(server_dir));
        }
    }

    let target_jar = session.jar_file_name.replace("-installer.jar", ".jar");
    let mem_arg_xmx = format!("-Xmx{}M", memory_mb);
    let mem_arg_xms = format!("-Xms{}M", memory_mb);

    if cfg!(windows) {
        if run_bat.is_file() {
            Ok(app_handle.shell().command("cmd").args(["/c", "run.bat", "nogui"]).current_dir(server_dir))
        } else {
            Ok(app_handle.shell().command(java_exe).args([&mem_arg_xmx, &mem_arg_xms, "-Djava.awt.headless=true", "-jar", &target_jar, "nogui"]).current_dir(server_dir))
        }
    } else {
        if run_sh.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&run_sh) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o755);
                    let _ = std::fs::set_permissions(&run_sh, perms);
                }
            }
            Ok(app_handle.shell().command("sh").args(["run.sh", "nogui"]).current_dir(server_dir))
        } else {
            Ok(app_handle.shell().command(java_exe).args([&mem_arg_xmx, &mem_arg_xms, "-Djava.awt.headless=true", "-jar", &target_jar, "nogui"]).current_dir(server_dir))
        }
    }
}

pub fn spawn_server_process(
    app_handle: &tauri::AppHandle,
    runtime: &Arc<Mutex<ServerRuntime>>,
    session: ServerSession,
) -> Result<(), String> {
    validate_existing_session(&session)?;

    let server_dir = PathBuf::from(&session.server_dir);
    
    // Validar conflicto de puertos
    let (ip, port) = get_server_ip_and_port(&server_dir);
    if is_port_in_use(&ip, port) {
        return Err(format!(
            "El puerto {} ya está siendo utilizado por otra aplicación. Por favor, asegúrate de que no esté en uso o cambia el puerto en la pestaña 'Propiedades'.",
            port
        ));
    }

    let is_forge_or_neoforge = session.jar_file_name.to_lowercase().contains("forge")
        || session.jar_file_name.ends_with("-installer.jar")
        || server_dir.join("run.sh").is_file()
        || server_dir.join("run.bat").is_file()
        || server_dir.join("user_jvm_args.txt").is_file();

    let command = if is_forge_or_neoforge {
        setup_and_spawn_forge_server(app_handle, &server_dir, &session)?
    } else {
        crate::commands::server_files::write_start_script(&session)?;
        app_handle
            .shell()
            .command("bash")
            .arg(START_SCRIPT_NAME)
            .current_dir(&server_dir)
    };

    {
        let mut runtime_guard = runtime
            .lock()
            .map_err(|_| "No se pudo preparar el estado del servidor.".to_string())?;
        runtime_guard.status = ServerStatus::Starting;
        runtime_guard.eula_pending = false;
        runtime_guard.active_session = Some(session.clone());
    }

    emit_runtime_status(app_handle, ServerStatus::Starting);
    emit_runtime_log_i18n(
        app_handle,
        LogKind::System,
        format!("Iniciando `{}`...", session.server_name),
        "terminal.server_starting",
        Some(serde_json::json!({ "name": &session.server_name })),
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

            emit_runtime_log_i18n(
                app_handle,
                LogKind::System,
                format!(
                    "Servidor ejecutado dentro de `{}`.",
                    session.server_dir
                ),
                "terminal.server_spawned",
                Some(serde_json::json!({ "dir": &session.server_dir })),
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
                            
                            if let Some((i18n_key, fallback)) = crate::core::diagnostics::diagnose_java_log(&text) {
                                emit_runtime_log_i18n(&app_handle_for_task, LogKind::System, fallback, i18n_key, None);
                            }

                            if text.contains("agreement to Minecraft's EULA") || text.contains("EULA:") {
                                if let Ok(mut rg) = runtime_for_task.lock() {
                                    rg.status = ServerStatus::WaitingEula;
                                    rg.eula_pending = true;
                                }
                                emit_runtime_status(&app_handle_for_task, ServerStatus::WaitingEula);
                                emit_runtime_log_i18n(
                                    &app_handle_for_task,
                                    LogKind::System,
                                    "El servidor requiere aceptar el EULA (Interactivo detectado).",
                                    "terminal.eula_required",
                                    None,
                                );
                            }
                            
                            emit_runtime_log(&app_handle_for_task, LogKind::Stdout, text);
                        }
                        CommandEvent::Stderr(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            let _ = mark_server_as_running_if_ready(
                                &app_handle_for_task,
                                &runtime_for_task,
                                &text,
                            );

                            if let Some((i18n_key, fallback)) = crate::core::diagnostics::diagnose_java_log(&text) {
                                emit_runtime_log_i18n(&app_handle_for_task, LogKind::System, fallback, i18n_key, None);
                            }

                            emit_runtime_log(&app_handle_for_task, LogKind::Stderr, text);
                        }
                        CommandEvent::Terminated(payload) => {
                            terminated = true;

                            if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                runtime_guard.child = None;
                            }

                            let session_dir = PathBuf::from(&session_for_task.server_dir);
                            let was_waiting_eula = if let Ok(rg) = runtime_for_task.lock() {
                                rg.status == ServerStatus::WaitingEula && rg.eula_pending
                            } else { false };
                            
                            if eula_needs_acceptance(&session_dir) || was_waiting_eula {
                                if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                    runtime_guard.status = ServerStatus::WaitingEula;
                                    runtime_guard.eula_pending = true;
                                }

                                emit_runtime_status(&app_handle_for_task, ServerStatus::WaitingEula);
                                emit_runtime_log_i18n(
                                    &app_handle_for_task,
                                    LogKind::System,
                                    "Falta aceptar el EULA para continuar.",
                                    "terminal.eula_missing",
                                    None,
                                );
                            } else {
                                if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                    runtime_guard.status = ServerStatus::Offline;
                                    runtime_guard.eula_pending = false;
                                }

                                emit_runtime_status(&app_handle_for_task, ServerStatus::Offline);
                                emit_runtime_log_i18n(
                                    &app_handle_for_task,
                                    LogKind::System,
                                    format!(
                                        "El proceso del servidor terminó. Código de salida: {:?}",
                                        payload.code
                                    ),
                                    "terminal.process_terminated",
                                    Some(serde_json::json!({ "code": format!("{:?}", payload.code) })),
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
            emit_runtime_log_i18n(
                app_handle,
                LogKind::Stderr,
                format!("No se pudo iniciar el servidor: {error}"),
                "terminal.server_start_failed",
                Some(serde_json::json!({ "error": error.to_string() })),
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

    if runtime_guard.child.is_none() {
        return (0.0, 0);
    }

    runtime_guard.system.refresh_cpu_usage();
    runtime_guard.system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let processes = runtime_guard.system.processes();
    let mut tracked_pids = std::collections::HashSet::new();

    let root_pid = runtime_guard.child.as_ref().map(|c| sysinfo::Pid::from_u32(c.pid()));

    // 1. Prioridad 1: Buscar procesos Java que desciendan de root_pid
    if let Some(r_pid) = root_pid {
        for (pid, proc) in processes {
            let name_str = proc.name().to_string_lossy().to_lowercase();
            if name_str.contains("java") {
                let mut curr = Some(*pid);
                for _ in 0..8 {
                    if let Some(p) = curr {
                        if p == r_pid {
                            tracked_pids.insert(*pid);
                            break;
                        }
                        curr = processes.get(&p).and_then(|pr| pr.parent());
                    } else {
                        break;
                    }
                }
            }
        }
    }

    // 2. Prioridad 2: Si no se encontró Java en el árbol, buscar el proceso Java que coincida con el server_dir
    if tracked_pids.is_empty() {
        if let Some(ref session) = runtime_guard.active_session {
            let s_dir = PathBuf::from(&session.server_dir);
            let s_dir_str = s_dir.to_string_lossy().to_lowercase();
            let jar_name_str = session.jar_file_name.to_lowercase();

            for (pid, proc) in processes {
                let name_str = proc.name().to_string_lossy().to_lowercase();
                if name_str.contains("java") {
                    let is_cwd_match = proc.cwd().map(|c| c == s_dir).unwrap_or(false);
                    let is_cmd_match = if !s_dir_str.is_empty() {
                        let cmd_concat = proc.cmd().iter().map(|s| s.to_string_lossy().to_lowercase()).collect::<Vec<_>>().join(" ");
                        cmd_concat.contains(&s_dir_str) || (!jar_name_str.is_empty() && cmd_concat.contains(&jar_name_str))
                    } else {
                        false
                    };

                    if is_cwd_match || is_cmd_match {
                        tracked_pids.insert(*pid);
                        break; // Tomar únicamente la instancia Java de este servidor
                    }
                }
            }
        }
    }

    // 3. Fallback: Si el servidor está arrancando y Java aún no se ha levantado, trackear el proceso raíz
    if tracked_pids.is_empty() {
        if let Some(r_pid) = root_pid {
            if processes.contains_key(&r_pid) {
                tracked_pids.insert(r_pid);
            }
        }
    }

    let mut total_cpu = 0.0f32;
    let mut max_ram = 0u64;

    for pid in &tracked_pids {
        if let Some(p) = processes.get(pid) {
            total_cpu += p.cpu_usage();
            max_ram = max_ram.max(p.memory());
        }
    }

    let cpu_cores = runtime_guard.system.cpus().len().max(1) as f32;
    let normalized_cpu = (total_cpu / cpu_cores).min(100.0);

    (normalized_cpu, max_ram)
}

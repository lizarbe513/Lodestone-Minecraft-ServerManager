use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const SERVER_STATUS_EVENT: &str = "server-status";
const SERVER_LOG_EVENT: &str = "server-log";
const APP_CONFIG_FILE_NAME: &str = "app-state.json";
const SESSION_METADATA_FILE_NAME: &str = ".minecraft-server-gui-session.json";
const START_SCRIPT_NAME: &str = "start.sh";
const EULA_FILE_NAME: &str = "eula.txt";
const DEFAULT_MEMORY_GB: u32 = 4;

struct AppState {
    runtime: Arc<Mutex<ServerRuntime>>,
}

struct ServerRuntime {
    child: Option<CommandChild>,
    status: ServerStatus,
    active_session: Option<ServerSession>,
    eula_pending: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
enum ServerStatus {
    Offline,
    Starting,
    Running,
    WaitingEula,
}

#[derive(Debug, Serialize, Clone)]
struct ServerStatusPayload {
    status: ServerStatus,
}

#[derive(Debug, Serialize, Clone)]
struct ServerLogPayload {
    kind: LogKind,
    message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
enum LogKind {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct AppConfig {
    active_session: Option<ServerSession>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ServerSession {
    server_name: String,
    server_dir: String,
    jar_file_name: String,
    java_path: String,
    memory_gb: u32,
    #[serde(default)]
    managed_by_app: bool,
}

#[derive(Debug, Deserialize)]
struct NewServerRequest {
    server_name: String,
    server_jar_path: String,
    parent_dir: String,
    java_path: String,
    memory_gb: u32,
}

#[derive(Debug, Serialize, Clone)]
struct JavaOption {
    label: String,
    path: String,
}

#[derive(Debug, Serialize, Clone)]
struct AppSnapshot {
    status: ServerStatus,
    active_session: Option<ServerSession>,
    java_versions: Vec<JavaOption>,
    eula_pending: bool,
}

impl Default for ServerRuntime {
    fn default() -> Self {
        Self {
            child: None,
            status: ServerStatus::Offline,
            active_session: None,
            eula_pending: false,
        }
    }
}

fn emit_status(app_handle: &tauri::AppHandle, status: ServerStatus) -> Result<(), String> {
    app_handle
        .emit(SERVER_STATUS_EVENT, ServerStatusPayload { status })
        .map_err(|e| format!("No se pudo emitir el estado del servidor: {e}"))
}

fn emit_log(
    app_handle: &tauri::AppHandle,
    kind: LogKind,
    message: impl Into<String>,
) -> Result<(), String> {
    app_handle
        .emit(
            SERVER_LOG_EVENT,
            ServerLogPayload {
                kind,
                message: message.into(),
            },
        )
        .map_err(|e| format!("No se pudo emitir un log del servidor: {e}"))
}

fn app_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo resolver la carpeta de configuración: {e}"))?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;

    Ok(config_dir.join(APP_CONFIG_FILE_NAME))
}

fn load_app_config(app_handle: &tauri::AppHandle) -> Result<AppConfig, String> {
    let config_path = app_config_path(app_handle)?;

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("No se pudo leer la configuración de la app: {e}"))?;

    Ok(serde_json::from_str::<AppConfig>(&content).unwrap_or_default())
}

fn save_app_config(app_handle: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let config_path = app_config_path(app_handle)?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("No se pudo serializar la configuración: {e}"))?;

    fs::write(config_path, content)
        .map_err(|e| format!("No se pudo guardar la configuración de la app: {e}"))
}

fn session_metadata_path(server_dir: &Path) -> PathBuf {
    server_dir.join(SESSION_METADATA_FILE_NAME)
}

fn save_session_metadata(session: &ServerSession) -> Result<(), String> {
    let server_dir = PathBuf::from(&session.server_dir);
    fs::create_dir_all(&server_dir)
        .map_err(|e| format!("No se pudo crear la carpeta del servidor: {e}"))?;

    let metadata_path = session_metadata_path(&server_dir);
    let content = serde_json::to_string_pretty(session)
        .map_err(|e| format!("No se pudo serializar la sesión del servidor: {e}"))?;

    fs::write(metadata_path, content)
        .map_err(|e| format!("No se pudo guardar la sesión del servidor: {e}"))
}

fn load_session_metadata(server_dir: &Path) -> Result<ServerSession, String> {
    let metadata_path = session_metadata_path(server_dir);

    if !metadata_path.is_file() {
        return Err(
            "La carpeta seleccionada no contiene una sesión creada por esta aplicación.".into(),
        );
    }

    let content = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("No se pudo leer la sesión del servidor: {e}"))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("La sesión guardada del servidor no es válida: {e}"))
}

fn default_java_path() -> String {
    let system_java = Path::new("/usr/bin/java");
    if system_java.is_file() {
        return system_java.to_string_lossy().to_string();
    }

    if let Ok(entries) = fs::read_dir("/usr/lib/jvm") {
        for entry in entries.flatten() {
            let java_path = entry.path().join("bin/java");
            if java_path.is_file() {
                return java_path.to_string_lossy().to_string();
            }
        }
    }

    "/usr/bin/java".to_string()
}

fn parse_memory_token(token: &str) -> Option<u32> {
    let normalized = token.trim_matches(|c| c == '\'' || c == '"');
    let value = normalized.strip_prefix("-Xmx")?;
    let upper = value.to_ascii_uppercase();

    if let Some(gb) = upper.strip_suffix('G') {
        return gb.parse::<u32>().ok().filter(|memory| *memory > 0);
    }

    if let Some(mb) = upper.strip_suffix('M') {
        let memory_mb = mb.parse::<u32>().ok()?;
        let memory_gb = (memory_mb / 1024).max(1);
        return Some(memory_gb);
    }

    None
}

fn infer_session_from_directory(server_dir: &Path) -> Result<ServerSession, String> {
    let server_name = server_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("minecraft-server")
        .to_string();

    let start_script_path = server_dir.join(START_SCRIPT_NAME);
    let mut java_path = default_java_path();
    let mut memory_gb = DEFAULT_MEMORY_GB;
    let mut jar_file_name: Option<String> = None;

    if start_script_path.is_file() {
        let content = fs::read_to_string(&start_script_path)
            .map_err(|e| format!("No se pudo leer `{START_SCRIPT_NAME}`: {e}"))?;

        let tokens: Vec<String> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim();
                !trimmed.is_empty() && !trimmed.starts_with('#')
            })
            .flat_map(|line| line.split_whitespace().map(str::to_string))
            .collect();

        if let Some(first_token) = tokens.first() {
            let parsed_java = first_token.trim_matches(|c| c == '\'' || c == '"');
            if Path::new(parsed_java).is_file() {
                java_path = parsed_java.to_string();
            }
        }

        for (index, token) in tokens.iter().enumerate() {
            if let Some(parsed_memory) = parse_memory_token(token) {
                memory_gb = parsed_memory;
            }

            if token == "-jar" {
                if let Some(next_token) = tokens.get(index + 1) {
                    let parsed_jar = next_token.trim_matches(|c| c == '\'' || c == '"');
                    if !parsed_jar.is_empty() {
                        jar_file_name = Path::new(parsed_jar)
                            .file_name()
                            .and_then(|name| name.to_str())
                            .map(|name| name.to_string());
                    }
                }
            }
        }
    }

    if jar_file_name.is_none() {
        if let Ok(entries) = fs::read_dir(server_dir) {
            let mut jars: Vec<String> = entries
                .flatten()
                .filter_map(|entry| {
                    let path = entry.path();
                    let extension = path.extension()?.to_str()?;
                    if extension.eq_ignore_ascii_case("jar") {
                        path.file_name()
                            .and_then(|name| name.to_str())
                            .map(|name| name.to_string())
                    } else {
                        None
                    }
                })
                .collect();

            jars.sort();
            jar_file_name = jars.into_iter().next();
        }
    }

    let jar_file_name = jar_file_name.ok_or_else(|| {
        "No encontré un archivo `.jar` ni una configuración reconocible dentro de la carpeta seleccionada.".to_string()
    })?;

    Ok(ServerSession {
        server_name,
        server_dir: server_dir.to_string_lossy().to_string(),
        jar_file_name,
        java_path,
        memory_gb,
        managed_by_app: false,
    })
}

fn load_or_infer_session(server_dir: &Path) -> Result<ServerSession, String> {
    if session_metadata_path(server_dir).is_file() {
        return load_session_metadata(server_dir);
    }

    infer_session_from_directory(server_dir)
}

fn quote_for_shell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn write_start_script(session: &ServerSession) -> Result<PathBuf, String> {
    let server_dir = PathBuf::from(&session.server_dir);
    let script_path = server_dir.join(START_SCRIPT_NAME);

    let content = format!(
        "#!/usr/bin/env sh\n{} -Xmx{}G -Xms{}G -jar {} nogui\n",
        quote_for_shell(&session.java_path),
        session.memory_gb,
        session.memory_gb,
        quote_for_shell(&session.jar_file_name)
    );

    fs::write(&script_path, content)
        .map_err(|e| format!("No se pudo crear el script de arranque: {e}"))?;

    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(&script_path)
            .map_err(|e| format!("No se pudo leer los permisos del script: {e}"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions)
            .map_err(|e| format!("No se pudieron aplicar permisos de ejecución: {e}"))?;
    }

    Ok(script_path)
}

fn ensure_eula_accepted(server_dir: &Path) -> Result<(), String> {
    let eula_path = server_dir.join(EULA_FILE_NAME);
    let content = if eula_path.exists() {
        fs::read_to_string(&eula_path)
            .map_err(|e| format!("No se pudo leer `{EULA_FILE_NAME}`: {e}"))?
    } else {
        String::new()
    };

    let new_content = if content.contains("eula=false") {
        content.replace("eula=false", "eula=true")
    } else if content.contains("eula=true") {
        content
    } else if content.trim().is_empty() {
        "eula=true\n".to_string()
    } else {
        format!("{content}\neula=true\n")
    };

    fs::write(&eula_path, new_content)
        .map_err(|e| format!("No se pudo actualizar `{EULA_FILE_NAME}`: {e}"))
}

fn eula_needs_acceptance(server_dir: &Path) -> bool {
    let eula_path = server_dir.join(EULA_FILE_NAME);
    match fs::read_to_string(eula_path) {
        Ok(content) => content.contains("eula=false"),
        Err(_) => false,
    }
}

fn collect_java_versions(active_session: Option<&ServerSession>) -> Vec<JavaOption> {
    let mut options = Vec::<JavaOption>::new();

    if let Ok(entries) = fs::read_dir("/usr/lib/jvm") {
        for entry in entries.flatten() {
            let java_path = entry.path().join("bin/java");
            if java_path.is_file() {
                options.push(JavaOption {
                    label: entry.file_name().to_string_lossy().to_string(),
                    path: java_path.to_string_lossy().to_string(),
                });
            }
        }
    }

    let system_java = Path::new("/usr/bin/java");
    if system_java.is_file() {
        options.push(JavaOption {
            label: "java del sistema".into(),
            path: system_java.to_string_lossy().to_string(),
        });
    }

    if let Some(session) = active_session {
        if !options
            .iter()
            .any(|option| option.path == session.java_path)
        {
            options.push(JavaOption {
                label: format!("Guardado ({})", session.java_path),
                path: session.java_path.clone(),
            });
        }
    }

    options.sort_by(|left, right| left.label.cmp(&right.label));
    options.dedup_by(|left, right| left.path == right.path);
    options
}

fn validate_server_name(server_name: &str) -> Result<String, String> {
    let trimmed = server_name.trim();
    if trimmed.is_empty() {
        return Err("Debes indicar un nombre para la carpeta del servidor.".into());
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("El nombre del servidor no puede contener separadores de ruta.".into());
    }

    Ok(trimmed.to_string())
}

fn validate_java_path(java_path: &str) -> Result<String, String> {
    let trimmed = java_path.trim();
    if trimmed.is_empty() {
        return Err("Debes seleccionar una versión de Java.".into());
    }

    let path = PathBuf::from(trimmed);
    if !path.is_file() {
        return Err("La ruta de Java seleccionada no existe o no es ejecutable.".into());
    }

    Ok(trimmed.to_string())
}

fn validate_memory_gb(memory_gb: u32) -> Result<u32, String> {
    let normalized = if memory_gb == 0 {
        DEFAULT_MEMORY_GB
    } else {
        memory_gb
    };

    if normalized == 0 {
        return Err("La memoria RAM debe ser mayor que cero.".into());
    }

    Ok(normalized)
}

fn create_server_session(request: NewServerRequest) -> Result<ServerSession, String> {
    let server_name = validate_server_name(&request.server_name)?;
    let java_path = validate_java_path(&request.java_path)?;
    let memory_gb = validate_memory_gb(request.memory_gb)?;

    let server_jar_path = PathBuf::from(request.server_jar_path.trim());
    if !server_jar_path.is_file() {
        return Err("Debes seleccionar un archivo `.jar` válido del servidor.".into());
    }

    if server_jar_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("jar"))
        != Some(true)
    {
        return Err("El archivo del software del servidor debe terminar en `.jar`.".into());
    }

    let parent_dir = PathBuf::from(request.parent_dir.trim());
    if !parent_dir.is_dir() {
        return Err("Debes seleccionar un directorio base válido para crear el servidor.".into());
    }

    let server_dir = parent_dir.join(&server_name);
    if server_dir.exists() {
        return Err(format!(
            "La carpeta `{}` ya existe. Elige otro nombre para el servidor.",
            server_name
        ));
    }

    fs::create_dir_all(&server_dir)
        .map_err(|e| format!("No se pudo crear la carpeta del servidor: {e}"))?;

    let jar_file_name = server_jar_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "No se pudo leer el nombre del archivo `.jar`.".to_string())?
        .to_string();

    let destination_jar = server_dir.join(&jar_file_name);
    fs::copy(&server_jar_path, &destination_jar)
        .map_err(|e| format!("No se pudo copiar el archivo del servidor: {e}"))?;

    let session = ServerSession {
        server_name,
        server_dir: server_dir.to_string_lossy().to_string(),
        jar_file_name,
        java_path,
        memory_gb,
        managed_by_app: true,
    };

    write_start_script(&session)?;
    save_session_metadata(&session)?;

    Ok(session)
}

fn validate_existing_session(session: &ServerSession) -> Result<(), String> {
    let server_dir = PathBuf::from(&session.server_dir);
    if !server_dir.is_dir() {
        return Err("La carpeta de la sesión guardada ya no existe.".into());
    }

    let jar_path = server_dir.join(&session.jar_file_name);
    if !jar_path.is_file() {
        return Err(format!(
            "No encontré el archivo `{}` dentro de la carpeta del servidor.",
            session.jar_file_name
        ));
    }

    let validated_java_path =
        validate_java_path(&session.java_path).unwrap_or_else(|_| default_java_path());
    let normalized_memory = validate_memory_gb(session.memory_gb)?;

    let normalized_session = ServerSession {
        java_path: validated_java_path,
        memory_gb: normalized_memory,
        ..session.clone()
    };

    if normalized_session.managed_by_app || !server_dir.join(START_SCRIPT_NAME).is_file() {
        write_start_script(&normalized_session)?;
    }

    Ok(())
}

fn build_snapshot(runtime: &ServerRuntime) -> AppSnapshot {
    AppSnapshot {
        status: runtime.status.clone(),
        active_session: runtime.active_session.clone(),
        java_versions: collect_java_versions(runtime.active_session.as_ref()),
        eula_pending: runtime.eula_pending,
    }
}

fn update_active_session(
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

fn sync_runtime_from_saved_config(
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

fn ensure_server_is_idle(runtime: &Arc<Mutex<ServerRuntime>>) -> Result<(), String> {
    let runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder al estado del servidor.".to_string())?;

    if runtime_guard.child.is_some() || runtime_guard.status != ServerStatus::Offline {
        return Err("Debes detener o cerrar la sesión actual antes de cambiar de servidor.".into());
    }

    Ok(())
}

fn current_session(runtime: &Arc<Mutex<ServerRuntime>>) -> Result<ServerSession, String> {
    let runtime_guard = runtime
        .lock()
        .map_err(|_| "No se pudo acceder a la sesión actual.".to_string())?;

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
        emit_status(app_handle, ServerStatus::Running)?;
        emit_log(app_handle, LogKind::System, "Servidor listo para recibir comandos.")?;
    }

    Ok(())
}

fn spawn_server_process(
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

    emit_status(app_handle, ServerStatus::Starting)?;
    emit_log(
        app_handle,
        LogKind::System,
        format!("Iniciando `{}`...", session.server_name),
    )?;

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

            emit_log(
                app_handle,
                LogKind::System,
                format!(
                    "Script `{}` ejecutado dentro de `{}`.",
                    START_SCRIPT_NAME, session.server_dir
                ),
            )?;

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
                            let _ = emit_log(&app_handle_for_task, LogKind::Stdout, text);
                        }
                        CommandEvent::Stderr(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            let _ = mark_server_as_running_if_ready(
                                &app_handle_for_task,
                                &runtime_for_task,
                                &text,
                            );
                            let _ = emit_log(&app_handle_for_task, LogKind::Stderr, text);
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

                                let _ =
                                    emit_status(&app_handle_for_task, ServerStatus::WaitingEula);
                                let _ = emit_log(
                                    &app_handle_for_task,
                                    LogKind::System,
                                    "El servidor generó `eula.txt`. Acepta el EULA para continuar.",
                                );
                            } else {
                                if let Ok(mut runtime_guard) = runtime_for_task.lock() {
                                    runtime_guard.status = ServerStatus::Offline;
                                    runtime_guard.eula_pending = false;
                                }

                                let _ = emit_status(&app_handle_for_task, ServerStatus::Offline);
                                let _ = emit_log(
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

                    let _ = emit_status(&app_handle_for_task, ServerStatus::Offline);
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

            let _ = emit_status(app_handle, ServerStatus::Offline);
            let _ = emit_log(
                app_handle,
                LogKind::Stderr,
                format!("No se pudo iniciar el servidor: {error}"),
            );

            Err(format!("No se pudo iniciar el servidor: {error}"))
        }
    }
}

#[tauri::command]
fn obtener_estado_aplicacion(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<AppSnapshot, String> {
    sync_runtime_from_saved_config(&app_handle, &state.runtime)?;
    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado de la aplicación.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
fn crear_e_iniciar_servidor(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: NewServerRequest,
) -> Result<AppSnapshot, String> {
    ensure_server_is_idle(&state.runtime)?;

    let session = create_server_session(request)?;
    update_active_session(&app_handle, &state.runtime, Some(session.clone()))?;

    emit_log(
        &app_handle,
        LogKind::System,
        format!(
            "Sesión `{}` creada en `{}`.",
            session.server_name, session.server_dir
        ),
    )?;

    spawn_server_process(&app_handle, &state.runtime, session)?;

    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado actualizado.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
fn abrir_servidor_existente(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    server_dir: String,
) -> Result<AppSnapshot, String> {
    ensure_server_is_idle(&state.runtime)?;

    let path = PathBuf::from(server_dir.trim());
    if !path.is_dir() {
        return Err("Debes seleccionar una carpeta de servidor válida.".into());
    }

    let session = load_or_infer_session(&path)?;
    validate_existing_session(&session)?;
    update_active_session(&app_handle, &state.runtime, Some(session.clone()))?;

    emit_log(
        &app_handle,
        LogKind::System,
        format!("Sesión `{}` abierta correctamente.", session.server_name),
    )?;

    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer la sesión abierta.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
fn iniciar_servidor_actual(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<AppSnapshot, String> {
    ensure_server_is_idle(&state.runtime)?;
    sync_runtime_from_saved_config(&app_handle, &state.runtime)?;

    let session = current_session(&state.runtime)?;
    spawn_server_process(&app_handle, &state.runtime, session)?;

    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado actualizado.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
fn aceptar_eula_y_reiniciar(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<AppSnapshot, String> {
    let session = {
        let runtime_guard = state
            .runtime
            .lock()
            .map_err(|_| "No se pudo acceder a la sesión actual.".to_string())?;

        if runtime_guard.status != ServerStatus::WaitingEula || !runtime_guard.eula_pending {
            return Err("No hay un EULA pendiente por aceptar.".into());
        }

        runtime_guard
            .active_session
            .clone()
            .ok_or_else(|| "No hay una sesión de servidor activa.".to_string())?
    };

    let session_dir = PathBuf::from(&session.server_dir);
    ensure_eula_accepted(&session_dir)?;
    emit_log(
        &app_handle,
        LogKind::System,
        "EULA aceptado. Reiniciando servidor...",
    )?;

    spawn_server_process(&app_handle, &state.runtime, session)?;

    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado actualizado.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
fn enviar_comando(comando: String, state: tauri::State<AppState>) -> Result<(), String> {
    let mut runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo acceder al proceso del servidor.".to_string())?;

    if runtime_guard.status != ServerStatus::Running {
        return Err("El servidor aún no está listo para recibir comandos.".into());
    }

    let child = runtime_guard
        .child
        .as_mut()
        .ok_or_else(|| "El servidor no está en ejecución.".to_string())?;

    send_command_to_server(child, &comando)
}

#[tauri::command]
fn detener_servidor(state: tauri::State<AppState>) -> Result<(), String> {
    let mut runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo acceder al proceso del servidor.".to_string())?;

    let child = runtime_guard
        .child
        .as_mut()
        .ok_or_else(|| "El servidor no está en ejecución.".to_string())?;

    send_command_to_server(child, "stop")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            runtime: Arc::new(Mutex::new(ServerRuntime::default())),
        })
        .invoke_handler(tauri::generate_handler![
            obtener_estado_aplicacion,
            crear_e_iniciar_servidor,
            abrir_servidor_existente,
            iniciar_servidor_actual,
            aceptar_eula_y_reiniciar,
            enviar_comando,
            detener_servidor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

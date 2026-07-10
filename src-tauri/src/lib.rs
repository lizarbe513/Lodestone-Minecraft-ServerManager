mod constants;
mod events;
mod java;
mod models;
mod runtime;
mod server_files;
mod sessions;

use crate::{
    events::emit_log,
    models::{AppSnapshot, LogKind, NewServerRequest, UpdateServerConfigRequest, ServerStatsPayload},
    runtime::{
        build_snapshot, current_session, ensure_server_is_idle, pending_eula_session,
        send_console_command, spawn_server_process, stop_server, sync_runtime_from_saved_config,
        update_active_session, AppState, ServerRuntime,
    },
    server_files::ensure_eula_accepted,
    sessions::{
        create_server_session, load_or_infer_session, update_server_session_config,
        validate_existing_session,
    },
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

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
    let session = pending_eula_session(&state.runtime)?;
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
    send_console_command(&state.runtime, &comando)
}

#[tauri::command]
fn detener_servidor(state: tauri::State<AppState>) -> Result<(), String> {
    stop_server(&state.runtime)
}

#[tauri::command]
fn abrir_carpeta_servidor(state: tauri::State<AppState>) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    if !path.is_dir() {
        return Err("La carpeta del servidor no existe o no es válida.".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("No se pudo abrir la carpeta en Windows: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("No se pudo abrir la carpeta en macOS: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("No se pudo abrir la carpeta en Linux: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn actualizar_configuracion_servidor(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: UpdateServerConfigRequest,
) -> Result<AppSnapshot, String> {
    let session = current_session(&state.runtime)?;
    let updated_session = update_server_session_config(&session, request)?;
    update_active_session(&app_handle, &state.runtime, Some(updated_session.clone()))?;

    emit_log(
        &app_handle,
        LogKind::System,
        format!("Configuración de `{}` actualizada.", updated_session.server_name),
    )?;

    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado actualizado.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
fn leer_server_properties(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir).join("server.properties");
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| format!("No se pudo leer server.properties: {}", e))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
fn guardar_server_properties(state: tauri::State<AppState>, contenido: String) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir).join("server.properties");
    std::fs::write(path, contenido).map_err(|e| format!("No se pudo guardar server.properties: {}", e))
}

#[tauri::command]
fn obtener_estadisticas_servidor(state: tauri::State<AppState>) -> Result<ServerStatsPayload, String> {
    let (cpu, ram_bytes) = crate::runtime::get_server_stats(&state.runtime);
    Ok(ServerStatsPayload {
        cpu,
        ram_mb: ram_bytes / 1024 / 1024,
    })
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
            detener_servidor,
            abrir_carpeta_servidor,
            actualizar_configuracion_servidor,
            leer_server_properties,
            guardar_server_properties,
            obtener_estadisticas_servidor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

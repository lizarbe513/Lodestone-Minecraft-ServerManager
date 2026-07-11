mod constants;
mod events;
mod extensions;
mod java;
mod models;
mod runtime;
mod server_files;
mod sessions;
mod worlds;

use crate::{
    events::emit_log,
    models::{AppSnapshot, LogKind, NewServerRequest, UpdateServerConfigRequest, ServerStatsPayload, ExtensionInfo},
    runtime::{
        build_snapshot, current_session, ensure_server_is_idle, pending_eula_session,
        send_console_command, spawn_server_process, stop_server, sync_runtime_from_saved_config,
        update_active_session, AppState, ServerRuntime,
    },
    server_files::ensure_eula_accepted,
    sessions::{
        create_server_session, load_app_config, load_or_infer_session, save_app_config,
        update_server_session_config, validate_existing_session,
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
fn remover_servidor_guardado(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    server_dir: String,
    delete_files: bool,
) -> Result<AppSnapshot, String> {
    ensure_server_is_idle(&state.runtime)?;

    let path = PathBuf::from(server_dir.trim());
    if delete_files && path.is_dir() {
        std::fs::remove_dir_all(&path)
            .map_err(|e| format!("No se pudo eliminar la carpeta del servidor: {e}"))?;
    }

    let mut config = load_app_config(&app_handle)?;
    config.saved_servers.retain(|s| s.server_dir != server_dir.trim());
    
    if let Some(active) = &config.active_session {
        if active.server_dir == server_dir.trim() {
            config.active_session = None;
        }
    }

    save_app_config(&app_handle, &config)?;
    sync_runtime_from_saved_config(&app_handle, &state.runtime)?;

    let runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado.".to_string())?;
    Ok(build_snapshot(&runtime_guard))
}

#[tauri::command]
async fn obtener_eula_texto(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let session_dir = PathBuf::from(&session.server_dir);
    Ok(crate::server_files::obtener_eula_texto_backend(&session_dir).await)
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
fn leer_archivo_servidor(state: tauri::State<AppState>, archivo: String) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    // Basic sanitization
    if archivo.contains("..") || archivo.contains('/') || archivo.contains('\\') {
        return Err("Nombre de archivo inválido".into());
    }
    let path = PathBuf::from(&session.server_dir).join(&archivo);
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| format!("No se pudo leer {}: {}", archivo, e))
    } else {
        Ok(String::new()) // Return empty if it doesn't exist
    }
}

#[tauri::command]
fn guardar_archivo_servidor(state: tauri::State<AppState>, archivo: String, contenido: String) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    if archivo.contains("..") || archivo.contains('/') || archivo.contains('\\') {
        return Err("Nombre de archivo inválido".into());
    }
    let path = PathBuf::from(&session.server_dir).join(&archivo);
    std::fs::write(path, contenido).map_err(|e| format!("No se pudo guardar {}: {}", archivo, e))
}

#[tauri::command]
fn obtener_estadisticas_servidor(state: tauri::State<AppState>) -> Result<ServerStatsPayload, String> {
    let (cpu, ram_bytes) = crate::runtime::get_server_stats(&state.runtime);
    Ok(ServerStatsPayload {
        cpu,
        ram_mb: ram_bytes / 1024 / 1024,
    })
}

#[tauri::command]
async fn descargar_servidor_jar(url: String, destino: String) -> Result<(), String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Error en la petición: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("El servidor devolvió un error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Error al descargar bytes: {}", e))?;

    let path = PathBuf::from(&destino);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando carpeta destino: {}", e))?;
    }

    std::fs::write(&path, &bytes)
        .map_err(|e| format!("Error guardando archivo: {}", e))?;

    Ok(())
}

#[tauri::command]
fn listar_mundos(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::worlds::get_worlds(&path)
}

#[tauri::command]
fn obtener_mundo_activo(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    Ok(crate::worlds::get_active_world(&path))
}

#[tauri::command]
fn cambiar_mundo_activo(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::worlds::set_active_world(&path, &mundo)?;
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Mundo activo cambiado a `{}`.", mundo),
    )?;
    Ok(())
}

#[tauri::command]
fn respaldar_mundo(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    mundo: String,
) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Creando respaldo del mundo `{}`...", mundo),
    )?;
    
    let backup_path = crate::worlds::backup_world(&path, &mundo)?;
    
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Respaldo creado en `{}`.", backup_path),
    )?;
    Ok(backup_path)
}

#[tauri::command]
fn borrar_mundo(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::worlds::delete_world(&path, &mundo)?;
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Mundo `{}` eliminado.", mundo),
    )?;
    Ok(())
}

#[tauri::command]
fn renombrar_mundo(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::worlds::rename_world(&path, &old_name, &new_name)?;
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Mundo `{}` renombrado a `{}`.", old_name, new_name),
    )?;
    Ok(())
}

#[tauri::command]
fn crear_mundo_nuevo(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::worlds::create_new_world(&path, &mundo)?;
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Nuevo mundo vacío `{}` creado.", mundo),
    )?;
    Ok(())
}

#[tauri::command]
fn importar_mundo_zip(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    zip_path: String,
    mundo: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Importando mundo desde `{}`...", zip_path),
    )?;
    
    crate::worlds::import_world_zip(&path, &zip_path, &mundo)?;
    
    emit_log(
        &app_handle,
        LogKind::System,
        format!("Mundo `{}` importado correctamente.", mundo),
    )?;
    Ok(())
}

#[tauri::command]
fn listar_extensiones(state: tauri::State<AppState>) -> Result<Vec<ExtensionInfo>, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::extensions::get_extensions(&path)
}

#[tauri::command]
fn eliminar_extension(
    state: tauri::State<AppState>,
    file_name: String,
    extension_type: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::extensions::delete_extension(&path, &file_name, &extension_type)
}

#[tauri::command]
async fn instalar_extension(
    state: tauri::State<'_, AppState>,
    download_url: String,
    file_name: String,
    extension_type: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::extensions::install_extension(&path, &download_url, &file_name, &extension_type).await
}

#[tauri::command]
fn detectar_motor_servidor(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    Ok(crate::extensions::detect_server_engine(&path, &session.jar_file_name))
}

#[tauri::command]
fn detectar_version_minecraft(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    Ok(crate::extensions::detect_minecraft_version(&path, &session.jar_file_name))
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
            obtener_eula_texto,
            enviar_comando,
            detener_servidor,
            abrir_carpeta_servidor,
            actualizar_configuracion_servidor,
            leer_server_properties,
            guardar_server_properties,
            leer_archivo_servidor,
            guardar_archivo_servidor,
            obtener_estadisticas_servidor,
            descargar_servidor_jar,
            listar_mundos,
            obtener_mundo_activo,
            cambiar_mundo_activo,
            respaldar_mundo,
            borrar_mundo,
            renombrar_mundo,
            crear_mundo_nuevo,
            importar_mundo_zip,
            remover_servidor_guardado,
            listar_extensiones,
            eliminar_extension,
            instalar_extension,
            detectar_motor_servidor,
            detectar_version_minecraft
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

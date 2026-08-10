pub mod commands;
pub mod core;


use crate::{
    core::events::emit_log,
    core::models::{AppSnapshot, LogKind, NewServerRequest, UpdateServerConfigRequest, ServerStatsPayload, ExtensionInfo},
    core::runtime::{
        build_snapshot, current_session, ensure_server_is_idle, pending_eula_session,
        send_console_command, spawn_server_process, stop_server, sync_runtime_from_saved_config,
        update_active_session, AppState, ServerRuntime,
    },
    commands::server_files::ensure_eula_accepted,
    commands::sessions::{
        create_server_session, load_app_config, load_or_infer_session, save_app_config,
        update_server_session_config, validate_existing_session,
    },
};
use std::{
    path::{Path, PathBuf},
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

    let start_immediately = request.start_immediately.unwrap_or(true);
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

    if start_immediately {
        spawn_server_process(&app_handle, &state.runtime, session)?;
    }

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
    
    let child_alive = {
        let runtime_guard = state.runtime.lock().unwrap();
        runtime_guard.child.is_some()
    };
    
    if child_alive {
        let _ = crate::core::runtime::send_console_command(&state.runtime, "true");
        let mut runtime_guard = state.runtime.lock().unwrap();
        runtime_guard.status = crate::core::models::ServerStatus::Starting;
        runtime_guard.eula_pending = false;
        
        emit_log(
            &app_handle,
            LogKind::System,
            "EULA aceptado interactivamente. Continuando arranque del servidor...",
        )?;
        
        return Ok(build_snapshot(&runtime_guard));
    }

    emit_log(
        &app_handle,
        LogKind::System,
        "EULA aceptado. Servidor listo para iniciarse.",
    )?;

    let mut runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado actualizado.".to_string())?;
        
    runtime_guard.status = crate::core::models::ServerStatus::Offline;
    runtime_guard.eula_pending = false;

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
        trash::delete(&path)
            .map_err(|e| format!("No se pudo mover la carpeta del servidor a la papelera: {e}"))?;
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
    Ok(crate::commands::server_files::obtener_eula_texto_backend(&session_dir).await)
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
fn abrir_carpeta_por_ruta(ruta: String) -> Result<(), String> {
    let path = PathBuf::from(&ruta);
    if !path.is_dir() {
        return Err("La carpeta no existe o no es válida.".into());
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
fn salir_aplicacion(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
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

fn sanitize_server_file_path(server_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let clean = relative_path.trim().trim_start_matches('/').trim_start_matches('\\');
    if clean.contains("..") {
        return Err("Ruta de archivo inválida: No se permite '..'.".into());
    }
    let target = server_dir.join(clean);
    
    if target.exists() {
        let canonical_base = server_dir.canonicalize()
            .map_err(|_| "Carpeta del servidor no encontrada.".to_string())?;
        let canonical_target = target.canonicalize()
            .map_err(|e| format!("Error resolviendo ruta: {e}"))?;
        if !canonical_target.starts_with(&canonical_base) {
            return Err("Acceso denegado: El archivo se encuentra fuera del directorio del servidor.".into());
        }
        Ok(canonical_target)
    } else {
        if let Some(parent) = target.parent() {
            if parent.exists() {
                let canonical_base = server_dir.canonicalize()
                    .map_err(|_| "Carpeta del servidor no encontrada.".to_string())?;
                let canonical_parent = parent.canonicalize()
                    .map_err(|e| format!("Error resolviendo carpeta: {e}"))?;
                if !canonical_parent.starts_with(&canonical_base) {
                    return Err("Acceso denegado: La carpeta destino está fuera del servidor.".into());
                }
            }
        }
        Ok(target)
    }
}

#[tauri::command]
fn leer_archivo_servidor(state: tauri::State<AppState>, archivo: String) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let server_dir = PathBuf::from(&session.server_dir);
    let path = sanitize_server_file_path(&server_dir, &archivo)?;
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| format!("No se pudo leer {}: {}", archivo, e))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
fn guardar_archivo_servidor(state: tauri::State<AppState>, archivo: String, contenido: String) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let server_dir = PathBuf::from(&session.server_dir);
    let path = sanitize_server_file_path(&server_dir, &archivo)?;
    std::fs::write(path, contenido).map_err(|e| format!("No se pudo guardar {}: {}", archivo, e))
}

#[tauri::command]
fn obtener_estadisticas_servidor(state: tauri::State<AppState>) -> Result<ServerStatsPayload, String> {
    let (cpu, ram_bytes) = crate::core::runtime::get_server_stats(&state.runtime);
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
    crate::commands::worlds::get_worlds(&path)
}

#[tauri::command]
fn obtener_mundo_activo(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    Ok(crate::commands::worlds::get_active_world(&path))
}

#[tauri::command]
fn cambiar_mundo_activo(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::commands::worlds::set_active_world(&path, &mundo)?;
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
    
    let backup_path = crate::commands::worlds::backup_world(&path, &mundo)?;
    
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
    crate::commands::worlds::delete_world(&path, &mundo)?;
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
    crate::commands::worlds::rename_world(&path, &old_name, &new_name)?;
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
    crate::commands::worlds::create_new_world(&path, &mundo)?;
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
    
    crate::commands::worlds::import_world_zip(&path, &zip_path, &mundo)?;
    
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
    crate::commands::extensions::get_extensions(&path)
}

#[tauri::command]
fn alternar_extension(
    state: tauri::State<AppState>,
    file_name: String,
    extension_type: String,
) -> Result<bool, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::commands::extensions::toggle_extension(&path, &file_name, &extension_type)
}

#[tauri::command]
fn eliminar_extension(
    state: tauri::State<AppState>,
    file_name: String,
    extension_type: String,
) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    crate::commands::extensions::delete_extension(&path, &file_name, &extension_type)
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
    crate::commands::extensions::install_extension(&path, &download_url, &file_name, &extension_type).await
}

#[tauri::command]
fn detectar_motor_servidor(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    Ok(crate::commands::extensions::detect_server_engine(&path, &session.jar_file_name))
}

#[tauri::command]
fn detectar_version_minecraft(state: tauri::State<AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    Ok(crate::commands::extensions::detect_minecraft_version(&path, &session.jar_file_name))
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
            alternar_extension,
            eliminar_extension,
            instalar_extension,
            detectar_motor_servidor,
            detectar_version_minecraft,
            crear_backup_completo,
            listar_backups,
            restaurar_backup,
            eliminar_backup,
            commands::mrpack::parse_mrpack,
            commands::mrpack::extract_mrpack_overrides,
            abrir_carpeta_por_ruta,
            salir_aplicacion,
            commands::mrpack::extraer_zip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn crear_backup_completo(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let session = current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    crate::commands::backups::create_full_backup(&path)
}

#[tauri::command]
fn listar_backups(state: tauri::State<AppState>) -> Result<Vec<crate::commands::backups::BackupInfo>, String> {
    let session = current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    crate::commands::backups::list_backups(&path)
}

#[tauri::command]
async fn restaurar_backup(state: tauri::State<'_, AppState>, backup_name: String) -> Result<(), String> {
    ensure_server_is_idle(&state.runtime)?;
    let session = current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    crate::commands::backups::restore_backup(&path, &backup_name)
}

#[tauri::command]
fn eliminar_backup(state: tauri::State<AppState>, backup_name: String) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    crate::commands::backups::delete_backup(&path, &backup_name)
}

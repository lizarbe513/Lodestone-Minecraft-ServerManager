use crate::core::models::ServerStatsPayload;
use crate::core::runtime::{current_session, stop_server, send_console_command, AppState};
use std::path::PathBuf;

#[tauri::command]
pub fn enviar_comando(comando: String, state: tauri::State<AppState>) -> Result<(), String> {
    send_console_command(&state.runtime, &comando)
}

#[tauri::command]
pub fn detener_servidor(state: tauri::State<AppState>) -> Result<(), String> {
    stop_server(&state.runtime)
}


#[tauri::command]
pub fn obtener_estadisticas_servidor(state: tauri::State<AppState>) -> Result<ServerStatsPayload, String> {
    let (cpu, ram_bytes) = crate::core::runtime::get_server_stats(&state.runtime);
    Ok(ServerStatsPayload {
        cpu,
        ram_mb: ram_bytes / 1024 / 1024,
    })
}

#[tauri::command]
pub fn abrir_carpeta_servidor(state: tauri::State<AppState>) -> Result<(), String> {
    let session = current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir);
    if !path.is_dir() {
        return Err("La carpeta del servidor no existe o no es válida.".into());
    }
    abrir_carpeta_en_sistema(&path)
}

#[tauri::command]
pub fn abrir_carpeta_por_ruta(ruta: String) -> Result<(), String> {
    let path = PathBuf::from(&ruta);
    if !path.is_dir() {
        return Err("La carpeta no existe o no es válida.".into());
    }
    abrir_carpeta_en_sistema(&path)
}

fn abrir_carpeta_en_sistema(path: &PathBuf) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("No se pudo abrir la carpeta en Windows: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("No se pudo abrir la carpeta en macOS: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("No se pudo abrir la carpeta en Linux: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn salir_aplicacion(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
pub async fn descargar_servidor_jar(url: String, destino: String) -> Result<(), String> {
    let urls: Vec<&str> = url.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    let mut last_error = "No se proporcionaron URLs válidas.".to_string();

    for current_url in urls {
        match reqwest::get(current_url).await {
            Ok(response) if response.status().is_success() => {
                let bytes = response
                    .bytes()
                    .await
                    .map_err(|e| format!("Error al descargar bytes de {}: {}", current_url, e))?;

                let path = PathBuf::from(&destino);
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Error creando carpeta destino: {}", e))?;
                }

                std::fs::write(&path, &bytes)
                    .map_err(|e| format!("Error guardando archivo: {}", e))?;

                return Ok(());
            },
            Ok(response) => {
                last_error = format!("Error {}: {}", response.status(), current_url);
            },
            Err(e) => {
                last_error = format!("Error {}: {}", e, current_url);
            }
        }
    }

    Err(last_error)
}

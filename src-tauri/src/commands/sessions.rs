use crate::{
    core::constants::{
        APP_CONFIG_FILE_NAME, DEFAULT_MEMORY_GB, SESSION_METADATA_FILE_NAME, START_SCRIPT_NAME,
    },
    commands::java::{default_java_path, validate_java_path},
    core::models::{AppConfig, NewServerRequest, ServerSession, UpdateServerConfigRequest},
    commands::server_files::write_start_script,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

pub fn app_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo resolver la carpeta de configuración: {e}"))?;

    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;

    Ok(config_dir.join(APP_CONFIG_FILE_NAME))
}

pub fn load_app_config(app_handle: &tauri::AppHandle) -> Result<AppConfig, String> {
    let config_path = app_config_path(app_handle)?;

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("No se pudo leer la configuración de la app: {e}"))?;

    serde_json::from_str::<AppConfig>(&content)
        .map_err(|e| format!("La configuración de la app está corrupta: {e}"))
}

pub fn save_app_config(app_handle: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let config_path = app_config_path(app_handle)?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("No se pudo serializar la configuración: {e}"))?;

    fs::write(config_path, content)
        .map_err(|e| format!("No se pudo guardar la configuración de la app: {e}"))
}

pub fn session_metadata_path(server_dir: &Path) -> PathBuf {
    server_dir.join(SESSION_METADATA_FILE_NAME)
}

pub fn save_session_metadata(session: &ServerSession) -> Result<(), String> {
    let server_dir = PathBuf::from(&session.server_dir);
    fs::create_dir_all(&server_dir)
        .map_err(|e| format!("No se pudo crear la carpeta del servidor: {e}"))?;

    let metadata_path = session_metadata_path(&server_dir);
    let content = serde_json::to_string_pretty(session)
        .map_err(|e| format!("No se pudo serializar la sesión del servidor: {e}"))?;

    fs::write(metadata_path, content)
        .map_err(|e| format!("No se pudo guardar la sesión del servidor: {e}"))
}

pub fn load_session_metadata(server_dir: &Path) -> Result<ServerSession, String> {
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

fn parse_memory_token(token: &str) -> Option<u32> {
    let normalized = token.trim_matches(|c| c == '\'' || c == '"');
    let value = normalized
        .strip_prefix("-Xmx")
        .or_else(|| normalized.strip_prefix("-Xms"))?;
    let upper = value.to_ascii_uppercase();

    if let Some(gb) = upper.strip_suffix('G') {
        return gb.parse::<u32>().ok();
    }

    if let Some(mb) = upper.strip_suffix('M') {
        return mb
            .parse::<u32>()
            .ok()
            .map(|memory| memory.saturating_add(1023).saturating_div(1024));
    }

    None
}

pub fn detect_version_from_jar_name(jar_name: &str) -> String {
    let mut current_version = String::new();
    let chars: Vec<char> = jar_name.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '1' && i + 2 < chars.len() && chars[i+1] == '.' && chars[i+2].is_ascii_digit() {
            let mut j = i;
            while j < chars.len() {
                let c = chars[j];
                if c.is_ascii_digit() || c == '.' {
                    current_version.push(c);
                    j += 1;
                } else {
                    break;
                }
            }
            if current_version.ends_with('.') {
                current_version.pop();
            }
            if current_version.contains('.') {
                return current_version;
            }
            current_version.clear();
            i = j;
        } else {
            i += 1;
        }
    }
    "unknown".to_string()
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

    let minecraft_version = Some(detect_version_from_jar_name(&jar_file_name));

    Ok(ServerSession {
        server_name,
        server_dir: server_dir.to_string_lossy().to_string(),
        jar_file_name,
        java_path,
        memory_gb,
        managed_by_app: false,
        minecraft_version,
    })
}

pub fn load_or_infer_session(server_dir: &Path) -> Result<ServerSession, String> {
    if session_metadata_path(server_dir).is_file() {
        return load_session_metadata(server_dir);
    }

    infer_session_from_directory(server_dir)
}

pub fn validate_server_name(server_name: &str) -> Result<String, String> {
    let trimmed = server_name.trim();
    if trimmed.is_empty() {
        return Err("Debes indicar un nombre para la carpeta del servidor.".into());
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("El nombre del servidor no puede contener separadores de ruta.".into());
    }

    Ok(trimmed.to_string())
}

pub fn validate_memory_gb(memory_gb: u32) -> Result<u32, String> {
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

pub fn create_server_session(request: NewServerRequest) -> Result<ServerSession, String> {
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

    let mut final_jar_name = jar_file_name.clone();
    if jar_file_name.starts_with("temp_") {
        final_jar_name = jar_file_name.replacen("temp_", "", 1);
    }

    let destination_jar = server_dir.join(&final_jar_name);
    fs::copy(&server_jar_path, &destination_jar)
        .map_err(|e| format!("No se pudo copiar el archivo del servidor: {e}"))?;

    if jar_file_name.starts_with("temp_") {
        let _ = fs::remove_file(&server_jar_path);
    }

    let minecraft_version = request.minecraft_version;
    let session = ServerSession {
        server_name,
        server_dir: server_dir.to_string_lossy().to_string(),
        jar_file_name: final_jar_name,
        java_path,
        memory_gb,
        managed_by_app: true,
        minecraft_version,
    };

    write_start_script(&session)?;
    save_session_metadata(&session)?;

    // Escribir configuración server.properties inicial
    let properties_content = format!(
        "level-name={}\n\
         gamemode={}\n\
         difficulty={}\n\
         max-players={}\n\
         online-mode={}\n\
         hardcore={}\n\
         pvp={}\n\
         allow-flight={}\n",
        request.world_name.as_deref().unwrap_or("world"),
        request.gamemode.as_deref().unwrap_or("survival"),
        request.difficulty.as_deref().unwrap_or("normal"),
        request.max_players.unwrap_or(20),
        request.online_mode.unwrap_or(true),
        request.hardcore.unwrap_or(false),
        request.pvp.unwrap_or(true),
        request.allow_flight.unwrap_or(false)
    );
    fs::write(server_dir.join("server.properties"), properties_content)
        .map_err(|e| format!("No se pudo escribir el archivo server.properties: {e}"))?;

    Ok(session)
}

pub fn update_server_session_config(
    session: &ServerSession,
    request: UpdateServerConfigRequest,
) -> Result<ServerSession, String> {
    let server_name = validate_server_name(&request.server_name)?;
    let java_path = validate_java_path(&request.java_path)?;
    let memory_gb = validate_memory_gb(request.memory_gb)?;

    let mut server_dir = PathBuf::from(&session.server_dir);
    if !server_dir.is_dir() {
        return Err("La carpeta de la sesión guardada ya no existe.".into());
    }

    if server_name != session.server_name {
        let parent_dir = server_dir.parent().ok_or_else(|| "No se pudo obtener la carpeta principal del servidor.".to_string())?;
        let new_server_dir = parent_dir.join(&server_name);
        
        if new_server_dir.exists() {
            return Err(format!(
                "La carpeta `{}` ya existe. Elige otro nombre para el servidor.",
                server_name
            ));
        }

        std::fs::rename(&server_dir, &new_server_dir)
            .map_err(|e| format!("No se pudo renombrar la carpeta del servidor: {e}"))?;
        
        server_dir = new_server_dir;
    }

    let jar_file_name = if request.server_jar_path.trim().is_empty() {
        session.jar_file_name.clone()
    } else {
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

        let mut jar_file_name = server_jar_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "No se pudo leer el nombre del archivo `.jar`.".to_string())?
            .to_string();

        let is_temp = jar_file_name.starts_with("temp_") && server_jar_path.parent() == Some(&server_dir);
        if is_temp {
            jar_file_name = jar_file_name.strip_prefix("temp_").unwrap().to_string();
        }

        let destination_jar = server_dir.join(&jar_file_name);
        
        if is_temp {
            fs::rename(&server_jar_path, &destination_jar)
                .map_err(|e| format!("No se pudo renombrar el archivo temporal: {e}"))?;
        } else if server_jar_path != destination_jar {
            fs::copy(&server_jar_path, &destination_jar)
                .map_err(|e| format!("No se pudo copiar el archivo del servidor: {e}"))?;
        }
        
        // Eliminar el archivo .jar anterior si es diferente
        if jar_file_name != session.jar_file_name {
            let old_jar_path = server_dir.join(&session.jar_file_name);
            if old_jar_path.exists() {
                let _ = fs::remove_file(old_jar_path);
            }
        }

        jar_file_name
    };

    let minecraft_version = if jar_file_name != session.jar_file_name {
        Some(detect_version_from_jar_name(&jar_file_name))
    } else {
        session.minecraft_version.clone()
    };

    let updated_session = ServerSession {
        server_name,
        server_dir: server_dir.to_string_lossy().to_string(),
        jar_file_name,
        java_path,
        memory_gb,
        managed_by_app: true,
        minecraft_version,
    };

    write_start_script(&updated_session)?;
    save_session_metadata(&updated_session)?;

    Ok(updated_session)
}

pub fn validate_existing_session(session: &ServerSession) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    fn temp_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{name}-{unique}"))
    }

    #[test]
    fn load_session_metadata_accepts_legacy_memory_gb_field() {
        let server_dir = temp_test_dir("legacy-session");
        fs::create_dir_all(&server_dir).unwrap();

        let metadata_path = session_metadata_path(&server_dir);
        let legacy_payload = format!(
            r#"{{
                "server_name": "demo",
                "server_dir": "{}",
                "jar_file_name": "server.jar",
                "java_path": "/usr/bin/java",
                "memory_mb": 2048,
                "managed_by_app": false
            }}"#,
            server_dir.to_string_lossy()
        );
        fs::write(&metadata_path, legacy_payload).unwrap();

        let session = load_session_metadata(&server_dir).unwrap();
        assert_eq!(session.memory_gb, 2);
    }

    #[test]
    fn update_server_session_config_rewrites_startup_settings() {
        let parent_test_dir = temp_test_dir("parent-config-update");
        let server_dir = parent_test_dir.join("demo");
        fs::create_dir_all(&server_dir).unwrap();

        let source_jar = temp_test_dir("source").join("source.jar");
        fs::create_dir_all(source_jar.parent().unwrap()).unwrap();
        fs::write(&source_jar, b"jar").unwrap();

        let session = ServerSession {
            server_name: "demo".into(),
            server_dir: server_dir.to_string_lossy().to_string(),
            jar_file_name: "old.jar".into(),
            java_path: "/usr/bin/java".into(),
            memory_gb: 2,
            managed_by_app: true,
            minecraft_version: None,
        };

        let updated = update_server_session_config(
            &session,
            UpdateServerConfigRequest {
                server_name: "demo-v2".into(),
                server_jar_path: source_jar.to_string_lossy().to_string(),
                java_path: "/usr/bin/java".into(),
                memory_gb: 8,
            },
        )
        .unwrap();

        assert_eq!(updated.server_name, "demo-v2");
        assert_eq!(updated.jar_file_name, "source.jar");
        assert_eq!(updated.memory_gb, 8);
        assert!(PathBuf::from(&updated.server_dir).join("source.jar").is_file());
    }
}

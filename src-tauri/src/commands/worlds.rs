use std::{fs, path::Path};
use zip::write::SimpleFileOptions;
use walkdir::WalkDir;

pub fn is_world_directory(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }

    // Lista negra explícita de carpetas del sistema y loaders que nunca son mundos
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        let lower = name.to_lowercase();
        const EXCLUDED_DIRS: &[&str] = &[
            "mods", "plugins", "config", "defaultconfigs", "logs", "crash-reports",
            "libraries", "versions", "datapacks", "cache", "world_backups", "backups",
            ".fabric", ".quilt", ".forge", ".neoforge", "assets", "natives"
        ];
        if EXCLUDED_DIRS.contains(&lower.as_str()) {
            return false;
        }
    }

    // Comprobación de archivos característicos de un mundo de Minecraft
    if path.join("level.dat").exists() || path.join("level.dat_old").exists() {
        return true;
    }
    if path.join("region").is_dir() || path.join("DIM-1").is_dir() || path.join("DIM1").is_dir() {
        return true;
    }

    false
}

pub fn get_worlds(server_dir: &Path) -> Result<Vec<String>, String> {
    let mut worlds = Vec::new();
    
    if !server_dir.is_dir() {
        return Ok(worlds);
    }
    
    let entries = fs::read_dir(server_dir)
        .map_err(|e| format!("Error al leer directorio del servidor: {}", e))?;
        
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if is_world_directory(&path) {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    worlds.push(name.to_string());
                }
            }
        }
    }
    
    Ok(worlds)
}

pub fn get_active_world(server_dir: &Path) -> String {
    let properties_path = server_dir.join("server.properties");
    if let Ok(content) = fs::read_to_string(properties_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("level-name=") {
                return line.replace("level-name=", "").trim().to_string();
            }
        }
    }
    "world".to_string()
}

pub fn set_active_world(server_dir: &Path, world_name: &str) -> Result<(), String> {
    let properties_path = server_dir.join("server.properties");
    let content = fs::read_to_string(&properties_path)
        .unwrap_or_else(|_| String::new());
        
    let mut new_content = String::new();
    let mut found = false;
    
    for line in content.lines() {
        if line.trim().starts_with("level-name=") {
            new_content.push_str(&format!("level-name={}\n", world_name));
            found = true;
        } else {
            new_content.push_str(line);
            new_content.push('\n');
        }
    }
    
    if !found {
        new_content.push_str(&format!("level-name={}\n", world_name));
    }
    
    fs::write(&properties_path, new_content)
        .map_err(|e| format!("Error al guardar server.properties: {}", e))
}

pub fn delete_world(server_dir: &Path, world_name: &str) -> Result<(), String> {
    if world_name.contains("..") || world_name.contains('/') || world_name.contains('\\') {
        return Err("Nombre de mundo inválido".to_string());
    }
    
    let world_path = server_dir.join(world_name);
    if !world_path.exists() {
        return Err("El mundo no existe".to_string());
    }
    
    fs::remove_dir_all(world_path)
        .map_err(|e| format!("Error al borrar la carpeta del mundo: {}", e))
}

pub fn rename_world(server_dir: &Path, old_name: &str, new_name: &str) -> Result<(), String> {
    if old_name.contains("..") || old_name.contains('/') || old_name.contains('\\') ||
       new_name.contains("..") || new_name.contains('/') || new_name.contains('\\') {
        return Err("Nombre de mundo inválido".to_string());
    }
    
    let old_path = server_dir.join(old_name);
    let new_path = server_dir.join(new_name);
    
    if !old_path.exists() {
        return Err("El mundo original no existe".to_string());
    }
    if new_path.exists() {
        return Err("Ya existe un archivo o carpeta con el nuevo nombre".to_string());
    }
    
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Error al renombrar la carpeta del mundo: {}", e))?;
        
    if get_active_world(server_dir) == old_name {
        let _ = set_active_world(server_dir, new_name);
    }
    
    Ok(())
}

pub fn create_new_world(server_dir: &Path, world_name: &str) -> Result<(), String> {
    if world_name.contains("..") || world_name.contains('/') || world_name.contains('\\') {
        return Err("Nombre de mundo inválido".to_string());
    }
    
    let world_path = server_dir.join(world_name);
    if world_path.exists() {
        return Err("Ya existe un mundo o carpeta con ese nombre".to_string());
    }
    
    fs::create_dir_all(&world_path)
        .map_err(|e| format!("Error al crear la carpeta del mundo: {}", e))
}

pub fn import_world_zip(server_dir: &Path, zip_path_str: &str, world_name: &str) -> Result<(), String> {
    if world_name.contains("..") || world_name.contains('/') || world_name.contains('\\') {
        return Err("Nombre de mundo inválido".to_string());
    }
    
    let world_path = server_dir.join(world_name);
    if world_path.exists() {
        return Err("Ya existe un mundo o carpeta con ese nombre".to_string());
    }
    
    let zip_file = fs::File::open(zip_path_str)
        .map_err(|e| format!("Error al abrir archivo zip: {}", e))?;
        
    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| format!("El archivo no es un zip válido: {}", e))?;
        
    fs::create_dir_all(&world_path)
        .map_err(|e| format!("Error al crear la carpeta del mundo: {}", e))?;
        
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let outpath = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };
        
        // Skip the first root directory of the zip if there is a wrapper folder
        // Actually, we should just extract as is. It might have a wrapper folder.
        // Let's just extract directly into world_path
        
        let final_outpath = world_path.join(outpath);
        if !final_outpath.starts_with(&world_path) {
            continue;
        }
        
        if (*file.name()).ends_with('/') {
            let _ = fs::create_dir_all(&final_outpath);
        } else {
            if let Some(p) = final_outpath.parent() {
                if !p.exists() {
                    let _ = fs::create_dir_all(p);
                }
            }
            let mut outfile = fs::File::create(&final_outpath)
                .map_err(|e| format!("Error al extraer archivo: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Error al escribir archivo extraído: {}", e))?;
        }
    }
    
    Ok(())
}

fn zip_dir(
    it: &mut dyn Iterator<Item = walkdir::DirEntry>,
    prefix: &str,
    writer: fs::File,
) -> zip::result::ZipResult<()> {
    let mut zip = zip::ZipWriter::new(writer);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for entry in it {
        let path = entry.path();
        let name = path.strip_prefix(Path::new(prefix)).unwrap();
        let name = name.to_string_lossy().to_string();

        if path.is_file() {
            zip.start_file(name, options)?;
            let mut f = fs::File::open(path)?;
            std::io::copy(&mut f, &mut zip)?;
        } else if !name.is_empty() {
            zip.add_directory(name, options)?;
        }
    }
    zip.finish()?;
    Ok(())
}

pub fn backup_world(server_dir: &Path, world_name: &str) -> Result<String, String> {
    if world_name.contains("..") || world_name.contains('/') || world_name.contains('\\') {
        return Err("Nombre de mundo inválido".to_string());
    }
    
    let world_path = server_dir.join(world_name);
    if !world_path.exists() {
        return Err("El mundo no existe".to_string());
    }
    
    let backups_dir = server_dir.join("backups");
    if !backups_dir.exists() {
        fs::create_dir_all(&backups_dir)
            .map_err(|e| format!("Error al crear carpeta de backups: {}", e))?;
    }
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
        
    let backup_filename = format!("{}_{}.zip", world_name, timestamp);
    let backup_path = backups_dir.join(&backup_filename);
    
    let file = fs::File::create(&backup_path)
        .map_err(|e| format!("Error al crear archivo zip: {}", e))?;
        
    let walkdir = WalkDir::new(&world_path);
    let it = walkdir.into_iter();
    
    zip_dir(&mut it.filter_map(|e| e.ok()), world_path.parent().unwrap().to_str().unwrap(), file)
        .map_err(|e| format!("Error al comprimir el mundo: {}", e))?;
        
    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn listar_mundos(state: tauri::State<crate::core::runtime::AppState>) -> Result<Vec<String>, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    get_worlds(&path)
}

#[tauri::command]
pub fn obtener_mundo_activo(state: tauri::State<crate::core::runtime::AppState>) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    Ok(get_active_world(&path))
}

#[tauri::command]
pub fn cambiar_mundo_activo(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    set_active_world(&path, &mundo)?;
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Mundo activo cambiado a `{}`.", mundo),
    );
    Ok(())
}

#[tauri::command]
pub fn respaldar_mundo(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
    mundo: String,
) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Creando respaldo del mundo `{}`...", mundo),
    );
    
    let backup_path = backup_world(&path, &mundo)?;
    
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Respaldo creado en `{}`.", backup_path),
    );
    Ok(backup_path)
}

#[tauri::command]
pub fn borrar_mundo(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    delete_world(&path, &mundo)?;
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Mundo `{}` eliminado.", mundo),
    );
    Ok(())
}

#[tauri::command]
pub fn renombrar_mundo(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    rename_world(&path, &old_name, &new_name)?;
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Mundo `{}` renombrado a `{}`.", old_name, new_name),
    );
    Ok(())
}

#[tauri::command]
pub fn crear_mundo_nuevo(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
    mundo: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    create_new_world(&path, &mundo)?;
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Nuevo mundo vacío `{}` creado.", mundo),
    );
    Ok(())
}

#[tauri::command]
pub fn importar_mundo_zip(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
    zip_path: String,
    mundo: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Importando mundo desde `{}`...", zip_path),
    );
    
    import_world_zip(&path, &zip_path, &mundo)?;
    
    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        format!("Mundo `{}` importado correctamente.", mundo),
    );
    Ok(())
}

use std::{fs, path::Path};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

#[derive(serde::Serialize)]
pub struct BackupInfo {
    pub filename: String,
    pub timestamp: u64,
    pub size_bytes: u64,
}

pub fn create_full_backup(server_dir: &Path) -> Result<String, String> {
    let backups_dir = server_dir.join("backups");
    if !backups_dir.exists() {
        fs::create_dir_all(&backups_dir)
            .map_err(|e| format!("Error al crear carpeta de backups: {}", e))?;
    }
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
        
    let backup_filename = format!("backup_completo_{}.zip", timestamp);
    let backup_path = backups_dir.join(&backup_filename);
    
    let file = fs::File::create(&backup_path)
        .map_err(|e| format!("Error al crear archivo zip de copia de seguridad: {}", e))?;
        
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for entry in WalkDir::new(server_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        
        // Evitar comprimir la carpeta de backups
        if path.starts_with(&backups_dir) {
            continue;
        }
        
        // Evitar comprimir cualquier archivo zip en el directorio raíz
        if path.is_file() && path.extension().map_or(false, |ext| ext == "zip") && path.parent() == Some(server_dir) {
            continue;
        }
        
        let name = path.strip_prefix(server_dir).unwrap();
        let name_str = name.to_string_lossy().to_string();
        if name_str.is_empty() {
            continue;
        }

        if path.is_file() {
            zip.start_file(&name_str, options)
                .map_err(|e| format!("Error al iniciar archivo zip: {}", e))?;
            let mut f = fs::File::open(path)
                .map_err(|e| format!("Error al abrir archivo: {}", e))?;
            std::io::copy(&mut f, &mut zip)
                .map_err(|e| format!("Error al copiar archivo a zip: {}", e))?;
        } else {
            zip.add_directory(&name_str, options)
                .map_err(|e| format!("Error al añadir carpeta a zip: {}", e))?;
        }
    }
    
    zip.finish().map_err(|e| format!("Error al finalizar zip: {}", e))?;
    
    Ok(backup_filename)
}

pub fn list_backups(server_dir: &Path) -> Result<Vec<BackupInfo>, String> {
    let mut backups = Vec::new();
    let backups_dir = server_dir.join("backups");
    
    if !backups_dir.is_dir() {
        return Ok(backups);
    }
    
    let entries = fs::read_dir(backups_dir)
        .map_err(|e| format!("Error al leer el directorio de backups: {}", e))?;
        
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "zip") {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(metadata) = entry.metadata() {
                    let size_bytes = metadata.len();
                    let timestamp = if let Ok(modified) = metadata.modified() {
                        modified.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()
                    } else {
                        0
                    };
                    
                    backups.push(BackupInfo {
                        filename: filename.to_string(),
                        timestamp,
                        size_bytes,
                    });
                }
            }
        }
    }
    
    // Ordenar de más reciente a más viejo
    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
    Ok(backups)
}

pub fn restore_backup(server_dir: &Path, backup_name: &str) -> Result<(), String> {
    if backup_name.contains("..") || backup_name.contains('/') || backup_name.contains('\\') {
        return Err("Nombre de backup inválido".to_string());
    }
    
    let backup_path = server_dir.join("backups").join(backup_name);
    if !backup_path.exists() {
        return Err("La copia de seguridad no existe".to_string());
    }
    
    let file = fs::File::open(&backup_path)
        .map_err(|e| format!("Error al abrir archivo de backup: {}", e))?;
        
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("El archivo de copia de seguridad no es un zip válido: {}", e))?;
        
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let outpath = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };
        
        let final_outpath = server_dir.join(outpath);
        if !final_outpath.starts_with(server_dir) {
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
                .map_err(|e| format!("Error al restaurar archivo: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Error al escribir archivo restaurado: {}", e))?;
        }
    }
    
    Ok(())
}

pub fn delete_backup(server_dir: &Path, backup_name: &str) -> Result<(), String> {
    if backup_name.contains("..") || backup_name.contains('/') || backup_name.contains('\\') {
        return Err("Nombre de backup inválido".to_string());
    }
    
    let backup_path = server_dir.join("backups").join(backup_name);
    if !backup_path.exists() {
        return Err("La copia de seguridad no existe".to_string());
    }
    
    fs::remove_file(backup_path)
        .map_err(|e| format!("Error al eliminar el archivo de copia de seguridad: {}", e))
}

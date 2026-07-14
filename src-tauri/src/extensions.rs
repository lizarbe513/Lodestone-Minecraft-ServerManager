use std::fs;
use std::path::Path;
use std::io::Read;
use zip::ZipArchive;
use crate::models::ExtensionInfo;

pub fn detect_server_engine(server_dir: &Path, jar_name: &str) -> String {
    let jar_path = server_dir.join(jar_name);
    
    // Try to identify from JAR contents
    if let Ok(file) = fs::File::open(&jar_path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name();
                    if name.contains("net/fabricmc/") || name == "fabric.mod.json" {
                        return "fabric".to_string();
                    }
                    if name.contains("org/quiltmc/") || name == "quilt.mod.json" {
                        return "quilt".to_string();
                    }
                    if name.contains("org/purpurmc/") || name == "purpur.yml" {
                        return "purpur".to_string();
                    }
                    if name.contains("com/destroystokyo/") || name.contains("io/papermc/") || name == "paper.yml" {
                        return "paper".to_string();
                    }
                    if name.contains("net/minecraftforge/") {
                        return "forge".to_string();
                    }
                    if name.contains("net/neoforged/") {
                        return "neoforge".to_string();
                    }
                }
            }
        }
    }

    // Fallback based on directory markers
    if server_dir.join("libraries/net/neoforged").is_dir() {
        return "neoforge".to_string();
    }
    if server_dir.join("libraries/net/minecraftforge").is_dir() {
        return "forge".to_string();
    }
    if server_dir.join("libraries/net/fabricmc").is_dir() {
        return "fabric".to_string();
    }
    if server_dir.join("spigot.yml").exists() || server_dir.join("paper.yml").exists() || server_dir.join("plugins").is_dir() {
        return "paper".to_string();
    }
    if server_dir.join("mods").is_dir() || server_dir.join(".fabric").is_dir() {
        return "fabric".to_string();
    }

    "vanilla".to_string()
}

fn parse_filename(file_name: &str) -> (String, String) {
    let stem = file_name.strip_suffix(".jar")
        .or_else(|| file_name.strip_suffix(".zip"))
        .unwrap_or(file_name);
        
    if let Some(pos) = stem.rfind('-') {
        let (name, ver) = stem.split_at(pos);
        let ver_trimmed = ver.trim_start_matches('-');
        if !ver_trimmed.is_empty() && (
            ver_trimmed.chars().next().unwrap().is_ascii_digit() || 
            (ver_trimmed.starts_with('v') && ver_trimmed.chars().nth(1).map_or(false, |c| c.is_ascii_digit()))
        ) {
            return (name.to_string(), ver_trimmed.to_string());
        }
    }
    (stem.to_string(), "Desconocida".to_string())
}

fn parse_plugin_jar(path: &Path) -> Option<ExtensionInfo> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let (mut name, mut version) = parse_filename(&file_name);
    let mut description = None;

    if let Ok(file) = fs::File::open(path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            if let Ok(mut plugin_yml) = archive.by_name("plugin.yml") {
                let mut content = String::new();
                if plugin_yml.read_to_string(&mut content).is_ok() {
                    for line in content.lines() {
                        let line = line.trim();
                        if line.starts_with("name:") {
                            name = line.replace("name:", "").trim().trim_matches('"').trim_matches('\'').to_string();
                        } else if line.starts_with("version:") {
                            version = line.replace("version:", "").trim().trim_matches('"').trim_matches('\'').to_string();
                        } else if line.starts_with("description:") {
                            description = Some(line.replace("description:", "").trim().trim_matches('"').trim_matches('\'').to_string());
                        }
                    }
                }
            }
        }
    }

    Some(ExtensionInfo {
        name,
        version,
        file_name,
        extension_type: "plugin".to_string(),
        description,
        enabled: true,
    })
}

fn parse_mod_jar(path: &Path) -> Option<ExtensionInfo> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let (mut name, mut version) = parse_filename(&file_name);
    let mut description = None;

    if let Ok(file) = fs::File::open(path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            if let Ok(mut fabric_mod_json) = archive.by_name("fabric.mod.json") {
                let mut content = String::new();
                if fabric_mod_json.read_to_string(&mut content).is_ok() {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(n) = json.get("name").and_then(|v| v.as_str()) {
                            name = n.to_string();
                        } else if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                            name = id.to_string();
                        }
                        if let Some(v) = json.get("version").and_then(|v| v.as_str()) {
                            version = v.to_string();
                        }
                        if let Some(d) = json.get("description").and_then(|v| v.as_str()) {
                            description = Some(d.to_string());
                        }
                    }
                }
            }
        }
    }

    Some(ExtensionInfo {
        name,
        version,
        file_name,
        extension_type: "mod".to_string(),
        description,
        enabled: true,
    })
}

fn parse_datapack_zip(path: &Path) -> Option<ExtensionInfo> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let name = file_name.replace(".zip", "");
    let mut description = None;

    if let Ok(file) = fs::File::open(path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            if let Ok(mut pack_mcmeta) = archive.by_name("pack.mcmeta") {
                let mut content = String::new();
                if pack_mcmeta.read_to_string(&mut content).is_ok() {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(desc) = json.get("pack").and_then(|p| p.get("description")) {
                            if let Some(s) = desc.as_str() {
                                description = Some(s.to_string());
                            } else if let Some(obj) = desc.get("text").and_then(|t| t.as_str()) {
                                description = Some(obj.to_string());
                            } else {
                                description = Some(desc.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Some(ExtensionInfo {
        name,
        version: "1.0".to_string(),
        file_name,
        extension_type: "datapack".to_string(),
        description,
        enabled: true,
    })
}

fn parse_datapack_dir(path: &Path) -> Option<ExtensionInfo> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let mut description = None;

    let mcmeta_path = path.join("pack.mcmeta");
    if mcmeta_path.is_file() {
        if let Ok(content) = fs::read_to_string(mcmeta_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(desc) = json.get("pack").and_then(|p| p.get("description")) {
                    if let Some(s) = desc.as_str() {
                        description = Some(s.to_string());
                    } else if let Some(obj) = desc.get("text").and_then(|t| t.as_str()) {
                        description = Some(obj.to_string());
                    } else {
                        description = Some(desc.to_string());
                    }
                }
            }
        }
    }

    Some(ExtensionInfo {
        name: file_name.clone(),
        version: "1.0".to_string(),
        file_name,
        extension_type: "datapack".to_string(),
        description,
        enabled: true,
    })
}

pub fn get_extensions(server_dir: &Path) -> Result<Vec<ExtensionInfo>, String> {
    let mut extensions = Vec::new();

    // 1. Plugins
    let plugins_dir = server_dir.join("plugins");
    if plugins_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(plugins_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "jar") {
                    if let Some(info) = parse_plugin_jar(&path) {
                        extensions.push(info);
                    }
                }
            }
        }
    }

    // 2. Mods
    let mods_dir = server_dir.join("mods");
    if mods_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "jar") {
                    if let Some(info) = parse_mod_jar(&path) {
                        extensions.push(info);
                    }
                }
            }
        }
    }

    // 3. Datapacks
    let active_world = crate::worlds::get_active_world(server_dir);
    let datapacks_dir = server_dir.join(&active_world).join("datapacks");
    if datapacks_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(datapacks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "zip") {
                    if let Some(info) = parse_datapack_zip(&path) {
                        extensions.push(info);
                    }
                } else if path.is_dir() {
                    if let Some(info) = parse_datapack_dir(&path) {
                        extensions.push(info);
                    }
                }
            }
        }
    }

    Ok(extensions)
}

pub fn delete_extension(server_dir: &Path, file_name: &str, extension_type: &str) -> Result<(), String> {
    let path = if extension_type == "datapack" {
        let active_world = crate::worlds::get_active_world(server_dir);
        server_dir.join(&active_world).join("datapacks").join(file_name)
    } else {
        let folder = if extension_type == "plugin" { "plugins" } else { "mods" };
        server_dir.join(folder).join(file_name)
    };

    if path.exists() {
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| format!("Error al eliminar la carpeta del datapack: {}", e))
        } else {
            fs::remove_file(path).map_err(|e| format!("Error al eliminar el archivo: {}", e))
        }
    } else {
        Err("El archivo de la extensión no existe.".to_string())
    }
}

pub async fn install_extension(server_dir: &Path, download_url: &str, file_name: &str, extension_type: &str) -> Result<(), String> {
    let dest_dir = if extension_type == "datapack" {
        let active_world = crate::worlds::get_active_world(server_dir);
        server_dir.join(&active_world).join("datapacks")
    } else {
        let folder = if extension_type == "plugin" { "plugins" } else { "mods" };
        server_dir.join(folder)
    };

    fs::create_dir_all(&dest_dir).map_err(|e| format!("Error al crear la carpeta de destino: {}", e))?;
    let dest_path = dest_dir.join(file_name);

    let response = reqwest::get(download_url)
        .await
        .map_err(|e| format!("Error al conectar con el servidor de descarga: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("El servidor devolvió un error: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| format!("Error al descargar bytes: {}", e))?;
    fs::write(dest_path, bytes).map_err(|e| format!("Error al guardar el archivo: {}", e))?;

    Ok(())
}

pub fn detect_minecraft_version(server_dir: &Path, jar_name: &str) -> String {
    if let Ok(metadata) = crate::sessions::load_session_metadata(server_dir) {
        if let Some(version) = metadata.minecraft_version {
            if !version.is_empty() && version != "unknown" {
                return version;
            }
        }
    }

    let jar_path = server_dir.join(jar_name);
    if !jar_path.exists() {
        return crate::sessions::detect_version_from_jar_name(jar_name);
    }

    if let Ok(file) = fs::File::open(&jar_path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            // 1. Buscar version.json en el zip
            for i in 0..archive.len() {
                if let Ok(mut zip_file) = archive.by_index(i) {
                    let name = zip_file.name().to_string();
                    if name == "version.json" || name.ends_with("/version.json") {
                        let mut content = String::new();
                        if zip_file.read_to_string(&mut content).is_ok() {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                                    return id.to_string();
                                }
                            }
                        }
                    }
                }
            }

            // 2. Buscar propiedades de instalación de Fabric
            for i in 0..archive.len() {
                if let Ok(mut zip_file) = archive.by_index(i) {
                    let name = zip_file.name().to_string();
                    if name.ends_with("install.properties") || name.ends_with("fabric-server-launcher.properties") {
                        let mut content = String::new();
                        if zip_file.read_to_string(&mut content).is_ok() {
                            for line in content.lines() {
                                let line = line.trim();
                                if line.starts_with("gameVersion=") || line.starts_with("minecraft_version=") {
                                    let parts: Vec<&str> = line.split('=').collect();
                                    if parts.len() > 1 {
                                        return parts[1].trim().to_string();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    crate::sessions::detect_version_from_jar_name(jar_name)
}


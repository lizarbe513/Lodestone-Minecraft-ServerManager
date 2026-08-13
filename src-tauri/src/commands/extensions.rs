use std::fs;
use std::path::Path;
use std::io::Read;
use zip::ZipArchive;
use crate::core::models::ExtensionInfo;

pub fn detect_server_engine(server_dir: &Path, jar_name: &str) -> String {
    let lower_jar = jar_name.to_lowercase();
    
    // 1. Detección directa por nombre del archivo JAR
    if lower_jar.contains("neoforge") {
        return "neoforge".to_string();
    }
    if lower_jar.contains("fabric") {
        return "fabric".to_string();
    }
    if lower_jar.contains("quilt") {
        return "quilt".to_string();
    }
    if lower_jar.contains("purpur") {
        return "purpur".to_string();
    }
    if lower_jar.contains("paper") || lower_jar.contains("spigot") {
        return "paper".to_string();
    }
    if lower_jar.contains("forge") {
        return "forge".to_string();
    }

    // 2. Detección por carpetas y archivos generados por instaladores modernos
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

    // Comprobar scripts de arranque de instaladores (run.sh, unix_args.txt, etc.)
    for args_file in &["unix_args.txt", "win_args.txt", "user_jvm_args.txt", "run.sh", "run.bat"] {
        let args_path = server_dir.join(args_file);
        if args_path.is_file() {
            if let Ok(content) = fs::read_to_string(&args_path) {
                let content_lower = content.to_lowercase();
                if content_lower.contains("net/neoforged") || content_lower.contains("neoforge") {
                    return "neoforge".to_string();
                }
                if content_lower.contains("net/minecraftforge") || content_lower.contains("forge") {
                    return "forge".to_string();
                }
            }
        }
    }

    // 3. Inspeccionar el contenido del JAR (ZIP)
    let jar_path = server_dir.join(jar_name);
    if let Ok(file) = fs::File::open(&jar_path) {
        if let Ok(mut archive) = ZipArchive::new(file) {
            let mut is_neoforge = false;
            let mut is_forge = false;
            let mut is_fabric = false;
            let mut is_quilt = false;
            let mut is_purpur = false;
            let mut is_paper = false;

            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name().to_lowercase();
                    if name.contains("net/neoforged/") || name.contains("neoforge") {
                        is_neoforge = true;
                    }
                    if name.contains("net/minecraftforge/") {
                        is_forge = true;
                    }
                    if name.contains("net/fabricmc/") || name == "fabric.mod.json" {
                        is_fabric = true;
                    }
                    if name.contains("org/quiltmc/") || name == "quilt.mod.json" {
                        is_quilt = true;
                    }
                    if name.contains("org/purpurmc/") || name == "purpur.yml" {
                        is_purpur = true;
                    }
                    if name.contains("com/destroystokyo/") || name.contains("io/papermc/") || name == "paper.yml" {
                        is_paper = true;
                    }
                }
            }

            // IMPORTANTE: NeoForge debe comprobarse ANTES que Forge
            if is_neoforge {
                return "neoforge".to_string();
            }
            if is_forge {
                return "forge".to_string();
            }
            if is_fabric {
                return "fabric".to_string();
            }
            if is_quilt {
                return "quilt".to_string();
            }
            if is_purpur {
                return "purpur".to_string();
            }
            if is_paper {
                return "paper".to_string();
            }
        }
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

fn is_extension_file(path: &Path, valid_ext: &str) -> bool {
    if !path.is_file() {
        return false;
    }
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    if name.ends_with(valid_ext) {
        return true;
    }
    let disabled_ext = format!("{}.disabled", valid_ext);
    if name.ends_with(&disabled_ext) {
        return true;
    }
    false
}

pub fn get_extensions(server_dir: &Path) -> Result<Vec<ExtensionInfo>, String> {
    let mut extensions = Vec::new();

    // 1. Plugins
    let plugins_dir = server_dir.join("plugins");
    if plugins_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(plugins_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if is_extension_file(&path, ".jar") {
                    if let Some(mut info) = parse_plugin_jar(&path) {
                        info.enabled = !info.file_name.ends_with(".disabled");
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
                if is_extension_file(&path, ".jar") {
                    if let Some(mut info) = parse_mod_jar(&path) {
                        info.enabled = !info.file_name.ends_with(".disabled");
                        extensions.push(info);
                    }
                }
            }
        }
    }

    // 3. Datapacks
    let active_world = crate::commands::worlds::get_active_world(server_dir);
    let datapacks_dir = server_dir.join(&active_world).join("datapacks");
    if datapacks_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(datapacks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if is_extension_file(&path, ".zip") {
                    if let Some(mut info) = parse_datapack_zip(&path) {
                        info.enabled = !info.file_name.ends_with(".disabled");
                        extensions.push(info);
                    }
                } else if path.is_dir() {
                    if let Some(mut info) = parse_datapack_dir(&path) {
                        info.enabled = !info.file_name.ends_with(".disabled");
                        extensions.push(info);
                    }
                }
            }
        }
    }

    Ok(extensions)
}

pub fn toggle_extension(server_dir: &Path, file_name: &str, extension_type: &str) -> Result<bool, String> {
    let folder_path = if extension_type == "datapack" {
        let active_world = crate::commands::worlds::get_active_world(server_dir);
        server_dir.join(&active_world).join("datapacks")
    } else {
        let folder = if extension_type == "plugin" { "plugins" } else { "mods" };
        server_dir.join(folder)
    };

    let file_path = folder_path.join(file_name);
    if !file_path.exists() {
        return Err("El archivo de la extensión no existe.".to_string());
    }

    if file_name.ends_with(".disabled") {
        let new_file_name = file_name.strip_suffix(".disabled").unwrap();
        let new_path = folder_path.join(new_file_name);
        fs::rename(&file_path, &new_path).map_err(|e| format!("Error al activar la extensión: {}", e))?;
        Ok(true)
    } else {
        let new_file_name = format!("{}.disabled", file_name);
        let new_path = folder_path.join(new_file_name);
        fs::rename(&file_path, &new_path).map_err(|e| format!("Error al desactivar la extensión: {}", e))?;
        Ok(false)
    }
}

pub fn delete_extension(server_dir: &Path, file_name: &str, extension_type: &str) -> Result<(), String> {
    let path = if extension_type == "datapack" {
        let active_world = crate::commands::worlds::get_active_world(server_dir);
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
        let active_world = crate::commands::worlds::get_active_world(server_dir);
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
    if let Ok(metadata) = crate::commands::sessions::load_session_metadata(server_dir) {
        if let Some(version) = metadata.minecraft_version {
            let clean = version.trim();
            if !clean.is_empty() && clean != "unknown" {
                if let Some((mc, _)) = clean.split_once('|') {
                    return mc.trim().to_string();
                }
                return clean.to_string();
            }
        }
    }

    let jar_path = server_dir.join(jar_name);
    if !jar_path.exists() {
        return crate::commands::sessions::detect_version_from_jar_name(jar_name);
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
                                        let ver = parts[1].trim();
                                        if let Some((mc, _)) = ver.split_once('|') {
                                            return mc.trim().to_string();
                                        }
                                        return ver.to_string();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    crate::commands::sessions::detect_version_from_jar_name(jar_name)
}

pub fn import_local_extensions(server_dir: &Path, file_paths: Vec<String>, extension_type: &str) -> Result<usize, String> {
    if file_paths.is_empty() {
        return Err("No se seleccionaron archivos para importar.".to_string());
    }

    let dest_dir = if extension_type == "datapack" {
        let active_world = crate::commands::worlds::get_active_world(server_dir);
        server_dir.join(&active_world).join("datapacks")
    } else {
        let folder = if extension_type == "plugin" { "plugins" } else { "mods" };
        server_dir.join(folder)
    };

    fs::create_dir_all(&dest_dir).map_err(|e| format!("Error al crear la carpeta de destino: {}", e))?;

    let mut imported_count = 0;
    for file_path_str in file_paths {
        let src_path = Path::new(&file_path_str);
        if !src_path.is_file() {
            continue;
        }

        let file_name = match src_path.file_name() {
            Some(name) => name,
            None => continue,
        };

        let target_path = dest_dir.join(file_name);
        fs::copy(src_path, &target_path).map_err(|e| format!("Error copiando {:?}: {}", file_name, e))?;
        imported_count += 1;
    }

    Ok(imported_count)
}

#[tauri::command]
pub fn importar_extensiones_locales(
    state: tauri::State<crate::core::runtime::AppState>,
    file_paths: Vec<String>,
    extension_type: String,
) -> Result<usize, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    import_local_extensions(&path, file_paths, &extension_type)
}

#[tauri::command]
pub fn listar_extensiones(state: tauri::State<crate::core::runtime::AppState>) -> Result<Vec<ExtensionInfo>, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    get_extensions(&path)
}

#[tauri::command]
pub fn alternar_extension(
    state: tauri::State<crate::core::runtime::AppState>,
    file_name: String,
    extension_type: String,
) -> Result<bool, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    toggle_extension(&path, &file_name, &extension_type)
}

#[tauri::command]
pub fn eliminar_extension(
    state: tauri::State<crate::core::runtime::AppState>,
    file_name: String,
    extension_type: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    delete_extension(&path, &file_name, &extension_type)
}

#[tauri::command]
pub async fn instalar_extension(
    state: tauri::State<'_, crate::core::runtime::AppState>,
    download_url: String,
    file_name: String,
    extension_type: String,
) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    install_extension(&path, &download_url, &file_name, &extension_type).await
}

#[tauri::command]
pub fn detectar_motor_servidor(state: tauri::State<crate::core::runtime::AppState>) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    Ok(detect_server_engine(&path, &session.jar_file_name))
}

#[tauri::command]
pub fn detectar_version_minecraft(state: tauri::State<crate::core::runtime::AppState>) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = std::path::PathBuf::from(&session.server_dir);
    Ok(detect_minecraft_version(&path, &session.jar_file_name))
}

const CLIENT_ONLY_MOD_PATTERNS: &[&str] = &[
    "xaero", "minimap", "journeymap", "iris", "sodium", "rubidium",
    "oculus", "embeddium", "entityculling", "notenoughanimations",
    "appleskin", "modmenu", "controlling", "inventoryhud", "optifine",
    "zoom", "dynamiclights", "itemphysic", "continuity", "indium",
    "resourcify", "soundphysics", "skinlayers", "3dskinlayers",
    "cherishedworlds", "borderless", "smoothboot", "lazydfu",
    "ferritecore", "reeses-sodium-options"
];

#[tauri::command]
pub fn deshabilitar_mods_cliente_en_ruta(server_dir: String) -> Result<usize, String> {
    let mods_path = std::path::Path::new(&server_dir).join("mods");
    if !mods_path.is_dir() {
        return Ok(0);
    }

    let entries = fs::read_dir(&mods_path).map_err(|e| format!("Error leyendo mods: {e}"))?;
    let mut count = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            if (name.ends_with(".jar") || name.ends_with(".zip")) && !name.ends_with(".disabled") {
                let is_client_only = CLIENT_ONLY_MOD_PATTERNS.iter().any(|p| name.contains(p));
                if is_client_only {
                    let file_stem = path.file_name().unwrap().to_string_lossy();
                    let new_name = format!("{}.disabled", file_stem);
                    let new_path = mods_path.join(new_name);
                    if let Ok(_) = fs::rename(&path, &new_path) {
                        count += 1;
                    }
                }
            }
        }
    }

    Ok(count)
}


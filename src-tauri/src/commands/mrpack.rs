use std::fs;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

#[tauri::command]
pub fn parse_mrpack(path: String) -> Result<String, String> {
    let file = fs::File::open(&path).map_err(|e| format!("Error abriendo mrpack: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Error leyendo zip: {e}"))?;

    let mut index_file = archive
        .by_name("modrinth.index.json")
        .map_err(|e| format!("No se encontró modrinth.index.json: {e}"))?;

    let mut content = String::new();
    index_file
        .read_to_string(&mut content)
        .map_err(|e| format!("Error leyendo modrinth.index.json: {e}"))?;

    Ok(content)
}

#[tauri::command]
pub fn extract_mrpack_overrides(path: String, dest_dir: String) -> Result<(), String> {
    let file = fs::File::open(&path).map_err(|e| format!("Error abriendo mrpack: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Error leyendo zip: {e}"))?;
    let dest_path = Path::new(&dest_dir);

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Error leyendo archivo {i} en zip: {e}"))?;

        let name = file.name().to_string();
        
        let extract_path = if name.starts_with("overrides/") {
            name.strip_prefix("overrides/").unwrap()
        } else if name.starts_with("server-overrides/") {
            name.strip_prefix("server-overrides/").unwrap()
        } else {
            continue;
        };

        if extract_path.is_empty() {
            continue;
        }

        let outpath = dest_path.join(extract_path);

        if file.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Error creando carpeta {:?}: {e}", outpath))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(&p)
                        .map_err(|e| format!("Error creando carpetas padre para {:?}: {e}", outpath))?;
                }
            }
            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| format!("Error creando archivo {:?}: {e}", outpath))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Error copiando contenido a {:?}: {e}", outpath))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn extraer_zip(path: String, dest_dir: String) -> Result<(), String> {
    let file = fs::File::open(&path).map_err(|e| format!("Error abriendo zip: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Error leyendo zip: {e}"))?;
    let dest_path = Path::new(&dest_dir);

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Error leyendo archivo {i} en zip: {e}"))?;

        let outpath = dest_path.join(file.name());

        if file.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Error creando carpeta {:?}: {e}", outpath))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(&p)
                        .map_err(|e| format!("Error creando carpetas padre para {:?}: {e}", outpath))?;
                }
            }
            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| format!("Error creando archivo {:?}: {e}", outpath))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Error copiando contenido a {:?}: {e}", outpath))?;
        }
    }

    Ok(())
}


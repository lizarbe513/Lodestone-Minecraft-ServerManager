use crate::{
    core::constants::EULA_FILE_NAME,
    core::models::ServerSession,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

fn quote_for_shell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub trait ScriptGenerator {
    fn generate(&self, session: &ServerSession) -> String;
}

pub struct WindowsScriptGenerator;
pub struct UnixScriptGenerator;

impl ScriptGenerator for WindowsScriptGenerator {
    fn generate(&self, session: &ServerSession) -> String {
        let memory_mb = session.memory_gb.saturating_mul(1024);
        let is_installer = session.jar_file_name.ends_with("-installer.jar");
        let mut script = format!("@echo off\nset \"JAVA_EXE={}\"\n\n", session.java_path.replace('/', "\\"));
        if is_installer {
            let target_jar = session.jar_file_name.replace("-installer.jar", ".jar");
            script.push_str(&format!("if exist \"{}\" (\n  echo Ejecutando instalador...\n  \"%JAVA_EXE%\" -jar \"{}\" --installServer\n  ren \"{}\" \"{}.done\"\n)\n\n", session.jar_file_name, session.jar_file_name, session.jar_file_name, session.jar_file_name));
            script.push_str(&format!("if exist \"run.bat\" (\n  (echo -Xmx{}M & echo -Xms{}M) > user_jvm_args.txt\n  call run.bat\n) else if exist \"{}\" (\n  \"%JAVA_EXE%\" -Xmx{}M -Xms{}M -jar \"{}\" nogui\n) else (\n  echo No se encontro script de inicio ni jar ejecutable.\n)\n", memory_mb, memory_mb, target_jar, memory_mb, memory_mb, target_jar));
        } else {
            script.push_str(&format!("\"%JAVA_EXE%\" -Xmx{}M -Xms{}M -jar {} nogui\n", memory_mb, memory_mb, session.jar_file_name));
        }
        script
    }
}

impl ScriptGenerator for UnixScriptGenerator {
    fn generate(&self, session: &ServerSession) -> String {
        let memory_mb = session.memory_gb.saturating_mul(1024);
        let is_installer = session.jar_file_name.ends_with("-installer.jar");
        let mut script = format!("#!/usr/bin/env sh\n");
        let java_q = quote_for_shell(&session.java_path);
        let jar_q = quote_for_shell(&session.jar_file_name);
        if is_installer {
            let target_jar = session.jar_file_name.replace("-installer.jar", ".jar");
            let target_jar_q = quote_for_shell(&target_jar);
            script.push_str(&format!("if [ -f {} ]; then\n  echo \"Ejecutando instalador...\"\n  {} -jar {} --installServer\n  mv {} {}.done\nfi\n\n", jar_q, java_q, jar_q, jar_q, jar_q));
            script.push_str(&format!("if [ -f \"run.sh\" ]; then\n  chmod +x run.sh 2>/dev/null || true\n  printf -- \"-Xmx%sM\\n-Xms%sM\\n\" \"{}\" \"{}\" > user_jvm_args.txt\n  sh run.sh\nelif [ -f {} ]; then\n  {} -Xmx{}M -Xms{}M -jar {} nogui\nelse\n  SERVER_JAR=$(ls *.jar 2>/dev/null | grep -v \"-installer\" | head -n 1)\n  if [ -n \"$SERVER_JAR\" ]; then\n    {} -Xmx{}M -Xms{}M -jar \"$SERVER_JAR\" nogui\n  else\n    echo \"No se encontró el ejecutable del servidor.\"\n    exit 1\n  fi\nfi\n", memory_mb, memory_mb, target_jar_q, java_q, memory_mb, memory_mb, target_jar_q, java_q, memory_mb, memory_mb));
        } else {
            script.push_str(&format!("{} -Xmx{}M -Xms{}M -jar {} nogui\n", java_q, memory_mb, memory_mb, jar_q));
        }
        script
    }
}

fn start_script_name_for_platform(platform: &str) -> &'static str {
    match platform {
        "windows" => "start.bat",
        _ => "start.sh",
    }
}

pub fn write_start_script(session: &ServerSession) -> Result<PathBuf, String> {
    let server_dir = PathBuf::from(&session.server_dir);
    let script_name = if cfg!(windows) {
        start_script_name_for_platform("windows")
    } else {
        start_script_name_for_platform("unix")
    };
    let script_path = server_dir.join(script_name);

    let generator: Box<dyn ScriptGenerator> = if cfg!(windows) {
        Box::new(WindowsScriptGenerator)
    } else {
        Box::new(UnixScriptGenerator)
    };

    let content = generator.generate(session);

    fs::write(&script_path, content)
        .map_err(|e| format!("No se pudo crear el script de arranque: {e}"))?;

    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(&script_path)
            .map_err(|e| format!("No se pudo leer los permisos del script: {e}"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions)
            .map_err(|e| format!("No se pudieron aplicar permisos de ejecución: {e}"))?;
    }

    Ok(script_path)
}

pub fn ensure_eula_accepted(server_dir: &Path) -> Result<(), String> {
    let eula_path = server_dir.join(EULA_FILE_NAME);
    let content = if eula_path.exists() {
        fs::read_to_string(&eula_path)
            .map_err(|e| format!("No se pudo leer `{EULA_FILE_NAME}`: {e}"))?
    } else {
        String::new()
    };

    let new_content = if content.contains("eula=false") {
        content.replace("eula=false", "eula=true")
    } else if content.contains("eula=true") {
        content
    } else if content.trim().is_empty() {
        "eula=true\n".to_string()
    } else {
        format!("{content}\neula=true\n")
    };

    fs::write(&eula_path, new_content)
        .map_err(|e| format!("No se pudo actualizar `{EULA_FILE_NAME}`: {e}"))
}

pub fn eula_needs_acceptance(server_dir: &Path) -> bool {
    let eula_path = server_dir.join(EULA_FILE_NAME);
    match fs::read_to_string(eula_path) {
        Ok(content) => content.contains("eula=false"),
        Err(_) => false,
    }
}

pub fn extract_eula_url(server_dir: &Path) -> String {
    let eula_path = server_dir.join(EULA_FILE_NAME);
    if let Ok(content) = fs::read_to_string(&eula_path) {
        for line in content.lines() {
            if line.trim().starts_with('#') {
                if let Some(start_idx) = line.find("http") {
                    let end_idx = line[start_idx..].find(|c: char| c == ')' || c.is_whitespace())
                        .map(|i| start_idx + i)
                        .unwrap_or(line.len());
                    return line[start_idx..end_idx].to_string();
                }
            }
        }
    }
    "https://aka.ms/MinecraftEULA".to_string()
}

fn strip_html(html: &str) -> String {
    let step1 = html
        .replace("<p>", "\n\n")
        .replace("</p>", "\n")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<h1>", "\n\n=== ")
        .replace("</h1>", " ===\n\n")
        .replace("<h2>", "\n\n--- ")
        .replace("</h2>", " ---\n\n")
        .replace("<h3>", "\n\n")
        .replace("</h3>", "\n")
        .replace("<li>", "\n* ")
        .replace("</li>", "");

    let mut in_tag = false;
    let mut clean = String::new();
    for c in step1.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            clean.push(c);
        }
    }

    let final_clean = clean
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");

    let mut result = String::new();
    let mut consecutive_newlines = 0;
    for line in final_clean.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            consecutive_newlines += 1;
            if consecutive_newlines <= 2 {
                result.push('\n');
            }
        } else {
            consecutive_newlines = 0;
            result.push_str(line);
            result.push('\n');
        }
    }

    result.trim().to_string()
}

fn extract_eula_rich_text(html: &str) -> String {
    if let Some(start_idx) = html.find("class=\"MC_Link_Style_RichText\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let content_start = start_idx + tag_end + 1;
            if let Some(end_offset) = html[content_start..].find("</div>") {
                let content_end = content_start + end_offset;
                return html[content_start..content_end].to_string();
            }
        }
    }
    html.to_string()
}

pub async fn obtener_eula_texto_backend(server_dir: &Path) -> String {
    let url = extract_eula_url(server_dir);
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .timeout(std::time::Duration::from_secs(5))
        .build();

    if let Ok(c) = client {
        if let Ok(res) = c.get(&url).send().await {
            if res.status().is_success() {
                if let Ok(html) = res.text().await {
                    let rich_text = extract_eula_rich_text(&html);
                    let clean = strip_html(&rich_text);
                    if !clean.is_empty() {
                        return clean;
                    }
                }
            }
        }
    }

    include_str!("../eula_offline.txt").to_string()
}

pub fn sanitize_server_file_path(server_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
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
pub fn aceptar_eula_y_reiniciar(
    app_handle: tauri::AppHandle,
    state: tauri::State<crate::core::runtime::AppState>,
) -> Result<crate::core::models::AppSnapshot, String> {
    let session = crate::core::runtime::pending_eula_session(&state.runtime)?;
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
        
        let _ = crate::core::events::emit_log(
            &app_handle,
            crate::core::models::LogKind::System,
            "EULA aceptado interactivamente. Continuando arranque del servidor...",
        );
        
        return Ok(crate::core::runtime::build_snapshot(&runtime_guard));
    }

    let _ = crate::core::events::emit_log(
        &app_handle,
        crate::core::models::LogKind::System,
        "EULA aceptado. Servidor listo para iniciarse.",
    );

    let mut runtime_guard = state
        .runtime
        .lock()
        .map_err(|_| "No se pudo leer el estado actualizado.".to_string())?;
        
    runtime_guard.status = crate::core::models::ServerStatus::Offline;
    runtime_guard.eula_pending = false;

    Ok(crate::core::runtime::build_snapshot(&runtime_guard))
}

#[tauri::command]
pub async fn obtener_eula_texto(
    state: tauri::State<'_, crate::core::runtime::AppState>,
) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let session_dir = PathBuf::from(&session.server_dir);
    Ok(obtener_eula_texto_backend(&session_dir).await)
}

#[tauri::command]
pub fn leer_server_properties(state: tauri::State<crate::core::runtime::AppState>) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir).join("server.properties");
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| format!("No se pudo leer server.properties: {}", e))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn guardar_server_properties(state: tauri::State<crate::core::runtime::AppState>, contenido: String) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let path = PathBuf::from(&session.server_dir).join("server.properties");
    std::fs::write(path, contenido).map_err(|e| format!("No se pudo guardar server.properties: {}", e))
}

#[tauri::command]
pub fn leer_archivo_servidor(state: tauri::State<crate::core::runtime::AppState>, archivo: String) -> Result<String, String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let server_dir = PathBuf::from(&session.server_dir);
    let path = sanitize_server_file_path(&server_dir, &archivo)?;
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| format!("No se pudo leer {}: {}", archivo, e))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn guardar_archivo_servidor(state: tauri::State<crate::core::runtime::AppState>, archivo: String, contenido: String) -> Result<(), String> {
    let session = crate::core::runtime::current_session(&state.runtime)?;
    let server_dir = PathBuf::from(&session.server_dir);
    let path = sanitize_server_file_path(&server_dir, &archivo)?;
    std::fs::write(path, contenido).map_err(|e| format!("No se pudo guardar {}: {}", archivo, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::models::ServerSession;

    #[test]
    fn start_script_name_uses_shell_script_on_unix_like_platforms() {
        assert_eq!(start_script_name_for_platform("linux"), "start.sh");
        assert_eq!(start_script_name_for_platform("macos"), "start.sh");
    }

    #[test]
    fn start_script_name_uses_batch_script_on_windows() {
        assert_eq!(start_script_name_for_platform("windows"), "start.bat");
    }

    #[test]
    fn start_script_content_for_windows_uses_batch_syntax() {
        let session = ServerSession {
            server_name: "demo".into(),
            server_dir: "/tmp/demo".into(),
            jar_file_name: "server.jar".into(),
            java_path: "C:/Program Files/Java/jre/bin/java.exe".into(),
            memory_gb: 2,
            managed_by_app: true,
            minecraft_version: None,
        };

        let generator = WindowsScriptGenerator;
        let content = generator.generate(&session);
        assert!(content.contains("@echo off"));
        assert!(content.contains("server.jar"));
        assert!(content.contains("-Xmx2048M"));
    }
}

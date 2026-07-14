use crate::{
    constants::EULA_FILE_NAME,
    models::ServerSession,
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

fn start_script_name_for_platform(platform: &str) -> &'static str {
    match platform {
        "windows" => "start.bat",
        _ => "start.sh",
    }
}

fn start_script_content_for_platform(session: &ServerSession, platform: &str) -> String {
    let memory_mb = session.memory_gb.saturating_mul(1024);

    match platform {
        "windows" => format!(
            "@echo off\nset \"JAVA_EXE={} \"\n\n\"%JAVA_EXE%\" -Xmx{}M -Xms{}M -jar {} nogui\n",
            session.java_path.replace('/', "\\"),
            memory_mb,
            memory_mb,
            session.jar_file_name
        ),
        _ => format!(
            "#!/usr/bin/env sh\n{} -Xmx{}M -Xms{}M -jar {} nogui\n",
            quote_for_shell(&session.java_path),
            memory_mb,
            memory_mb,
            quote_for_shell(&session.jar_file_name)
        ),
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

    let content = if cfg!(windows) {
        start_script_content_for_platform(session, "windows")
    } else {
        start_script_content_for_platform(session, "unix")
    };

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

    include_str!("eula_offline.txt").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ServerSession;

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

        let content = start_script_content_for_platform(&session, "windows");
        assert!(content.contains("@echo off"));
        assert!(content.contains("server.jar"));
        assert!(content.contains("-Xmx2048M"));
    }
}

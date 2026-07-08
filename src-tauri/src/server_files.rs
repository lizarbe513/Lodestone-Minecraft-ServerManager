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
        };

        let content = start_script_content_for_platform(&session, "windows");
        assert!(content.contains("@echo off"));
        assert!(content.contains("server.jar"));
        assert!(content.contains("-Xmx2048M"));
    }
}

use crate::models::{JavaOption, ServerSession};
use std::{env, fs, path::Path};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub fn default_java_path() -> String {
    if let Some(java_home) = env::var_os("JAVA_HOME") {
        let java_home = Path::new(&java_home);
        let candidates = [
            java_home.join("bin/java"),
            java_home.join("jre/bin/java"),
        ];

        for candidate in candidates {
            if candidate.is_file() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    let system_java = Path::new("/usr/bin/java");
    if system_java.is_file() {
        return system_java.to_string_lossy().to_string();
    }

    if let Ok(entries) = fs::read_dir("/usr/lib/jvm") {
        for entry in entries.flatten() {
            let java_path = entry.path().join("bin/java");
            if java_path.is_file() {
                return java_path.to_string_lossy().to_string();
            }
        }
    }

    "/usr/bin/java".to_string()
}

pub fn validate_java_path(java_path: &str) -> Result<String, String> {
    let trimmed = java_path.trim();
    if trimmed.is_empty() {
        return Err("Debes seleccionar una versión de Java.".into());
    }

    let path = Path::new(trimmed);
    if !path.is_file() {
        return Err("La ruta de Java seleccionada no existe o no es ejecutable.".into());
    }

    #[cfg(unix)]
    {
        let metadata = fs::metadata(path)
            .map_err(|e| format!("No se pudo leer la ruta de Java: {e}"))?;
        let permissions = metadata.permissions();
        if permissions.mode() & 0o111 == 0 {
            return Err("La ruta de Java seleccionada no es ejecutable.".into());
        }
    }

    Ok(trimmed.to_string())
}

pub fn collect_java_versions(active_session: Option<&ServerSession>) -> Vec<JavaOption> {
    let mut options = Vec::<JavaOption>::new();

    if let Some(java_home) = env::var_os("JAVA_HOME") {
        let java_home = Path::new(&java_home);
        let candidates = [
            ("JAVA_HOME", java_home.join("bin/java")),
            ("JAVA_HOME/jre", java_home.join("jre/bin/java")),
        ];

        for (label, java_path) in candidates {
            if java_path.is_file() {
                options.push(JavaOption {
                    label: label.to_string(),
                    path: java_path.to_string_lossy().to_string(),
                });
            }
        }
    }

    if let Ok(entries) = fs::read_dir("/usr/lib/jvm") {
        for entry in entries.flatten() {
            let java_path = entry.path().join("bin/java");
            if java_path.is_file() {
                options.push(JavaOption {
                    label: entry.file_name().to_string_lossy().to_string(),
                    path: java_path.to_string_lossy().to_string(),
                });
            }
        }
    }

    let system_java = Path::new("/usr/bin/java");
    if system_java.is_file() {
        options.push(JavaOption {
            label: "java del sistema".into(),
            path: system_java.to_string_lossy().to_string(),
        });
    }

    if let Some(session) = active_session {
        if !options
            .iter()
            .any(|option| option.path == session.java_path)
        {
            options.push(JavaOption {
                label: format!("Guardado ({})", session.java_path),
                path: session.java_path.clone(),
            });
        }
    }

    options.sort_by(|left, right| left.label.cmp(&right.label));
    options.dedup_by(|left, right| left.path == right.path);
    options
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

    fn temp_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{name}-{unique}"))
    }

    #[cfg(unix)]
    #[test]
    fn validate_java_path_rejects_non_executable_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_path = PathBuf::from(format!("/tmp/java-check-{unique}"));
        fs::write(&temp_path, "#!/bin/sh\nexit 0\n").unwrap();

        let mut permissions = fs::metadata(&temp_path).unwrap().permissions();
        permissions.set_mode(0o644);
        fs::set_permissions(&temp_path, permissions).unwrap();

        let err = validate_java_path(temp_path.to_str().unwrap()).unwrap_err();
        assert!(err.contains("ejecutable"));

        let _ = fs::remove_file(&temp_path);
    }

    #[cfg(unix)]
    #[test]
    fn validate_java_path_accepts_executable_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_path = PathBuf::from(format!("/tmp/java-check-{unique}"));
        fs::write(&temp_path, "#!/bin/sh\nexit 0\n").unwrap();

        let mut permissions = fs::metadata(&temp_path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&temp_path, permissions).unwrap();

        let resolved = validate_java_path(temp_path.to_str().unwrap()).unwrap();
        assert_eq!(resolved, temp_path.to_string_lossy().to_string());

        let _ = fs::remove_file(&temp_path);
    }

    #[test]
    fn collect_java_versions_uses_java_home_when_available() {
        let java_home = temp_test_dir("java-home");
        let java_bin = java_home.join("bin");
        fs::create_dir_all(&java_bin).unwrap();

        let java_path = java_bin.join("java");
        fs::write(&java_path, "#!/bin/sh\nexit 0\n").unwrap();

        let mut permissions = fs::metadata(&java_path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&java_path, permissions).unwrap();

        let previous_java_home = std::env::var("JAVA_HOME").ok();
        std::env::set_var("JAVA_HOME", &java_home);
        let options = collect_java_versions(None);

        if let Some(previous) = previous_java_home {
            std::env::set_var("JAVA_HOME", previous);
        } else {
            std::env::remove_var("JAVA_HOME");
        }

        assert!(
            options.iter().any(|option| option.path == java_path.to_string_lossy()),
            "expected JAVA_HOME-based Java to be discovered"
        );
    }
}

use crate::core::constants::DEFAULT_MEMORY_GB;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerStatus {
    Offline,
    Starting,
    Running,
    WaitingEula,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum LogKind {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppConfig {
    pub active_session: Option<ServerSession>,
    #[serde(default)]
    pub saved_servers: Vec<ServerSession>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerSession {
    pub server_name: String,
    pub server_dir: String,
    pub jar_file_name: String,
    pub java_path: String,
    pub memory_gb: u32,
    #[serde(default)]
    pub managed_by_app: bool,
    #[serde(default)]
    pub minecraft_version: Option<String>,
}

impl<'de> Deserialize<'de> for ServerSession {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct ServerSessionRaw {
            server_name: String,
            server_dir: String,
            jar_file_name: String,
            java_path: String,
            #[serde(default)]
            memory_gb: Option<u32>,
            #[serde(default)]
            memory_mb: Option<u32>,
            #[serde(default)]
            managed_by_app: bool,
            #[serde(default)]
            minecraft_version: Option<String>,
        }

        let raw = ServerSessionRaw::deserialize(deserializer)?;
        let memory_gb = raw.memory_gb.or_else(|| {
            raw.memory_mb
                .map(|memory_mb| memory_mb.saturating_div(1024))
        })
        .unwrap_or(DEFAULT_MEMORY_GB);

        Ok(Self {
            server_name: raw.server_name,
            server_dir: raw.server_dir,
            jar_file_name: raw.jar_file_name,
            java_path: raw.java_path,
            memory_gb,
            managed_by_app: raw.managed_by_app,
            minecraft_version: raw.minecraft_version,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct NewServerRequest {
    pub server_name: String,
    pub server_jar_path: String,
    pub parent_dir: String,
    pub java_path: String,
    pub memory_gb: u32,
    pub world_name: Option<String>,
    pub gamemode: Option<String>,
    pub difficulty: Option<String>,
    pub max_players: Option<u32>,
    pub online_mode: Option<bool>,
    pub hardcore: Option<bool>,
    pub pvp: Option<bool>,
    pub allow_flight: Option<bool>,
    pub minecraft_version: Option<String>,
    pub start_immediately: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateServerConfigRequest {
    pub server_name: String,
    pub server_jar_path: String,
    pub java_path: String,
    pub memory_gb: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct JavaOption {
    pub label: String,
    pub path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AppSnapshot {
    pub status: ServerStatus,
    pub active_session: Option<ServerSession>,
    pub java_versions: Vec<JavaOption>,
    pub eula_pending: bool,
    pub saved_servers: Vec<ServerSession>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerStatusPayload {
    pub status: ServerStatus,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerLogPayload {
    pub kind: LogKind,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerStatsPayload {
    pub cpu: f32,
    pub ram_mb: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExtensionInfo {
    pub name: String,
    pub version: String,
    pub file_name: String,
    pub extension_type: String, // "plugin" o "mod"
    pub description: Option<String>,
    pub enabled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_deser_app_state() {
        let content = std::fs::read_to_string("/home/leonardo/.config/norditex.minecraft-server-gui/app-state.json").unwrap();
        match serde_json::from_str::<AppConfig>(&content) {
            Ok(config) => println!("SUCCESS_JSON_TEST: {:?}", config),
            Err(e) => panic!("FAILED_JSON_TEST: {}", e),
        }
    }
}

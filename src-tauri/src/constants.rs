pub const SERVER_STATUS_EVENT: &str = "server-status";
pub const SERVER_LOG_EVENT: &str = "server-log";
pub const APP_CONFIG_FILE_NAME: &str = "app-state.json";
pub const SESSION_METADATA_FILE_NAME: &str = ".minecraft-server-gui-session.json";
pub const START_SCRIPT_NAME: &str = if cfg!(windows) { "start.bat" } else { "start.sh" };
pub const EULA_FILE_NAME: &str = "eula.txt";
pub const DEFAULT_MEMORY_GB: u32 = 4;

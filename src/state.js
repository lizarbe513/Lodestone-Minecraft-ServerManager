export const statusLabels = {
  offline: "Apagado",
  starting: "Iniciando",
  running: "Encendido",
  waiting_eula: "Esperando EULA",
};

export const appState = {
  status: "offline",
  activeSession: null,
  javaVersions: [],
  eulaPending: false,
  currentPage: "home",
  pendingCreateFlow: false,
  savedServers: [],
};

export const connectedPlayers = new Set();

export const globals = {
  statsInterval: null,
  pendingConfirmAction: null,
  lastRenderedSessionDir: null,
  parsedProperties: {},
  rawPropertiesLines: [],
  cachedVanillaVersions: null,
};

export const EXCLUDED_PROPERTIES = [];

export const PROPERTY_GROUPS = {
  "Mundo y Generación": ["motd", "max-players", "max-world-size", "view-distance", "simulation-distance", "max-build-height", "allow-nether", "generate-structures"],
  "Reglas del Juego": ["gamemode", "difficulty", "hardcore", "pvp", "allow-flight", "force-gamemode"],
  "Generación de Entidades": ["spawn-monsters", "spawn-animals", "spawn-npcs"],
  "Seguridad y Accesos": ["enforce-whitelist", "white-list", "online-mode", "function-permission-level", "op-permission-level", "hide-online-players", "prevent-proxy-connections"],
  "Avanzado / Red": ["server-ip", "server-port", "network-compression-threshold", "entity-broadcast-range-percentage", "enable-command-block", "enable-rcon", "enable-query", "rate-limit", "player-idle-timeout", "sync-chunk-writes", "enable-status"],
  "Mundo (Avanzado)": ["level-name", "level-seed", "level-type", "generator-settings"],
  "Paquetes de Recursos": ["require-resource-pack", "resource-pack", "resource-pack-id", "resource-pack-prompt", "resource-pack-sha1", "initial-enabled-packs", "initial-disabled-packs"],
  "Gestión Remota (Management)": ["management-server-enabled", "management-server-host", "management-server-port", "management-server-secret", "management-server-allowed-origins", "management-server-tls-enabled", "management-server-tls-keystore", "management-server-tls-keystore-password"]
};

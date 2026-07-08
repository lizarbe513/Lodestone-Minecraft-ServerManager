# src-tauri/src/sessions.rs

Resumen: creación, persistencia y detección de sesiones de servidor.

## app_config_path
Resuelve `app_config_dir` y devuelve la ruta a `app-state.json`.

## load_app_config / save_app_config
Lectura y escritura de la configuración global de la app.

## session_metadata_path / save_session_metadata / load_session_metadata
Helpers para gestionar `.minecraft-server-gui-session.json` dentro de la carpeta del servidor.

## parse_memory_token
Parses tokens `-Xmx` en `G` o `M` y normaliza a GB.

## infer_session_from_directory
Lee `start.sh` si existe para inferir `java_path`, memoria y `jar` usado; si no, busca `.jar` en el directorio.

## load_or_infer_session
Carga metadata si existe, si no infiere.

## validate_server_name / validate_memory_gb
Validaciones de inputs.

## create_server_session
Valida inputs, crea carpeta del servidor, copia `.jar`, crea `ServerSession` con `managed_by_app: true`, escribe `start.sh` y guarda metadata.

## validate_existing_session
Valida existencia de carpeta y `.jar`, normaliza `java_path` y `memory_gb`, y (re)genera `start.sh` si aplica.

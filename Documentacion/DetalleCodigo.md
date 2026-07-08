# Documentación detallada del código

Este documento explica, archivo por archivo, cada función y los bloques de código relevantes del backend (Rust) y del frontend (JavaScript/HTML/CSS). No se modifica el código fuente; esto es documentación separada para facilitar aprendizaje y mantenimiento.

**Formato:**
- Para cada archivo se listan importaciones, constantes y luego funciones. Para cada función se indica el propósito y una explicación por bloques de líneas (no literal línea a línea, pero sí por fragmentos relevantes) para mantener la documentación legible.

---

## Backend (Rust)

### `src-tauri/src/constants.rs`
- Contiene constantes globales usadas por el backend y el frontend para sincronizar nombres de eventos y archivos:
  - `SERVER_STATUS_EVENT`: nombre del evento emitido con el estado del servidor.
  - `SERVER_LOG_EVENT`: nombre del evento emitido con líneas de log.
  - `APP_CONFIG_FILE_NAME`: nombre del archivo de configuración guardado en `app_config_dir`.
  - `SESSION_METADATA_FILE_NAME`: nombre del fichero de metadata de sesión guardado en la carpeta del servidor.
  - `START_SCRIPT_NAME`: nombre del script de arranque (`start.sh`).
  - `EULA_FILE_NAME`: nombre del `eula.txt` que el servidor crea.
  - `DEFAULT_MEMORY_GB`: valor por defecto de memoria (4 GB).

### `src-tauri/src/models.rs`
- Tipos serializables con `serde` que cruzan la frontera entre Rust y JS.
- `ServerStatus` (enum): estados posibles del servidor: `Offline`, `Starting`, `Running`, `WaitingEula`.
- `LogKind` (enum): tipos de log: `Stdout`, `Stderr`, `System`.
- `AppConfig`: estructura con `active_session` para persistir la última sesión.
- `ServerSession`: representación de una sesión de servidor (nombre, carpeta, jar, ruta java, memoria, si es gestionado por la app).
- `NewServerRequest`: payload esperado desde JS para crear un servidor.
- `JavaOption`: opción de Java presentada al frontend.
- `AppSnapshot`: resumen enviado al frontend con estado, sesión activa, versiones de java y flag de eula.
- `ServerStatusPayload` y `ServerLogPayload`: payloads para eventos emitidos.

### `src-tauri/src/events.rs`
- `emit_status(app_handle, status)`: emite el evento `server-status` con `ServerStatusPayload`.
- `emit_log(app_handle, kind, message)`: emite el evento `server-log` con `ServerLogPayload`.
- Ambas funciones encapsulan `tauri::AppHandle::emit` y transforman errores en `String` legibles.

### `src-tauri/src/java.rs`
- `default_java_path() -> String`:
  - Busca `/usr/bin/java`; si existe la retorna.
  - Si no, intenta buscar dentro de `/usr/lib/jvm/*/bin/java` y retorna la primera encontrada.
  - Si no encuentra nada, retorna `/usr/bin/java` como fallback.
- `validate_java_path(java_path: &str) -> Result<String, String>`:
  - Verifica que `java_path` no esté vacío y que el archivo exista.
  - Retorna un `Err` con mensaje legible si la ruta no es válida.
- `collect_java_versions(active_session: Option<&ServerSession>) -> Vec<JavaOption>`:
  - Recolecta opciones de `/usr/lib/jvm` y `"java del sistema"` si existe `/usr/bin/java`.
  - Si la sesión activa tiene una ruta Java no listada, añade una entrada "Guardado (ruta)" para preservarla.
  - Ordena por label y deduplica por path.

### `src-tauri/src/server_files.rs`
- `quote_for_shell(value: &str) -> String`:
  - Escapa de forma segura una cadena para incluirla entre comillas simples en un script shell. Reemplaza `'` por `'"'"'` para mantener integridad.
- `write_start_script(session: &ServerSession) -> Result<PathBuf, String>`:
  - Construye el contenido del `start.sh` con shebang `#!/usr/bin/env sh` y la línea para ejecutar Java con `-Xmx`, `-Xms`, `-jar` y `nogui`.
  - Usa `quote_for_shell` para `java_path` y `jar_file_name`.
  - Escribe el archivo y en sistemas Unix aplica modo `0o755` (ejecutable).
  - Retorna `PathBuf` del script o error legible.
- `ensure_eula_accepted(server_dir: &Path) -> Result<(), String>`:
  - Lee `eula.txt` si existe; si contiene `eula=false` lo reemplaza por `eula=true`; si no existe lo crea con `eula=true`.
  - Es tolerante a formatos previos y preserva contenido adicional si existiera.
- `eula_needs_acceptance(server_dir: &Path) -> bool`:
  - Devuelve `true` si `eula.txt` existe y contiene `eula=false`.

### `src-tauri/src/sessions.rs`
- Funciones de alto nivel para crear, guardar, cargar e inferir sesiones.
- `app_config_path(app_handle) -> Result<PathBuf, String>`:
  - Obtiene `app_config_dir` desde `tauri::AppHandle` y crea el directorio si hace falta; retorna la ruta completa a `app-state.json`.
- `load_app_config(app_handle) -> Result<AppConfig, String>`:
  - Lee `app-state.json` y retorna `AppConfig::default()` si no existe o si no puede parsearse.
- `save_app_config(app_handle, config) -> Result<(), String>`: serializa y escribe `app-state.json`.
- `session_metadata_path(server_dir) -> PathBuf`: helper que concatena `SESSION_METADATA_FILE_NAME`.
- `save_session_metadata(session) -> Result<(), String>`: escribe `.minecraft-server-gui-session.json` en la carpeta del servidor con la serialización de `ServerSession`.
- `load_session_metadata(server_dir) -> Result<ServerSession, String>`: lee y deserializa la metadata; falla si no existe o el JSON no es válido.
- `parse_memory_token(token: &str) -> Option<u32>`:
  - Interpreta tokens tipo `-Xmx2G`, `-Xmx2048M` y devuelve la memoria en GB (≥1).
  - Normaliza comillas simples/dobles y suprime prefijo `-Xmx`.
- `infer_session_from_directory(server_dir: &Path) -> Result<ServerSession, String>`:
  - Intenta inferir `ServerSession` leyendo `start.sh` (si existe) y extrayendo la ruta Java, memoria y nombre del `.jar` usado.
  - Si `start.sh` no existe o no contiene `.jar`, busca el primer `.jar` en el directorio.
  - Si no encuentra `.jar` falla con mensaje legible.
  - Retorna una `ServerSession` con `managed_by_app: false`.
- `load_or_infer_session(server_dir)`:
  - Si existe metadata, la carga; si no, infiere.
- `validate_server_name`, `validate_memory_gb`:
  - Validaciones simples para nombre y memoria.
- `create_server_session(request: NewServerRequest) -> Result<ServerSession, String>`:
  - Valida nombre, ruta Java y memoria.
  - Verifica que el `.jar` exista y que la extensión sea `.jar`.
  - Crea la carpeta `parent_dir/server_name`, copia el `.jar` dentro, construye `ServerSession` con `managed_by_app: true`, escribe `start.sh` y guarda metadata.
- `validate_existing_session(session)`:
  - Verifica que la carpeta exista y que el `.jar` esté presente.
  - Normaliza `java_path` y `memory_gb` usando validadores o valores por defecto.
  - Regenera `start.sh` si la sesión es `managed_by_app` o si `start.sh` no existe.

### `src-tauri/src/runtime.rs`
- `AppState` y `ServerRuntime` mantienen el estado en memoria del runtime del servidor.
- `build_snapshot(runtime)` produce un `AppSnapshot` para enviar al frontend.
- `update_active_session(app_handle, runtime, session)`:
  - Persiste `app-state.json` y metadata de sesión, actualiza el runtime en memoria y reinicia flags (por ejemplo `eula_pending=false`).
- `sync_runtime_from_saved_config(app_handle, runtime)`:
  - Carga `app-state.json` y, si no hay proceso hijo activo, sincroniza `active_session` y setea `Offline`.
- `ensure_server_is_idle(runtime)`:
  - Valida que no haya proceso hijo ni estado distinto de `Offline`; usado antes de cambiar de sesión.
- `current_session(runtime)` y `pending_eula_session(runtime)`:
  - Accesores que retornan `ServerSession` o errores si no existe o no hay eula pendiente.
- `send_command_to_server(process, command)`:
  - Envía un comando (string) al `stdin` del `CommandChild` con salto de línea. Valida que el comando no esté vacío.
- `send_console_command(runtime, command)` y `stop_server(runtime)`:
  - Envuelven el envío al proceso y validan que el servidor esté en estado `Running` o en ejecución respectivamente.
- `output_indicates_server_ready(output)`:
  - Heurística que busca líneas que contengan `done (` y `for help` (frases comunes en salida del servidor Minecraft cuando está listo).
- `mark_server_as_running_if_ready(app_handle, runtime, output)`:
  - Si la heurística detecta que el servidor está listo y el runtime está en `Starting`, actualiza a `Running`, emite `server-status` y un `system log`.
- `spawn_server_process(app_handle, runtime, session)`:
  - Valida la sesión, prepara el comando `bash start.sh` en el directorio del servidor usando `tauri-plugin-shell`.
  - Actualiza estado a `Starting` y emite logs y eventos.
  - Lanza el proceso y registra el `CommandChild` en `runtime.child`.
  - Crea una tarea asíncrona que escucha eventos del proceso (`Stdout`, `Stderr`, `Terminated`):
    - En `Stdout`/`Stderr`: convierte bytes a texto, llama a `mark_server_as_running_if_ready` y emite logs.
    - En `Terminated`: si `eula_needs_acceptance` es `true`, establece estado `WaitingEula` y emite un mensaje indicando que hay que aceptar EULA; si no, setea `Offline` e informa el código de salida.
  - Maneja errores de spawn devolviendo `Err` y reseteando el runtime a `Offline`.

---

## Frontend (JavaScript / HTML / CSS)

### `src/index.html`
- Estructura de la UI por páginas: `page-home`, `page-create`, `page-control`.
- Elementos clave con `id` que conecta `src/main.js`:
  - `server-status`, `app-feedback`, `page-home`, `page-create`, `page-control`.
  - Botones: `btn-home-create`, `btn-home-open-existing`, `btn-home-open-last`, `btn-select-server-jar`, `btn-select-server-parent-dir`, `btn-create-server`, `btn-create-accept-eula`, `btn-control-start`, `btn-control-stop`, `btn-control-accept-eula`, `btn-send-command`.
  - Inputs y selects: `server-jar-path`, `server-parent-dir`, `server-name`, `java-version`, `memory-gb`, `input-command`.
  - Log output: `log-output`.
- La UI sigue un patrón sencillo: varias secciones ocultas usando `hidden` y navegación que alterna `hidden`.

### `src/main.js` (resumen y explicación por secciones)
- Imports iniciales: obtiene `invoke`, `listen`, `open` desde la API global Tauri (`window.__TAURI__`).
- `statusLabels`: mapeo de estados internos a etiquetas en español.
- `appState`: objeto global que mantiene estado de la UI (status, sesión activa, versiones java, flags, página actual).
- Variables DOM: declaradas al tope y asignadas en `DOMContentLoaded`.

- Utilidades:
  - `showFeedback(message, type)`: actualiza `#app-feedback` con mensaje y tipo.
  - `normalizeError` y `normalizeMessage`: normalizan errores y mensajes para mostrarlos.
  - `appendLog(kind, message)` y `clearLogs()`: gestionan `#log-output` añadiendo líneas con clases `log-stdout|stderr|system`.
  - `fileNameFromPath` y `suggestedServerName`: utilidades para inferir nombre de servidor.

- Render / navegación:
  - `navigateTo(page)`: cambia `appState.currentPage` y alterna `hidden` en secciones.
  - `renderHomeHint()`, `renderJavaOptions(selectedPath)`, `renderActiveSession()`, `setStatus(status)` — funciones que actualizan la UI a partir del `appState`.

- Validaciones y formularios:
  - `formIsValid()`: valida que campos de creación no estén vacíos.
  - `collectNewServerPayload()`: crea el objeto `NewServerRequest` que envía al backend.
  - `resetNewServerForm()`.

- Interacciones de usuario que llaman al backend (invokes):
  - `browseServerJar()` y `browseServerParentDir()` usan `open()` de Tauri para seleccionar archivos/carpetas.
  - `openExistingServer()` → `invoke('abrir_servidor_existente', { serverDir })` y aplica `applySnapshot(snapshot)`.
  - `createServer()` → `invoke('crear_e_iniciar_servidor', { request })`.
  - `startCurrentServer()` → `invoke('iniciar_servidor_actual')`.
  - `stopServer()` → `invoke('detener_servidor')`.
  - `sendCommand()` → `invoke('enviar_comando', { comando })`.
  - `continueAfterEulaAcceptance()` y `acceptEulaAndRestart()` → `invoke('aceptar_eula_y_reiniciar')`.

- Inicialización y eventos:
  - `loadInitialState()` invoca `obtener_estado_aplicacion` y navega según si hay `activeSession`.
  - `registerEvents()` se subscribe a `server-status` y `server-log` y actualiza UI en consecuencia.
  - `DOMContentLoaded` registra manejadores de eventos en botones/inputs y llama a `registerEvents()` y `loadInitialState()`.

- Notas sobre comportamiento y validaciones en el frontend:
  - El frontend asume que el backend retorna `AppSnapshot` con `java_versions` y `active_session`.
  - Se controla `pendingCreateFlow` para distinguir cuando se está en el flujo de crear+iniciar del servidor frente a control normal.
  - Los errores devueltos por invoke se muestran con `showFeedback` y se agregan al log con `appendLog('stderr', message)`.

### `src/styles.css`
- Contiene estilos modernos y responsivos para la UI. Reglas principales:
  - Variables globales de tipografía y paleta.
  - Botones, inputs y select con estilos coherentes.
  - Clases para estados `status-badge[data-status=...]` que colorean la etiqueta de estado.
  - `.log-output` configurada con monospace y `pre-wrap` para mostrar la salida del servidor correctamente.

---

## Notas finales y recomendaciones dentro de la documentación detallada
- Si quieres que la documentación sea literalmente "por línea" (comentando cada línea numerada), puedo generar una versión alternativa que inserte líneas numeradas y comentarios junto a cada una — ten en cuenta que será muy largo y menos práctico para lectura; recomiendo mantener el esquema por función y por bloque.
- Puedo también generar archivos `*.md` por cada archivo fuente con la documentación correspondiente y enlaces desde este `DetalleCodigo.md`.

---

Archivo generado automáticamente. ¿Deseas que:
- Genere una versión línea-por-línea (más verbosa), o
- Cree un `docs/` con un `.md` por archivo fuente enlazado desde aquí?

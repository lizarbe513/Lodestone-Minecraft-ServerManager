# src-tauri/src/runtime.rs

Resumen: gestión del estado en memoria del runtime del servidor y ciclo de vida del proceso externo.

## ServerRuntime
Estructura que contiene `child: Option<CommandChild>`, `status: ServerStatus`, `active_session: Option<ServerSession>`, `eula_pending: bool`.

## build_snapshot
Crea `AppSnapshot` con el estado actual y versiones de Java recolectadas.

## update_active_session
Guarda `app-state.json`, guarda metadata de sesión y actualiza el runtime en memoria.

## sync_runtime_from_saved_config
Carga `app-state.json` y sincroniza `active_session` si no hay proceso activo.

## ensure_server_is_idle
Lanza error si hay proceso hijo o estado distinto de `Offline`.

## current_session / pending_eula_session
Devolución segura de la sesión activa; `pending_eula_session` valida estado `WaitingEula`.

## send_command_to_server
Trim y valida comando, escribe `command + "\n"` al `CommandChild`.

## send_console_command / stop_server
Wrappers que validan estado y envían comandos.

## output_indicates_server_ready / mark_server_as_running_if_ready
Heurística para detectar cuando Minecraft está listo y actualizar estado a `Running`.

## spawn_server_process
Valida la sesión, construye comando `bash start.sh` en la carpeta del servidor, actualiza estado a `Starting`, ejecuta el proceso con `tauri-plugin-shell`, guarda `child` y lanza una tarea asíncrona que procesa `CommandEvent` (Stdout/Stderr/Terminated), emitiendo eventos y logs apropiados.

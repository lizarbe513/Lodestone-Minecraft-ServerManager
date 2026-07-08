# Documentación del proyecto: Minecraft Server GUI

Breve: aplicación de escritorio construida con Tauri (Rust) y frontend en JavaScript que permite crear, abrir y arrancar servidores de Minecraft locales.

**Índice**
- Propósito
- Requisitos
- Arranque rápido
- Estructura del proyecto
- Backend (Rust) — módulos y flujo
- Frontend (JS) — interacción y UI
- Mensajes y eventos (IPC)
- Flujo principal (crear, abrir, iniciar, aceptar EULA)
- Archivos generados por la app
- Seguridad y consideraciones importantes
- Desarrollo, lint y pruebas
- Sugerencias para extensiones y CI

## Propósito
Proveer una interfaz gráfica para gestionar servidores de Minecraft locales: crear una carpeta de servidor desde un `.jar`, generar `start.sh` con la configuración deseada, arrancar/parar el servidor, mostrar la salida en una terminal integrada y manejar el flujo de aceptación del `eula.txt`.

## Requisitos
- Linux (probado/objetivo)
- `bash` disponible
- Instalación de Java en el sistema (ruta típica: `/usr/bin/java` o dentro de `/usr/lib/jvm`)
- Rust toolchain para desarrollar el backend

## Arranque rápido (desarrollo)
Desde la raíz del repo puedes validar y ejecutar el backend:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo run --manifest-path src-tauri/Cargo.toml
```

Nota: ejecutar la app con Tauri en modo clásico puede requerir `tauri-cli` o la integración con un `package.json`/NPM si se desea usar comandos `tauri dev`. El proyecto está configurado para usar `../src` como `frontendDist` y los archivos estáticos ya están en `src/`.

## Estructura del proyecto
- [src-tauri/Cargo.toml](src-tauri/Cargo.toml) — manifiesto Rust.
- [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) — configuración de Tauri.
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs) — puntos de invocación (comandos expuestos al frontend) y `run()`.
- [src-tauri/src/main.rs](src-tauri/src/main.rs) — entry para el bin que llama a la librería.
- [src-tauri/src/runtime.rs](src-tauri/src/runtime.rs) — estado en memoria del runtime, spawn y gestión del proceso del servidor.
- [src-tauri/src/sessions.rs](src-tauri/src/sessions.rs) — validación, creación y persistencia de sesiones.
- [src-tauri/src/server_files.rs](src-tauri/src/server_files.rs) — escritura de `start.sh`, manejo de `eula.txt`.
- [src-tauri/src/java.rs](src-tauri/src/java.rs) — detección y validación de rutas de Java.
- [src-tauri/src/models.rs](src-tauri/src/models.rs) — tipos serializables (ServerSession, AppSnapshot, enums).
- [src-tauri/src/events.rs](src-tauri/src/events.rs) — emite eventos al frontend (`server-status`, `server-log`).
- [src/main.js](src/main.js) — lógica del frontend, invocaciones a comandos Rust y escucha de eventos.
- [src/index.html](src/index.html) — UI estática y elementos referenciados por `src/main.js`.
- [README.md](README.md) — resumen del proyecto.

## Backend (Rust) — módulos y responsabilidades
Resumen de los módulos y su rol:

- `lib.rs` ([src-tauri/src/lib.rs](src-tauri/src/lib.rs))
  - Expone comandos Tauri (`#[tauri::command]`) que el frontend invoca: `obtener_estado_aplicacion`, `crear_e_iniciar_servidor`, `abrir_servidor_existente`, `iniciar_servidor_actual`, `aceptar_eula_y_reiniciar`, `enviar_comando`, `detener_servidor`.
  - Administra la instancia de `AppState` compartida con `tauri::State`.

- `runtime.rs` ([src-tauri/src/runtime.rs](src-tauri/src/runtime.rs))
  - Define `ServerRuntime` (estado del proceso hijo, estado del servidor, sesión activa y flag de EULA pendiente).
  - `spawn_server_process`: crea el proceso que ejecuta `bash start.sh` en la carpeta del servidor usando `tauri-plugin-shell` y mantiene un `CommandChild` con un canal de eventos (stdout/stderr/terminated).
  - Maneja la transición de estados: `Starting`, `Running`, `WaitingEula`, `Offline`.
  - Envía eventos al frontend usando `emit_status` y `emit_log` (ver `events.rs`).
  - `send_console_command` escribe comandos al stdin del proceso (ej. `stop`).

- `sessions.rs` ([src-tauri/src/sessions.rs](src-tauri/src/sessions.rs))
  - Crea sesiones desde un `NewServerRequest` (valida nombre, copia `.jar` al directorio, escribe `start.sh`, serializa metadata en `.minecraft-server-gui-session.json`).
  - Puede inferir una sesión leyendo `start.sh` o buscando `.jar` existentes.
  - `validate_existing_session` normaliza rutas (Java, memoria) y garantiza que `start.sh` exista o se regenere si la sesión es `managed_by_app`.

- `server_files.rs` ([src-tauri/src/server_files.rs](src-tauri/src/server_files.rs))
  - `write_start_script` crea `start.sh` con `#!/usr/bin/env sh` y la línea con Java, `-Xmx`, `-Xms`, `-jar` y `nogui`.
  - Se asegura de aplicar permisos ejecutables en sistemas Unix.
  - `ensure_eula_accepted` modifica/crea `eula.txt` con `eula=true`.
  - `eula_needs_acceptance` detecta `eula=false`.

- `java.rs` ([src-tauri/src/java.rs](src-tauri/src/java.rs))
  - Busca versiones de Java en `/usr/lib/jvm` y `/usr/bin/java`.
  - `validate_java_path` asegura que la ruta seleccionada exista.

- `events.rs` y `models.rs`
  - `events.rs` encapsula la emisión de eventos Tauri `server-status` y `server-log`.
  - `models.rs` define `ServerStatus`, `LogKind`, `ServerSession`, `NewServerRequest`, `AppSnapshot`, etc., todos serializables con serde.

## Frontend (JS) — interacción y UI
- Archivo principal: [src/main.js](src/main.js)
  - Usa `invoke` para llamar a comandos expuestos por Rust.
  - Se suscribe a eventos con `listen('server-status', ...)` y `listen('server-log', ...)`.
  - Mantiene un estado en `appState` con `status`, `activeSession`, `javaVersions`, `eulaPending`, `currentPage`.
  - Funcionalidades principales:
    - `loadInitialState()` invoca `obtener_estado_aplicacion` para obtener snapshot inicial.
    - `createServer()` invoca `crear_e_iniciar_servidor` y muestra logs.
    - `openExistingServer()` invoca `abrir_servidor_existente`.
    - `startCurrentServer()` invoca `iniciar_servidor_actual`.
    - `sendCommand()` invoca `enviar_comando`.
    - `acceptEulaAndRestart()` invoca `aceptar_eula_y_reiniciar`.
  - Renderiza opciones de Java, estado del servidor y logs en la UI.

## Mensajes y eventos (IPC)
- Comandos invocados desde JS (desde `lib.rs`):
  - `obtener_estado_aplicacion` → devuelve `AppSnapshot`.
  - `crear_e_iniciar_servidor(request: NewServerRequest)` → crea la sesión, guarda, arranca.
  - `abrir_servidor_existente(serverDir: String)` → carga o infiere sesión.
  - `iniciar_servidor_actual()` → lanza `start.sh` para la sesión activa.
  - `aceptar_eula_y_reiniciar()` → marca `eula=true` y reinicia el servidor.
  - `enviar_comando(comando: String)` → escribe al stdin del proceso.
  - `detener_servidor()` → envía `stop` al servidor.

- Eventos emitidos por el backend (escuchados por el frontend):
  - `server-status` — payload `ServerStatusPayload { status }`.
  - `server-log` — payload `ServerLogPayload { kind, message }`.

## Flujo principal (resumido)
1. Crear servidor
   - Frontend recopila `server_jar`, `parent_dir`, `server_name`, `java_path`, `memory_gb`.
   - Invoca `crear_e_iniciar_servidor` → `sessions::create_server_session` valida y copia `.jar`, escribe `start.sh` (`server_files::write_start_script`) y guarda metadata.
   - Backend llama `spawn_server_process` que ejecuta `bash start.sh` en la carpeta del servidor y comienza a escuchar stdout/stderr.
   - Si el proceso termina y `eula.txt` contiene `eula=false`, el runtime pone `WaitingEula` y emite evento para mostrar botón de aceptar EULA.

2. Abrir servidor existente
   - Invoca `abrir_servidor_existente` → `load_or_infer_session` intenta cargar metadata o inferir desde `start.sh`/`.jar`.
   - Valida la sesión y actualiza `AppState`.

3. Aceptar EULA
   - Frontend invoca `aceptar_eula_y_reiniciar` → `server_files::ensure_eula_accepted` escribe `eula=true` y backend reinicia el proceso.

4. Envío de comandos al servidor
   - `enviar_comando` escribe líneas a stdin del proceso gestionado por `tauri-plugin-shell`.

## Archivos generados por la aplicación
- `start.sh` — script de arranque generado por la app.
- `eula.txt` — generado por el servidor; la app puede modificarlo para aceptar el EULA.
- `.minecraft-server-gui-session.json` — metadata de la sesión almacenada en la carpeta del servidor.
- `app-state.json` — configuración de la app con la `active_session` en el `app_config_dir` del sistema (vía Tauri `AppHandle::path().app_config_dir`).

## Seguridad y consideraciones importantes
- Ejecutar un `start.sh` en una carpeta de usuario ejecuta código arbitrario (líneas shell). Si el usuario abre una carpeta de servidor externa, esa `start.sh` podría contener comandos maliciosos.
  - Recomendación: mostrar una advertencia antes de ejecutar `start.sh` de carpetas no gestionadas por la aplicación (`managed_by_app == false`).
  - Alternativa: validar el contenido de `start.sh` (por ejemplo: solo permitir la invocación de la ruta Java y parámetros `-Xmx -Xms -jar nogui`) o forzar regeneración del script y pedir confirmación al usuario.
- La escritura de `eula.txt` se hace automáticamente cuando el flujo lo requiere; informar claramente al usuario.

## Desarrollo, lint y pruebas
- Validar build del backend:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml --release
```

- Ejecutar linters:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

- Sugerencia CI (GitHub Actions): ejecutar `cargo check`, `cargo clippy`, y pruebas si se agregan.

## Sugerencias para mejoras y extensión
- Añadir validación estricta del contenido de `start.sh` para carpetas externas.
- Añadir tests unitarios para parsing de `start.sh` en `sessions::parse_memory_token`.
- Añadir soporte multiplataforma: en Windows el script sería distinto (PS1/Batch) y `bash` puede no existir.
- Añadir integración con empaquetado (`tauri.conf.json -> bundle.active: true`) y pipeline de releases.

---

Archivo creado automáticamente por revisión. Si quieres, puedo:
- Ejecutar `cargo clippy` y mostrar resultados.
- Revisar y documentar `src/index.html` y `src/styles.css` sección por sección.
- Añadir ejemplos de contenido permitido para `start.sh` y pruebas unitarias para `sessions.rs`.

Dime qué quieres que haga ahora.
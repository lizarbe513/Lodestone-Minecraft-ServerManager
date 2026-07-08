# src-tauri/src/lib.rs

Resumen: define los comandos Tauri disponibles que el frontend invoca. Administra la `AppState` compartida.

## obtener_estado_aplicacion
Sincroniza runtime desde configuración guardada y devuelve un `AppSnapshot`.

## crear_e_iniciar_servidor
Valida que el servidor esté inactivo, crea la sesión (`create_server_session`), actualiza la sesión activa, emite un log y llama a `spawn_server_process`.

## abrir_servidor_existente
Valida carpeta, carga o infiere la sesión, valida la sesión, actualiza la sesión activa y emite un log.

## iniciar_servidor_actual
Sincroniza config, obtiene la sesión actual y llama a `spawn_server_process`.

## aceptar_eula_y_reiniciar
Recupera la sesión pendiente por EULA, escribe `eula=true`, emite log y reinicia el proceso.

## enviar_comando
Pasa el comando a `send_console_command`.

## detener_servidor
Llama a `stop_server`.

## run
Constructor de la aplicación Tauri: registra plugins, `AppState` y la lista de comandos expuestos.

# src/main.js

Resumen: lógica del frontend. Exporta handlers y funciones usadas por la UI. Cada sección contiene un encabezado que explica la función para poder enlazar desde Obsidian.

## resetNewServerForm
Restaura los inputs del formulario de creación de servidor a valores por defecto y actualiza las opciones de Java.

## navigateTo
Cambia la vista activa entre `home`, `create` y `control` (muestra/oculta secciones DOM y actualiza controles).

## collectNewServerPayload
Valida y arma el payload `NewServerRequest` que se envía al backend (contiene `server_name`, `server_jar_path`, `parent_dir`, `java_path`, `memory_gb`).

## createServer
Función `async` que invoca `crear_e_iniciar_servidor` en el backend con el payload; marca `pendingCreateFlow` y limpia logs.

## startCurrentServer
Invoca `iniciar_servidor_actual` en el backend para arrancar la sesión activa.

## stopServer
Invoca `detener_servidor` en el backend para enviar `stop` al proceso del servidor.

## sendCommand
Envía un comando de consola al backend (`enviar_comando`) y añade la entrada al log local.

## acceptEulaAndRestart / continueAfterEulaAcceptance
Flujo que acepta EULA desde la UI; invoca `aceptar_eula_y_reiniciar` en el backend y aplica el snapshot resultante.

## applySnapshot
Aplica `AppSnapshot` recibido del backend al `appState`, renderiza opciones de Java, sesión activa y estado.

## loadInitialState
Pide el estado inicial al backend (`obtener_estado_aplicacion`) y navega a la pantalla correspondiente.

## registerEvents
Se suscribe a los eventos `server-status` y `server-log` emitidos por el backend y actualiza UI en tiempo real.

## Manejadores DOM (DOMContentLoaded)
Asignación de elementos DOM, registro de listeners en botones e inicialización (`registerEvents` y `loadInitialState`).

# Documentación del proyecto

Este repositorio usa una estructura de documentación dividida en dos secciones principales:

1. `Documentacion`
   - Documentación general del proyecto y flujos de uso.
   - Contiene los documentos de visión general, arquitectura y descripción de historias de uso.
   - El subdirectorio `Documentacion/Flujos` contiene diagramas lineales de control de flujo en formato "inicio -> funcion[...] -> fin".
   - El subdirectorio `Documentacion/Flujos/with_lines` contiene las mismas rutas con referencias de líneas de código.

2. `Documentacion de funciones`
   - Documentación técnica estructurada por archivo y función.
   - Cada archivo describe los comandos y bloques del backend o frontend en detalle.
   - Los enlaces desde los flujos apuntan aquí con referencias estilo Obsidian.

## Estructura

- `Documentacion/Proyecto.md`
- `Documentacion/DetalleCodigo.md`
- `Documentacion/Conexion Rust y el Frontend.md`
- `Documentacion/Flujos/`
  - `crear_nuevo_servidor.md`
  - `abrir_servidor_existente.md`
  - `iniciar_servidor_actual.md`
  - `aceptar_eula.md`
  - `detener_servidor.md`
  - `enviar_comando.md`
  - `carga_inicial.md`
  - `with_lines/` (rutas conservadas con referencias a líneas de código)
- `Documentacion/Documentacion de funciones/`
  - `src_main.js.md`
  - `src-tauri_lib.rs.md`
  - `src-tauri_runtime.rs.md`
  - `src-tauri_sessions.rs.md`
  - `src-tauri_server_files.rs.md`
  - `src-tauri_events.rs.md`

## Notas importantes

- Los flujos de `Documentacion/Flujos` ahora se enfocan en casos de uso concretos y enlazan a las secciones de funciones.
- Los documentos de función en `Documentacion de funciones` explican el propósito de comandos, procesos y eventos.
- La carpeta `Documentacion/Flujos/with_lines` conserva los archivos con referencias de líneas existentes.

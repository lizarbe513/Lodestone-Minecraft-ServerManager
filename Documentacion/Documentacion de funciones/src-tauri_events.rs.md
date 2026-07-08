# src-tauri/src/events.rs

Resumen: pequeñas utilidades que envuelven `tauri::AppHandle::emit` para enviar eventos al frontend.

## emit_status
Emite `server-status` con `ServerStatusPayload`.

## emit_log
Emite `server-log` con `ServerLogPayload`.

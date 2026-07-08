use crate::{
    constants::{SERVER_LOG_EVENT, SERVER_STATUS_EVENT},
    models::{LogKind, ServerLogPayload, ServerStatus, ServerStatusPayload},
};
use tauri::Emitter;

pub fn emit_status(app_handle: &tauri::AppHandle, status: ServerStatus) -> Result<(), String> {
    app_handle
        .emit(SERVER_STATUS_EVENT, ServerStatusPayload { status })
        .map_err(|e| format!("No se pudo emitir el estado del servidor: {e}"))
}

pub fn emit_log(
    app_handle: &tauri::AppHandle,
    kind: LogKind,
    message: impl Into<String>,
) -> Result<(), String> {
    app_handle
        .emit(
            SERVER_LOG_EVENT,
            ServerLogPayload {
                kind,
                message: message.into(),
            },
        )
        .map_err(|e| format!("No se pudo emitir un log del servidor: {e}"))
}

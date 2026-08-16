use crate::{
    core::constants::{SERVER_LOG_EVENT, SERVER_STATUS_EVENT},
    core::models::{LogKind, ServerLogPayload, ServerStatus, ServerStatusPayload},
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
                i18n_key: None,
                i18n_params: None,
            },
        )
        .map_err(|e| format!("No se pudo emitir un log del servidor: {e}"))
}

pub fn emit_log_i18n(
    app_handle: &tauri::AppHandle,
    kind: LogKind,
    fallback_message: impl Into<String>,
    i18n_key: impl Into<String>,
    i18n_params: Option<serde_json::Value>,
) -> Result<(), String> {
    app_handle
        .emit(
            SERVER_LOG_EVENT,
            ServerLogPayload {
                kind,
                message: fallback_message.into(),
                i18n_key: Some(i18n_key.into()),
                i18n_params,
            },
        )
        .map_err(|e| format!("No se pudo emitir un log del servidor: {e}"))
}

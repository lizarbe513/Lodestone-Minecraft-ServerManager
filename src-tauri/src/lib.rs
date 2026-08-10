pub mod commands;
pub mod core;

use std::sync::{Arc, Mutex};
use crate::core::runtime::{AppState, ServerRuntime};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            runtime: Arc::new(Mutex::new(ServerRuntime::default())),
        })
        .invoke_handler(tauri::generate_handler![
            // Sessions
            commands::sessions::obtener_estado_aplicacion,
            commands::sessions::crear_e_iniciar_servidor,
            commands::sessions::abrir_servidor_existente,
            commands::sessions::iniciar_servidor_actual,
            commands::sessions::remover_servidor_guardado,
            commands::sessions::actualizar_configuracion_servidor,
            // Server Files & EULA
            commands::server_files::aceptar_eula_y_reiniciar,
            commands::server_files::obtener_eula_texto,
            commands::server_files::leer_server_properties,
            commands::server_files::guardar_server_properties,
            commands::server_files::leer_archivo_servidor,
            commands::server_files::guardar_archivo_servidor,
            // System & Process Control
            commands::system::enviar_comando,
            commands::system::detener_servidor,
            commands::system::obtener_estadisticas_servidor,
            commands::system::abrir_carpeta_servidor,
            commands::system::abrir_carpeta_por_ruta,
            commands::system::salir_aplicacion,
            commands::system::descargar_servidor_jar,
            // Worlds
            commands::worlds::listar_mundos,
            commands::worlds::obtener_mundo_activo,
            commands::worlds::cambiar_mundo_activo,
            commands::worlds::respaldar_mundo,
            commands::worlds::borrar_mundo,
            commands::worlds::renombrar_mundo,
            commands::worlds::crear_mundo_nuevo,
            commands::worlds::importar_mundo_zip,
            // Extensions
            commands::extensions::listar_extensiones,
            commands::extensions::alternar_extension,
            commands::extensions::eliminar_extension,
            commands::extensions::instalar_extension,
            commands::extensions::detectar_motor_servidor,
            commands::extensions::detectar_version_minecraft,
            // Backups
            commands::backups::crear_backup_completo,
            commands::backups::listar_backups,
            commands::backups::restaurar_backup,
            commands::backups::eliminar_backup,
            // Modpacks & Zip
            commands::mrpack::parse_mrpack,
            commands::mrpack::extract_mrpack_overrides,
            commands::mrpack::extraer_zip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

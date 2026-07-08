# src-tauri/src/server_files.rs

Resumen: helpers para escribir `start.sh` y manejar `eula.txt`.

## quote_for_shell
Escapa una cadena para incluir entre comillas simples en un script shell.

## write_start_script
Construye el `start.sh` con shebang y la línea de ejecución: `'<java_path>' -Xmx{G}G -Xms{G}G -jar '<jar>' nogui` y aplica permisos `0o755` en Unix.

## ensure_eula_accepted
Lee/modifica/crea `eula.txt` para establecer `eula=true`, preservando contenido extra si existe.

## eula_needs_acceptance
Devuelve `true` si `eula.txt` existe y contiene `eula=false`.

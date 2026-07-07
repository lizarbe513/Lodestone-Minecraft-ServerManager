# Minecraft Server GUI

Aplicación de escritorio hecha con Tauri + JavaScript + Rust para crear, abrir y arrancar servidores de Minecraft locales.

## Qué hace ahora

- Crea una carpeta nueva de servidor a partir de un archivo `.jar`.
- Guarda una sesión persistente del último servidor abierto y permite reabrirlo desde el inicio o volver al panel de control al reabrir la app.
- Permite abrir una carpeta de servidor existente, incluso si no fue creada con la aplicación.
- Genera automáticamente `start.sh` con la versión de Java y la RAM elegidas.
- Intenta arrancar el servidor y, si hace falta, permite aceptar el `EULA` y reiniciarlo.
- Muestra la salida del servidor en una terminal integrada.

## Flujo principal

### Iniciar nuevo servidor

1. Selecciona el archivo `.jar` del software del servidor.
2. Selecciona el directorio donde se creará la carpeta del servidor.
3. Escribe el nombre de la carpeta / servidor.
4. Elige la versión de Java.
5. Ajusta la RAM en GB.
6. Pulsa `Iniciar servidor`.

### Abrir servidor existente

1. Pulsa `Abrir servidor existente`.
2. Selecciona la carpeta del servidor.
3. La app intentará leer su configuración desde `start.sh` o desde un archivo `.jar` dentro de la carpeta.
4. Pulsa `Iniciar servidor`.

## Requisitos actuales

- Linux
- `bash`
- Una instalación de Java disponible en el sistema
- Un archivo `.jar` válido del software del servidor

## Archivos creados por la app

Dentro de la carpeta del servidor se generan o usan estos archivos:

- `start.sh`
- `eula.txt`
- `.minecraft-server-gui-session.json`

Además, la aplicación guarda la última sesión abierta en `app_config_dir`.

## Desarrollo

Para validar el backend:

```sh
cargo check --manifest-path src-tauri/Cargo.toml
```

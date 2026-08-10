# 🚀 Minecraft Server GUI - Beta 1.0.0-beta.1

Aplicación de escritorio construida con **Tauri v2 (Rust)** y **Frontend Web Nátivo (JS/HTML/CSS)** para crear, administrar y ejecutar servidores de Minecraft **Java Edition** de forma limpia y profesional.

---

## 🎯 Alcance de la Versión Beta 1.0

Esta versión Beta se enfoca 100% en la estabilidad, seguridad y gestión completa de **servidores de Minecraft Java Edition**.

### 🛠️ Motores Soportados
- **Vanilla** (Mojang Launcher Meta)
- **PaperMC** (Paper v3 API)
- **Purpur** (PurpurMC API)
- **Fabric** (Fabric Meta API)
- **Forge** (Forge Maven Promotions)
- **NeoForge** (NeoForged Release Maven)

---

## 🏛️ Arquitectura del Sistema (Principios SOLID)

El backend en Rust ha sido completamente estructurado bajo principios SOLID:

1. **Single Responsibility Principle (SRP)**:
   - `lib.rs`: Exclusivamente dedicado a la inicialización de Tauri, plugins y registro de handlers IPC.
   - `commands/sessions.rs`: Gestión del estado de sesiones, persistencia y ciclo de vida.
   - `commands/server_files.rs`: Edición de propiedades, EULA y generación de scripts de arranque.
   - `commands/system.rs`: Control de procesos del sistema (`stop`/`cmd`), métricas sysinfo y apertura de carpetas en SO.
   - `commands/worlds.rs`: Gestión de mundos (cambio activo, respaldos, importación zip).
   - `commands/extensions.rs`: Detección de motor, versión y gestión de plugins/mods/datapacks.
   - `commands/backups.rs`: Sistema de copias de seguridad completas del servidor.
   - `commands/mrpack.rs`: Procesamiento e instalación de modpacks de Modrinth.

2. **Open/Closed Principle (OCP)**:
   - `ScriptGenerator` trait (`WindowsScriptGenerator` y `UnixScriptGenerator`) para generación multiplataforma de scripts de inicio (`start.sh` / `start.bat`).

3. **Diagnóstico Inteligente de Errores JVM**:
   - `core/diagnostics.rs`: Módulo que intercepta en tiempo real logs de `stdout`/`stderr` para diagnosticar incompatibilidades de versión de Java, falta de memoria RAM o conflictos de puerto, emitiendo mensajes de ayuda al usuario en la terminal integrada.

---

## 🛡️ Parches de Seguridad Incluidos

1. **Protección Anti Zip Slip (Path Traversal)**:
   - Implementado en la extracción de `.mrpack`, descompresión de mundos en `.zip` y restauración de respaldos mediante validación estricta con `file.enclosed_name()` y comprobación `outpath.starts_with(dest_path)`.
2. **Sanitización de Rutas de Archivos**:
   - Función `sanitize_server_file_path()` en lectura/escritura de archivos para permitir navegar subdirectorios de configuración de forma segura previniendo escapes `..`.
3. **Validación de Conflicto de Puertos**:
   - Inspección previa de puertos TCP antes del lanzamiento del servidor para evitar colisiones.

---

## 💻 Instrucciones para Probar y Compilar

### Requisitos
- Linux / Windows / macOS
- Rust Toolchain instalado (`cargo`)
- Java 8 / 17 / 21 instalado en el sistema

### Modo Desarrollo
```bash
cargo run --manifest-path src-tauri/Cargo.toml
```

### Ejecutar Pruebas Unitarias
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

### Compilar Paquete de Producción (Release)
```bash
cargo build --manifest-path src-tauri/Cargo.toml --release
```
O usando Tauri CLI:
```bash
npx tauri build
```

---
*Norditeon Minecraft Server GUI - Beta 1.0*

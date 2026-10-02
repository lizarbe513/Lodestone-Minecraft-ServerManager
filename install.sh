#!/usr/bin/env bash
# ==============================================================================
#  Lodestone - Minecraft Server Manager
#  Desktop Application Installer for Linux
# ==============================================================================
set -euo pipefail

APP_NAME="Lodestone"
BIN_NAME="lodestone"
REPO_URL="https://github.com/lizarbe513/Lodestone-Minecraft-ServerManager"

INSTALL_DIR="${HOME}/.local/bin"
APPLICATIONS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
PIXMAPS_DIR="${HOME}/.local/share/pixmaps"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "  _             _           _                 "
echo " | |   ___   __| | ___  ___| |_ ___  _ __   ___ "
echo " | |  / _ \ / _\` |/ _ \/ __| __/ _ \| '_ \ / _ \\"
echo " | | | (_) | (_| |  __/\__ \ || (_) | | | |  __/"
echo " |_|  \___/ \__,_|\___||___/\__\___/|_| |_|\___|"
echo "     Minecraft Server Manager - Desktop Installer"
echo -e "${NC}"

# Handle uninstall flag
if [[ "${1:-}" == "--uninstall" ]]; then
    echo -e "${YELLOW}Desinstalando Lodestone...${NC}"
    rm -f "${INSTALL_DIR}/${BIN_NAME}"
    rm -f "${APPLICATIONS_DIR}/${BIN_NAME}.desktop"
    rm -f "${ICONS_DIR}/${BIN_NAME}.png"
    rm -f "${PIXMAPS_DIR}/${BIN_NAME}.png"
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "${APPLICATIONS_DIR}" >/dev/null 2>&1 || true
    fi
    echo -e "${GREEN}✓ Lodestone ha sido desinstalado correctamente.${NC}"
    exit 0
fi

# 1. Asegurar directorios
mkdir -p "${INSTALL_DIR}"
mkdir -p "${APPLICATIONS_DIR}"
mkdir -p "${ICONS_DIR}"
mkdir -p "${PIXMAPS_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd || pwd)"

# 2. Localizar o compilar el binario
COMPILED_BIN=""
if [[ -f "${SCRIPT_DIR}/src-tauri/target/release/lodestone" ]]; then
    COMPILED_BIN="${SCRIPT_DIR}/src-tauri/target/release/lodestone"
elif [[ -f "${SCRIPT_DIR}/src-tauri/target/release/minecraft-server-gui" ]]; then
    COMPILED_BIN="${SCRIPT_DIR}/src-tauri/target/release/minecraft-server-gui"
elif [[ -f "${SCRIPT_DIR}/src-tauri/target/debug/lodestone" ]]; then
    COMPILED_BIN="${SCRIPT_DIR}/src-tauri/target/debug/lodestone"
elif [[ -f "${SCRIPT_DIR}/src-tauri/target/debug/minecraft-server-gui" ]]; then
    COMPILED_BIN="${SCRIPT_DIR}/src-tauri/target/debug/minecraft-server-gui"
fi

if [[ -n "${COMPILED_BIN}" ]]; then
    echo -e "${BLUE}→ Copiando ejecutable a ${INSTALL_DIR}/${BIN_NAME}...${NC}"
    cp -f "${COMPILED_BIN}" "${INSTALL_DIR}/${BIN_NAME}"
    chmod +x "${INSTALL_DIR}/${BIN_NAME}"
else
    echo -e "${BLUE}→ Compilando Lodestone con Cargo...${NC}"
    if ! command -v cargo >/dev/null 2>&1; then
        if [[ -f "${HOME}/.cargo/env" ]]; then
            # shellcheck source=/dev/null
            source "${HOME}/.cargo/env"
        fi
    fi

    if ! command -v cargo >/dev/null 2>&1; then
        echo -e "${RED}Error: 'cargo' no está instalado o no se encuentra en el PATH.${NC}"
        echo -e "Instala Rust con: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi

    (cd "${SCRIPT_DIR}/src-tauri" && cargo build --release)
    cp -f "${SCRIPT_DIR}/src-tauri/target/release/lodestone" "${INSTALL_DIR}/${BIN_NAME}"
    chmod +x "${INSTALL_DIR}/${BIN_NAME}"
fi

# 3. Instalar icono
ICON_SRC=""
if [[ -f "${SCRIPT_DIR}/src-tauri/icons/icon.png" ]]; then
    ICON_SRC="${SCRIPT_DIR}/src-tauri/icons/icon.png"
elif [[ -f "${SCRIPT_DIR}/docs/assets/icon.png" ]]; then
    ICON_SRC="${SCRIPT_DIR}/docs/assets/icon.png"
fi

if [[ -n "${ICON_SRC}" ]]; then
    echo -e "${BLUE}→ Instalando iconos en el sistema...${NC}"
    cp -f "${ICON_SRC}" "${ICONS_DIR}/${BIN_NAME}.png"
    cp -f "${ICON_SRC}" "${PIXMAPS_DIR}/${BIN_NAME}.png"
fi

# 4. Crear lanzador .desktop
echo -e "${BLUE}→ Creando lanzador de escritorio (${BIN_NAME}.desktop)...${NC}"
cat <<EOF > "${APPLICATIONS_DIR}/${BIN_NAME}.desktop"
[Desktop Entry]
Name=Lodestone
GenericName=Minecraft Server Manager
Comment=The modern Minecraft server manager built with Rust & Tauri
Exec=${INSTALL_DIR}/${BIN_NAME}
Icon=${BIN_NAME}
Terminal=false
Type=Application
Categories=Game;Utility;Network;
StartupNotify=true
StartupWMClass=lodestone
Keywords=minecraft;server;manager;gui;forge;fabric;paper;purpur;neoforge;
EOF

chmod +x "${APPLICATIONS_DIR}/${BIN_NAME}.desktop"

# 5. Actualizar bases de datos de escritorio e iconos
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${APPLICATIONS_DIR}" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}✓ ¡Lodestone se ha instalado exitosamente como aplicación de escritorio!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "• Ejecutable: ${INSTALL_DIR}/${BIN_NAME}"
echo -e "• Lanzador:   ${APPLICATIONS_DIR}/${BIN_NAME}.desktop"
echo ""
echo -e "Ya puedes buscar '${APP_NAME}' en el menú de aplicaciones de tu escritorio."
echo ""

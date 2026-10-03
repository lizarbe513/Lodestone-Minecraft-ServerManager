#!/usr/bin/env bash
# ==============================================================================
#  Lodestone - Minecraft Server Manager
#  Desktop Application Installer for macOS
# ==============================================================================
set -euo pipefail

APP_NAME="Lodestone"
BUNDLE_ID="com.lizarbe513.lodestone"
REPO_URL="https://github.com/lizarbe513/Lodestone-Minecraft-ServerManager"

APPLICATIONS_DIR="/Applications"
USER_APPLICATIONS_DIR="${HOME}/Applications"
BIN_DIR="${HOME}/.local/bin"

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
echo "       Minecraft Server Manager - macOS Installer"
echo -e "${NC}"

# Verify macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo -e "${RED}Error: Este instalador está diseñado exclusivamente para macOS.${NC}"
    echo -e "Para sistemas Linux, utiliza ./install.sh o descarga el paquete .deb/.rpm/.appimage/.pkg.tar.zst."
    exit 1
fi

# Handle uninstall flag
if [[ "${1:-}" == "--uninstall" ]]; then
    echo -e "${YELLOW}Desinstalando Lodestone de macOS...${NC}"
    rm -rf "${APPLICATIONS_DIR}/${APP_NAME}.app"
    rm -rf "${USER_APPLICATIONS_DIR}/${APP_NAME}.app"
    rm -f "${BIN_DIR}/lodestone"
    echo -e "${GREEN}✓ Lodestone ha sido desinstalado correctamente de tu Mac.${NC}"
    exit 0
fi

# Target directory
TARGET_DIR="${APPLICATIONS_DIR}"
if [[ ! -w "${APPLICATIONS_DIR}" ]]; then
    mkdir -p "${USER_APPLICATIONS_DIR}"
    TARGET_DIR="${USER_APPLICATIONS_DIR}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd || pwd)"

# Check if pre-packaged Lodestone.app exists in current folder
SOURCE_APP=""
if [[ -d "${SCRIPT_DIR}/Lodestone.app" ]]; then
    SOURCE_APP="${SCRIPT_DIR}/Lodestone.app"
elif [[ -d "${SCRIPT_DIR}/src-tauri/target/release/bundle/macos/Lodestone.app" ]]; then
    SOURCE_APP="${SCRIPT_DIR}/src-tauri/target/release/bundle/macos/Lodestone.app"
elif [[ -d "${SCRIPT_DIR}/src-tauri/target/release/Lodestone.app" ]]; then
    SOURCE_APP="${SCRIPT_DIR}/src-tauri/target/release/Lodestone.app"
fi

if [[ -n "${SOURCE_APP}" ]]; then
    echo -e "${BLUE}→ Instalando ${APP_NAME}.app en ${TARGET_DIR}...${NC}"
    rm -rf "${TARGET_DIR}/${APP_NAME}.app"
    cp -R "${SOURCE_APP}" "${TARGET_DIR}/"
else
    echo -e "${BLUE}→ Compilando Lodestone nativamente para macOS con Cargo...${NC}"
    if ! command -v cargo >/dev/null 2>&1; then
        if [[ -f "${HOME}/.cargo/env" ]]; then
            # shellcheck source=/dev/null
            source "${HOME}/.cargo/env"
        fi
    fi

    if ! command -v cargo >/dev/null 2>&1; then
        echo -e "${RED}Error: 'cargo' no está instalado en este sistema macOS.${NC}"
        echo -e "Instala Rust con: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        echo -e "O descarga la release precompilada (.dmg) desde: ${REPO_URL}/releases"
        exit 1
    fi

    (cd "${SCRIPT_DIR}/src-tauri" && cargo build --release)
    
    # Check if tauri bundle generated the app, otherwise create minimal .app bundle
    if [[ -d "${SCRIPT_DIR}/src-tauri/target/release/bundle/macos/Lodestone.app" ]]; then
        cp -R "${SCRIPT_DIR}/src-tauri/target/release/bundle/macos/Lodestone.app" "${TARGET_DIR}/"
    else
        APP_PATH="${TARGET_DIR}/${APP_NAME}.app"
        mkdir -p "${APP_PATH}/Contents/MacOS"
        mkdir -p "${APP_PATH}/Contents/Resources"
        cp -f "${SCRIPT_DIR}/src-tauri/target/release/lodestone" "${APP_PATH}/Contents/MacOS/lodestone"
        chmod +x "${APP_PATH}/Contents/MacOS/lodestone"
        
        # Copy icon if available
        if [[ -f "${SCRIPT_DIR}/src-tauri/icons/icon.icns" ]]; then
            cp -f "${SCRIPT_DIR}/src-tauri/icons/icon.icns" "${APP_PATH}/Contents/Resources/icon.icns"
        fi
        
        cat <<EOF > "${APP_PATH}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>lodestone</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0-beta.1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF
    fi
fi

# Remove Gatekeeper quarantine flag for smooth opening
if command -v xattr >/dev/null 2>&1; then
    echo -e "${BLUE}→ Configurando atributos de seguridad (Gatekeeper)...${NC}"
    xattr -cr "${TARGET_DIR}/${APP_NAME}.app" 2>/dev/null || true
fi

# Add CLI launcher shortcut
mkdir -p "${BIN_DIR}"
cat <<EOF > "${BIN_DIR}/lodestone"
#!/usr/bin/env bash
open -a "${TARGET_DIR}/${APP_NAME}.app" "\$@"
EOF
chmod +x "${BIN_DIR}/lodestone"

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}✓ ¡Lodestone se ha instalado exitosamente en macOS!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "• Aplicación: ${TARGET_DIR}/${APP_NAME}.app"
echo -e "• Comando CLI: ${BIN_DIR}/lodestone"
echo ""
echo -e "💡 Ya puedes abrir ${APP_NAME} desde tu Launchpad, Spotlight (Cmd+Espacio) o carpeta Aplicaciones."
echo ""

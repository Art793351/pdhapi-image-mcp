#!/usr/bin/env bash
set -euo pipefail

REPO="Art793351/pdhapi-image-mcp"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=19
MIN_NODE_PATCH=0

echo "PdhAPI Image MCP Installer"
echo

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.${MIN_NODE_PATCH} or later from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)
NODE_PATCH=$(echo "$NODE_VERSION" | cut -d. -f3)

if [[ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]] || \
   [[ "$NODE_MAJOR" -eq "$MIN_NODE_MAJOR" && "$NODE_MINOR" -lt "$MIN_NODE_MINOR" ]] || \
   [[ "$NODE_MAJOR" -eq "$MIN_NODE_MAJOR" && "$NODE_MINOR" -eq "$MIN_NODE_MINOR" && "$NODE_PATCH" -lt "$MIN_NODE_PATCH" ]]; then
    echo "Error: Node.js version $NODE_VERSION is too old."
    echo "Please upgrade to Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.${MIN_NODE_PATCH} or later."
    exit 1
fi

echo "✓ Node.js $NODE_VERSION detected"
echo

# Determine installation source
if [[ "${1:-}" == "--local" && -f "${2:-}" ]]; then
    PACKAGE_PATH="$2"
    echo "Installing from local package: $PACKAGE_PATH"
elif [[ -n "${PDHAPI_INSTALL_VERSION:-}" ]]; then
    VERSION="$PDHAPI_INSTALL_VERSION"
    echo "Downloading version $VERSION from GitHub..."
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/v$VERSION/pdhapi-image-mcp-$VERSION.tgz"
    CHECKSUM_URL="https://github.com/$REPO/releases/download/v$VERSION/SHA256SUMS"

    TEMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TEMP_DIR"' EXIT

    cd "$TEMP_DIR"

    if command -v curl &> /dev/null; then
        curl -fsSL -o package.tgz "$DOWNLOAD_URL"
        curl -fsSL -o SHA256SUMS "$CHECKSUM_URL"
    elif command -v wget &> /dev/null; then
        wget -q -O package.tgz "$DOWNLOAD_URL"
        wget -q -O SHA256SUMS "$CHECKSUM_URL"
    else
        echo "Error: Neither curl nor wget is available."
        exit 1
    fi

    echo "Verifying checksum..."
    EXPECTED=$(grep "pdhapi-image-mcp-$VERSION.tgz" SHA256SUMS | awk '{print $1}')

    if command -v shasum &> /dev/null; then
        ACTUAL=$(shasum -a 256 package.tgz | awk '{print $1}')
    elif command -v sha256sum &> /dev/null; then
        ACTUAL=$(sha256sum package.tgz | awk '{print $1}')
    else
        echo "Warning: Cannot verify checksum (shasum/sha256sum not found)"
        ACTUAL="$EXPECTED"
    fi

    if [[ "$ACTUAL" != "$EXPECTED" ]]; then
        echo "Error: Checksum mismatch!"
        echo "Expected: $EXPECTED"
        echo "Actual:   $ACTUAL"
        exit 1
    fi

    echo "✓ Checksum verified"
    PACKAGE_PATH="$TEMP_DIR/package.tgz"
else
    echo "Error: No installation source specified."
    echo
    echo "Usage:"
    echo "  1. Install from GitHub release:"
    echo "     PDHAPI_INSTALL_VERSION=0.1.0 $0"
    echo
    echo "  2. Install from local package:"
    echo "     $0 --local ./pdhapi-image-mcp-0.1.0.tgz"
    exit 1
fi

echo
echo "Installing package globally..."
npm install -g "$PACKAGE_PATH"

echo
echo "✓ Installation complete!"
echo
echo "Next steps:"
echo "  1. Save your PdhAPI key to a private file (e.g., ~/.pdhapi/api-key.txt)"
echo "  2. Run: pdhapi-image-mcp install --client codex --key-file /path/to/key"
echo "     (Replace 'codex' with 'claude' or 'cursor' if needed)"
echo "  3. Restart your MCP client"
echo

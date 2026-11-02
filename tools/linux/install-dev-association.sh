#!/usr/bin/env bash
# tools/linux/install-dev-association.sh — Đăng ký tạm application/x-studydeck cho *.sdeck trong môi trường phát triển (Linux)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

mkdir -p "$HOME/.local/share/mime/packages"
mkdir -p "$HOME/.local/share/applications"

cp "$DIR/tools/linux/study-deck-mimetype.xml" "$HOME/.local/share/mime/packages/"
update-mime-database "$HOME/.local/share/mime"

sed "s|<DIR>|$DIR|g" "$DIR/tools/linux/study-deck-dev.desktop" > "$HOME/.local/share/applications/study-deck-dev.desktop"
chmod +x "$HOME/.local/share/applications/study-deck-dev.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" || true
fi

if command -v xdg-mime >/dev/null 2>&1; then
  xdg-mime default study-deck-dev.desktop application/x-studydeck || true
fi

echo "Đã đăng ký tạm liên kết file *.sdeck với Study App (Dev) thành công!"


#!/bin/sh
set -e

# Create compatibility symlink for users upgrading from the Electron version
mkdir -p "/opt/Turtle Deck"
ln -sf "/usr/bin/turtle-deck" "/opt/Turtle Deck/turtle-deck"

# Update desktop and icon databases if available
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

exit 0


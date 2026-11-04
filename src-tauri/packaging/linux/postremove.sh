#!/bin/sh
set -e

# Remove compatibility symlink if it points to turtle-deck
if [ -L "/opt/Turtle Deck/turtle-deck" ]; then
    rm -f "/opt/Turtle Deck/turtle-deck"
fi

if [ -d "/opt/Turtle Deck" ] && [ -z "$(ls -A '/opt/Turtle Deck' 2>/dev/null)" ]; then
    rmdir "/opt/Turtle Deck" 2>/dev/null || true
fi

# Update desktop and icon databases if available
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

exit 0


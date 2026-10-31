#!/usr/bin/env bash
# Thêm "Võ Lâm Manager" vào menu ứng dụng của Linux (file ~/.local/share/applications/vo-lam-manager.desktop).
# Gỡ: xóa file đó. Dùng:  ./cai-ung-dung.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPS"
cat > "$APPS/vo-lam-manager.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Võ Lâm Manager
Comment=Quản lý nhiều tài khoản Võ Lâm Idle, mỗi khung một phiên riêng
Exec=$DIR/chay-ung-dung.sh
Icon=$DIR/desktop/icon.png
Terminal=false
Categories=Game;
StartupWMClass=Vo Lam Manager
DESK
chmod +x "$DIR/chay-ung-dung.sh"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "Đã thêm vào menu ứng dụng: $APPS/vo-lam-manager.desktop"

#!/usr/bin/env bash
# Mở ứng dụng Võ Lâm Manager (Electron). Dùng cho Linux / macOS.
# Lần đầu tự cài các gói cần thiết (cần Node.js 18.11+ và mạng).
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Không tìm thấy Node.js. Cài Node.js 18.11 trở lên (xem README) rồi chạy lại." >&2
  exit 1
fi
if [ ! -d node_modules/electron ]; then
  echo "Đang cài Electron (lần đầu, vài phút)..."
  npm install --no-audit --no-fund
fi
# npm đôi khi bỏ qua bước tải file chạy của Electron: tải nốt nếu thiếu
if [ ! -d node_modules/electron/dist ]; then
  node node_modules/electron/install.js
fi

# VS Code / vài công cụ đặt biến này làm Electron chạy như Node thường nên phải bỏ đi
exec env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron . "$@"

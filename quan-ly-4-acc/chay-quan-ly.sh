#!/usr/bin/env bash
# Chạy máy chủ cục bộ (cần Node.js 18.11+) rồi mở trang quản lý 4 cửa sổ trong trình duyệt. Dùng cho Linux / macOS.
# Dùng "node --watch": sửa server.js thì máy chủ tự khởi động lại, không cần tắt mở lại.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Không tìm thấy Node.js. Cài Node.js 18.11 trở lên (xem README, mục Linux) rồi chạy lại." >&2
  exit 1
fi

URL="http://127.0.0.1:8800/"
if command -v xdg-open >/dev/null 2>&1 && { [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; }; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
else
  echo "Mở trình duyệt vào: $URL"
fi

echo "Đang chạy. Nhấn Ctrl+C để tắt máy chủ (4 khung game sẽ mất kết nối)."
exec node --watch server.js

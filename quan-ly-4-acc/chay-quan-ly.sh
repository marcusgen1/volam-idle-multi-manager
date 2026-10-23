#!/usr/bin/env bash
# Chạy máy chủ cục bộ (cần Node.js 18.11+) rồi mở trang quản lý 4 cửa sổ trong trình duyệt. Dùng cho Linux / macOS.
# Dùng "node --watch": sửa server.js thì máy chủ tự khởi động lại, không cần tắt mở lại.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Không tìm thấy Node.js. Cài Node.js 18.11 trở lên (xem README, mục Linux) rồi chạy lại." >&2
  exit 1
fi

# Lấy bản mới từ GitHub (nếu là bản clone và có git). Lỗi mạng / có sửa tay xung đột thì bỏ qua, vẫn chạy bản hiện có.
if command -v git >/dev/null 2>&1 && git -C .. rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Đang kiểm tra bản mới trên GitHub..."
  GIT_TERMINAL_PROMPT=0 timeout 30 git -C .. pull --ff-only --quiet 2>&1 || echo "Không cập nhật được (bỏ qua, chạy bản hiện có)."
fi

URL="http://127.0.0.1:8800/"
if command -v xdg-open >/dev/null 2>&1 && { [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; }; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
else
  echo "Mở trình duyệt vào: $URL"
fi

echo "Đang chạy. Nhấn Ctrl+C để tắt máy chủ (4 khung game sẽ mất kết nối)."
exec node --watch server.js

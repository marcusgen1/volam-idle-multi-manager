#!/usr/bin/env bash
# Mở 4 cửa sổ Chrome / Chromium, mỗi cửa sổ một hồ sơ (profile) riêng để đăng nhập 4 tài khoản game. Dùng cho Linux.
# Dùng:  ./mo-4-cua-so.sh            mở cả 4, xếp 2x2
#        ./mo-4-cua-so.sh 2          chỉ mở cửa sổ số 2
#        ./mo-4-cua-so.sh --dry-run  chỉ in lệnh, không mở
GAME_URL="https://volamidle.pages.dev/"
COUNT=4
ONLY=0
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    [1-4]) ONLY="$arg" ;;
    *) echo "Tham số không hợp lệ: $arg" >&2; exit 1 ;;
  esac
done

CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "Không tìm thấy Chrome / Chromium. Cài một trong hai rồi chạy lại." >&2
  exit 1
fi

ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/VolamProfiles"

# Kích thước màn hình (cần xdpyinfo hoặc xrandr); không đọc được thì dùng 1920x1080
W_SCREEN=1920
H_SCREEN=1080
if command -v xdpyinfo >/dev/null 2>&1 && size=$(xdpyinfo 2>/dev/null | awk '/dimensions:/ {print $2; exit}') && [ -n "$size" ]; then
  W_SCREEN="${size%x*}"; H_SCREEN="${size#*x}"
elif command -v xrandr >/dev/null 2>&1 && size=$(xrandr 2>/dev/null | awk '/\*/ {print $1; exit}') && [ -n "$size" ]; then
  W_SCREEN="${size%x*}"; H_SCREEN="${size#*x}"
fi
W=$((W_SCREEN / 2))
H=$((H_SCREEN / 2))

for i in $(seq 1 "$COUNT"); do
  if [ "$ONLY" -gt 0 ] && [ "$i" -ne "$ONLY" ]; then continue; fi
  col=$(( (i - 1) % 2 ))
  row=$(( (i - 1) / 2 ))
  x=$((col * W))
  y=$((row * H))
  args=(
    "--user-data-dir=$ROOT/acc$i"
    "--no-first-run"
    "--no-default-browser-check"
    "--new-window"
    "--window-position=$x,$y"
    "--window-size=$W,$H"
    "$GAME_URL"
  )
  if [ "$DRY" -eq 1 ]; then
    echo "$CHROME ${args[*]}"
  else
    "$CHROME" "${args[@]}" >/dev/null 2>&1 &
    sleep 0.6
  fi
done

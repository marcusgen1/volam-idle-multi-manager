#!/usr/bin/env bash
# Mở tối đa 5 cửa sổ Chrome / Chromium, mỗi cửa sổ một hồ sơ (profile) riêng (acc1 … acc5) chạy trang game chính thức,
# nên mỗi tài khoản có bộ nhớ / phiên đăng nhập riêng, không đè lên nhau. Dùng cho Linux.
# Cửa sổ 5 đi qua proxy ghi ở proxy.json (khóa "5") nếu có; proxy có user:pass thì Chrome sẽ tự hỏi tên đăng nhập / mật khẩu (SOCKS5 có mật khẩu thì không dùng được).
# Dùng:  ./mo-4-cua-so.sh            mở cả 5 (4 cửa sổ xếp 2x2, 5 cửa sổ xếp 3 trên + 2 dưới)
#        ./mo-4-cua-so.sh 2          chỉ mở cửa sổ số 2
#        ./mo-4-cua-so.sh --dry-run  chỉ in lệnh, không mở
#        VL_COUNT=4 ./mo-4-cua-so.sh chỉ mở 4 cửa sổ
GAME_URL="https://volamidle.pages.dev/"
COUNT="${VL_COUNT:-5}"
PROXY_FILE="$(cd "$(dirname "$0")" && pwd)/proxy.json"
ONLY=0
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    [1-5]) ONLY="$arg" ;;
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
# Proxy của cửa sổ $1 trong proxy.json (rỗng nếu không có). Chrome chỉ nhận dạng http:// hoặc socks5://host:port
proxy_of() {
  [ -f "$PROXY_FILE" ] && command -v node >/dev/null 2>&1 || return 0
  node -e 'try{const u=new URL(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]]);const k=u.protocol.replace(":","");if(!["http","socks5","socks5h","socks"].includes(k))process.exit(0);if(u.username&&k!=="http"){console.error("Cửa sổ "+process.argv[2]+": SOCKS5 có mật khẩu Chrome không hỗ trợ, bỏ qua proxy.");process.exit(0)}console.log((k==="http"?"http":"socks5")+"://"+u.hostname+(u.port?":"+u.port:""))}catch(e){}' "$PROXY_FILE" "$1" 2>&1
}

# Xếp cửa sổ: 5 cửa sổ = 3 trên + 2 dưới (giống lưới của trang quản lý), còn lại 2 cột
for i in $(seq 1 "$COUNT"); do
  if [ "$ONLY" -gt 0 ] && [ "$i" -ne "$ONLY" ]; then continue; fi
  if [ "$COUNT" -eq 5 ]; then
    if [ "$i" -le 3 ]; then W=$((W_SCREEN / 3)); x=$(( (i - 1) * W )); y=0
    else W=$((W_SCREEN / 2)); x=$(( (i - 4) * W )); y=$((H_SCREEN / 2)); fi
    H=$((H_SCREEN / 2))
  else
    W=$((W_SCREEN / 2)); H=$((H_SCREEN / 2))
    x=$(( ((i - 1) % 2) * W )); y=$(( ((i - 1) / 2) * H ))
  fi
  args=(
    "--user-data-dir=$ROOT/acc$i"
    "--no-first-run"
    "--no-default-browser-check"
    "--new-window"
    "--window-position=$x,$y"
    "--window-size=$W,$H"
  )
  px="$(proxy_of "$i")"
  case "$px" in
    http://*|socks5://*) args+=("--proxy-server=$px"); echo "Cửa sổ $i: dùng proxy $px" ;;
    "") ;;
    *) echo "$px" >&2 ;;
  esac
  args+=("$GAME_URL")
  if [ "$DRY" -eq 1 ]; then
    echo "$CHROME ${args[*]}"
  else
    "$CHROME" "${args[@]}" >/dev/null 2>&1 &
    sleep 0.6
  fi
done

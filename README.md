# Võ Lâm Idle – Quản lý 4 nhân vật

Trang quản lý chạy **4 cửa sổ game cạnh nhau trong một trang**, mỗi cửa sổ đăng nhập một tài khoản riêng,
kèm các nút tự động hóa (đổi chế độ, Boss tuần, bán đồ xanh, đóng/gửi bình Phúc Duyên…).

> Repo riêng tư. Không chứa mã của game: máy chủ cục bộ chuyển tiếp trang game từ `https://volamidle.pages.dev` lúc chạy.

## Cấu trúc

| Tệp | Vai trò |
|---|---|
| `quan-ly-4-acc/server.js` | Máy chủ cục bộ (Node.js): phục vụ trang quản lý và chuyển tiếp game qua 4 cổng riêng |
| `quan-ly-4-acc/app.html` | Trang quản lý (giao diện) |
| `quan-ly-4-acc/agent.js` | Script được chèn vào từng khung game để điều khiển chế độ chơi |
| `quan-ly-4-acc/chay-quan-ly.bat` / `.sh` | Chạy máy chủ + mở trang (Windows / Linux, macOS) |
| `quan-ly-4-acc/mo-4-cua-so.ps1` `.bat` / `.sh` | Phương án khác: 4 cửa sổ Chrome riêng (Windows / Linux) |

## Chạy trang quản lý

Cần **Node.js 18.11 trở lên**.

| Hệ điều hành | Lệnh |
|---|---|
| Mọi hệ điều hành | `npm start` |
| Windows | bấm đúp `quan-ly-4-acc/chay-quan-ly.bat` |
| Linux / macOS | `./quan-ly-4-acc/chay-quan-ly.sh` |

Sau đó mở <http://127.0.0.1:8800/>.

- Cổng `8800`: trang quản lý. Cổng `8801`–`8804`: bốn bản chuyển tiếp tới game, mỗi cổng là một *origin* riêng nên
  4 tài khoản có kho lưu trữ / phiên đăng nhập riêng, không đè nhau.
- Máy chủ chỉ lắng nghe `127.0.0.1` (chỉ máy bạn truy cập được).
- Điều duy nhất được thay đổi so với trang gốc: HTML của game được chèn thêm một dòng `<script src="/__agent.js">`
  (`quan-ly-4-acc/agent.js`) để trang quản lý điều khiển chế độ chơi.
- `app.html` và `agent.js` được đọc lại mỗi lần tải, nên sửa xong chỉ cần F5 / bấm ⟳ ở khung. Các lệnh chạy ở trên đều dùng
  `node --watch` nên sửa `server.js` máy chủ tự khởi động lại.

## Hướng dẫn cho Linux

### 1. Cài Node.js (18.11 trở lên)

Kiểm tra: `node -v`. Nếu chưa có hoặc quá cũ, chọn một cách:

```bash
# Cách 1: nvm (khuyên dùng, không cần quyền root)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# mở lại terminal, rồi:
nvm install --lts

# Cách 2: Debian / Ubuntu qua NodeSource
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cách 3: Fedora
sudo dnf install -y nodejs
```

### 2. Lấy mã nguồn và chạy

```bash
git clone https://github.com/marcusgen1/volam-idle-multi-manager.git
cd volam-idle-multi-manager
chmod +x quan-ly-4-acc/*.sh        # chỉ cần làm một lần
./quan-ly-4-acc/chay-quan-ly.sh    # hoặc: npm start
```

Script tự mở trình duyệt vào <http://127.0.0.1:8800/> nếu có môi trường đồ họa (`xdg-open`); không thì bạn tự mở địa chỉ đó.
Nhấn `Ctrl+C` trong terminal để tắt (4 khung game sẽ mất kết nối).

### 3. Máy Linux không có màn hình (VPS / server) – truy cập từ máy khác

Máy chủ chỉ nghe trên `127.0.0.1`, nên dùng **SSH tunnel** và phải chuyển tiếp **cả 5 cổng** (8800 cho trang quản lý
và 8801–8804 cho 4 khung game, vì trình duyệt của bạn gọi trực tiếp các cổng này):

```bash
ssh -N \
  -L 8800:127.0.0.1:8800 -L 8801:127.0.0.1:8801 -L 8802:127.0.0.1:8802 \
  -L 8803:127.0.0.1:8803 -L 8804:127.0.0.1:8804 \
  nguoidung@dia-chi-may-linux
```

Giữ lệnh trên chạy, rồi mở <http://127.0.0.1:8800/> trên máy của bạn. Trên server có thể chạy nền bằng `tmux` hoặc `screen`
(ví dụ `tmux new -s volam` rồi `npm start`).
**Không** mở các cổng này ra Internet: máy chủ không có mật khẩu và chuyển tiếp trực tiếp tới game.

### 4. (Tùy chọn) 4 cửa sổ Chrome / Chromium riêng

```bash
./quan-ly-4-acc/mo-4-cua-so.sh            # mở cả 4, xếp 2x2
./quan-ly-4-acc/mo-4-cua-so.sh 2          # chỉ cửa sổ số 2
./quan-ly-4-acc/mo-4-cua-so.sh --dry-run  # chỉ in lệnh, không mở
```

Cần `google-chrome`, `chromium` hoặc `chromium-browser`. Muốn xếp đúng theo cỡ màn hình, cài thêm `xdpyinfo`
(`x11-utils`) hoặc `xrandr`; không có thì dùng 1920×1080. Hồ sơ lưu ở `~/.local/share/VolamProfiles/acc1…acc4`,
nên lần sau game nhớ đăng nhập. Phương án này không dùng trang quản lý ở trên.

### Gỡ lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `Permission denied` khi chạy `.sh` | `chmod +x quan-ly-4-acc/*.sh` |
| `EADDRINUSE` (cổng đã được dùng) | Đã có một máy chủ đang chạy: `ss -ltnp \| grep 880` rồi tắt tiến trình cũ |
| `node: not found` hoặc `--watch` không nhận | Node.js chưa cài hoặc cũ hơn 18.11: xem lại mục 1 |
| Trang trắng ở các khung game | Máy cần truy cập được `https://volamidle.pages.dev` (kiểm tra mạng / proxy) |
| Dùng SSH tunnel mà khung game không tải | Thiếu một trong các cổng 8801–8804 trong lệnh `ssh -L` |

## Tính năng chính

- Chọn chế độ cho cả 4 hoặc từng khung: Luyện Công, Nhiệm Vụ, Phó Bản, Leo Tháp, **Chạy tất cả** (Phó Bản → Nhiệm Vụ).
  Nhiệm Vụ / Phó Bản tự về Luyện Công khi hết việc; Leo Tháp tự vào lại khi gục ngã và dừng sau 3 lần chết liên tiếp.
- **Boss tuần**: tự khiêu chiến đến hết lượt (bấm lần nữa để dừng).
- **Bán đồ xanh** (thủ công + tự bán khi hành trang đầy), tùy chọn gồm cả đồ game đang giữ.
- **Đóng bình** Phúc Duyên và **Gửi bình** (một thư gộp cả Đại / Trung / Tiểu) cho một nhân vật. Tên người nhận
  nằm ở hằng số `PD_TO` trong `quan-ly-4-acc/app.html`.
- Bố cục 2×2 hoặc 4 cột, phóng to / tắt từng khung. **Dùng bố cục 2×2 khi chạy Nhiệm Vụ**: ở 4 cột game không vẽ khung
  "Nhiệm vụ Theo Dấu" nên script không đọc được tiến độ.

Mật khẩu **không** được lưu trong trang này; hãy dùng "Nhớ tài khoản" của game và trình quản lý mật khẩu của Chrome.

## Lưu ý

- Các script chỉ bấm những nút có sẵn trên giao diện game, nhưng vẫn là tự động hóa. Hãy tuân theo luật của game.
- Script đọc giao diện game theo tên phần tử hiện tại. Khi game cập nhật có thể cần chỉnh lại `agent.js`.
- Gửi thư và bán đồ **không hoàn tác được**.

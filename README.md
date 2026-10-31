# Võ Lâm Idle – Quản lý nhiều nhân vật

Trang quản lý chạy **nhiều cửa sổ game cạnh nhau trong một trang** (mặc định và tối đa 5; muốn nhiều hơn thì đặt `VL_SLOTS`), mỗi cửa sổ đăng nhập một tài khoản riêng,
kèm các nút tự động hóa (đổi chế độ, Boss tuần, bán đồ xanh, bán HK cơ bản, đóng bình / dùng hết bình / mở hết rương Phúc Duyên…).

> Repo riêng tư. Không chứa mã của game: máy chủ cục bộ chuyển tiếp trang game từ `https://volamidle.pages.dev` lúc chạy.

## Cấu trúc

| Tệp | Vai trò |
|---|---|
| `quan-ly-4-acc/server.js` | Máy chủ cục bộ (Node.js): phục vụ trang quản lý và chuyển tiếp game qua các cổng riêng (mỗi khung một cổng) |
| `quan-ly-4-acc/app.html` | Trang quản lý (giao diện) |
| `quan-ly-4-acc/agent.js` | Script được chèn vào từng khung game để điều khiển chế độ chơi |
| `quan-ly-4-acc/chay-quan-ly.bat` / `.sh` | Chạy máy chủ + mở trang (Windows / Linux, macOS) |
| `quan-ly-4-acc/mo-4-cua-so.ps1` `.bat` / `.sh` | Mỗi tài khoản một cửa sổ Chrome riêng chạy game chính thức (`.sh`: 5 cửa sổ, có proxy khung 5; `.ps1` / `.bat` Windows: 4 cửa sổ) |

## Chạy trang quản lý

Cần **Node.js 18.11 trở lên**.

| Hệ điều hành | Lệnh |
|---|---|
| Mọi hệ điều hành | `npm start` |
| Windows | bấm đúp `quan-ly-4-acc/chay-quan-ly.bat` |
| Linux / macOS | `./quan-ly-4-acc/chay-quan-ly.sh` |

Sau đó mở <http://127.0.0.1:8800/>.

- Cổng `8800`: trang quản lý. Cổng `8801`–`8805` (mặc định 5 cổng, đổi bằng `VL_SLOTS`): các bản chuyển tiếp tới game, mỗi cổng là một *origin* riêng nên
  các tài khoản có kho lưu trữ / phiên đăng nhập riêng, không đè nhau.
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
Nhấn `Ctrl+C` trong terminal để tắt (các khung game sẽ mất kết nối).

### 3. Máy Linux không có màn hình (VPS / server) – truy cập từ máy khác

Máy chủ chỉ nghe trên `127.0.0.1`, nên dùng **SSH tunnel** và phải chuyển tiếp **cả 6 cổng** (8800 cho trang quản lý
và 8801–8805 cho các khung game, vì trình duyệt của bạn gọi trực tiếp các cổng này; chỉ cần các cổng bạn dùng):

```bash
ssh -N \
  -L 8800:127.0.0.1:8800 -L 8801:127.0.0.1:8801 -L 8802:127.0.0.1:8802 \
  -L 8803:127.0.0.1:8803 -L 8804:127.0.0.1:8804 -L 8805:127.0.0.1:8805 \
  nguoidung@dia-chi-may-linux
```

Giữ lệnh trên chạy, rồi mở <http://127.0.0.1:8800/> trên máy của bạn. Trên server có thể chạy nền bằng `tmux` hoặc `screen`
(ví dụ `tmux new -s volam` rồi `npm start`).
**Không** mở các cổng này ra Internet: máy chủ không có mật khẩu và chuyển tiếp trực tiếp tới game.

### 4. Cửa sổ Chrome / Chromium riêng cho từng tài khoản (khuyên dùng với game bản mới)

Game bản mới (từ v1019) chỉ chạy ở tên miền chính thức `volamidle.pages.dev` và từ chối chạy qua `127.0.0.1` như các khung của trang quản lý
("Võ Lâm Idle chỉ chơi online"). Bấm liên kết trong khung sẽ đưa các khung về cùng một địa chỉ nên dùng chung phiên đăng nhập và đè nhân vật lên nhau.
Vì vậy mỗi tài khoản nên chạy trong **một hồ sơ Chrome riêng**:

```bash
./quan-ly-4-acc/mo-4-cua-so.sh            # mở cả 5 (3 cửa sổ trên + 2 dưới)
./quan-ly-4-acc/mo-4-cua-so.sh 2          # chỉ cửa sổ số 2
VL_COUNT=4 ./quan-ly-4-acc/mo-4-cua-so.sh # chỉ 4 cửa sổ, xếp 2x2
./quan-ly-4-acc/mo-4-cua-so.sh --dry-run  # chỉ in lệnh, không mở
```

Hoặc bấm **🪟 Mở Chrome riêng** ở cột trái trang quản lý (Linux / macOS; Windows dùng `mo-4-cua-so.bat`).
Cần `google-chrome`, `chromium` hoặc `chromium-browser`. Muốn xếp đúng theo cỡ màn hình, cài thêm `xdpyinfo`
(`x11-utils`) hoặc `xrandr`; không có thì dùng 1920×1080. Hồ sơ lưu ở `~/.local/share/VolamProfiles/acc1…acc5`,
nên lần sau game nhớ đăng nhập. **Cửa sổ 5 đi qua proxy** ghi ở `proxy.json` (khóa `5`, dạng `http://host:port` hoặc `socks5://host:port`; proxy có user:pass thì Chrome tự hỏi,
SOCKS5 có mật khẩu Chrome không hỗ trợ). Các cửa sổ này chạy game chính thức nên **không** có nút điều khiển (Luyện công, Bán đồ, Màn hình đen…) của trang quản lý.
Game vẫn giới hạn số tài khoản mỗi máy / mỗi mạng theo quy định của nó.

### Gỡ lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `Permission denied` khi chạy `.sh` | `chmod +x quan-ly-4-acc/*.sh` |
| `EADDRINUSE` (cổng đã được dùng) | Đã có một máy chủ đang chạy: `ss -ltnp \| grep 880` rồi tắt tiến trình cũ |
| `node: not found` hoặc `--watch` không nhận | Node.js chưa cài hoặc cũ hơn 18.11: xem lại mục 1 |
| Trang trắng ở các khung game | Máy cần truy cập được `https://volamidle.pages.dev` (kiểm tra mạng / proxy) |
| Dùng SSH tunnel mà khung game không tải | Thiếu cổng của khung đó (8801–8805) trong lệnh `ssh -L` |

## Cập nhật từ GitHub

Cần cài `git` và chạy từ bản clone (không phải tải zip); không thì tính năng này tự tắt.

- **Khi khởi động**: `chay-quan-ly.sh` / `.bat` chạy `git pull --ff-only`. Lỗi mạng hoặc có sửa tay xung đột thì bỏ qua, vẫn chạy bản đang có.
- **Khi đang chạy**: máy chủ `git fetch` sau 5 giây rồi cứ 3 giờ một lần. Có commit mới thì trang quản lý hiện thanh vàng
  "Có bản mới trên GitHub", bấm **Cập nhật** để `git pull --ff-only` rồi tải lại trang (các khung game cũng tải lại), hoặc **Để sau**.
- Lệnh cập nhật chỉ nhận từ chính trang quản lý (kiểm tra header, Host và Origin), trang web khác không gọi được.
- Nút **⬆ Cập nhật** ở đầu trang: kiểm tra GitHub ngay (không cần chờ thông báo); có bản mới thì hỏi xác nhận rồi cập nhật, không thì báo "đang dùng bản mới nhất" hoặc lý do không kiểm tra được.
- Muốn cập nhật tay: `git pull` trong thư mục repo.

## Tính năng chính

- **Thêm / xóa khung**: nút **＋ Thêm khung** ở đầu trang (tối đa bằng số cổng máy chủ mở, mặc định 5) và nút **✕** ở mỗi khung. Mỗi khung giữ một cổng cố định nên xóa một khung không làm mất phiên đăng nhập của khung khác. Muốn nhiều hoặc ít khung hơn: `VL_SLOTS=8 npm start`. Mỗi khung là một bản game chạy riêng nên càng nhiều khung máy càng nặng.
- Chọn chế độ cho tất cả hoặc từng khung: Luyện Công, Nhiệm Vụ, Phó Bản, Leo Tháp, **Chạy PB + NV** (Phó Bản → Nhiệm Vụ).
  Ô chọn ngay dưới nút Chạy PB + NV đặt chế độ sau khi chạy xong: Luyện Công (mặc định) hoặc Leo Tháp (áp dụng từ lần bấm kế tiếp).
  Nhiệm Vụ / Phó Bản chạy riêng thì tự về Luyện Công khi hết việc; Leo Tháp tự vào lại khi gục ngã và dừng sau 3 lần chết liên tiếp.
- **Boss tuần**: tự khiêu chiến đến hết lượt (bấm lần nữa để dừng).
- **Bán đồ xanh** (💰; thủ công + **Tự bán** khi hành trang đầy, Tự bán chỉ bán đồ xanh), tùy chọn gồm cả đồ xanh game đang giữ.
- **Bán HK cơ bản** (🛡, chỉ thủ công, không nằm trong Tự bán): bán lẻ đồ **Hoàng Kim cơ bản** — món có tên bắt đầu bằng Định Quốc, Hiệp Cốt, Kim Phong hoặc
  Thiên Hoàng — lấy **KNB khóa** (game đổi mỗi món Hoàng Kim 10 KNB khóa). Giữ lại: món khóa 🔒 / đang giữ cho Dã Tẩu, món đã cường hóa (+N), đồ đang mặc,
  đồ Hoàng Kim bộ khác (An Bang, Môn Phái…), Bạch Kim và đồ xanh.
- **Đóng bình PD** (🎐), **Dùng bình PD** (🧪: dùng hết bình Đại / Trung / Tiểu trong hành trang, cộng điểm Phúc Duyên)
  và **Mở hết PD** (🎁: mở hết rương Phúc Duyên trong Phần thưởng, mỗi rương 10 điểm). **Mở hồng bao** (🧧): mở hết Hồng Bao và Đại Hồng Bao đang có
  (lưu trên máy chủ, dùng chung cả tài khoản; mỗi lần bấm game mở tối đa 10 cái nên script bấm lặp tới khi hết). Nút "tất cả" ở đầu trang hỏi lại trước khi chạy.
- **Bắt thú** (🐾, bật / tắt như Tự bán): đi tìm những loài thú chưa có trong Thú điển. Thú rơi ngẫu nhiên khi hạ quái là thú ngoài bãi luyện công
  (thường 0,1% · tinh anh 1% · trùm 8%), nên script đọc Thú điển, tra loài thiếu nằm ở bãi nào (`window.JX_FEED.pets` của game),
  chuyển tới bãi đã mở có nhiều loài thiếu nhất rồi luyện công ở đó; có loài mới thì tính lại bãi. Dòng trạng thái ghi tên các loài còn thiếu ở bãi đang đứng.
  Tự dừng khi đủ Thú điển hoặc khi các loài còn thiếu đều ở bãi chưa mở. Nút "tất cả" bật / tắt cho mọi khung; nút 🐾 ở từng khung bật / tắt riêng.
  Chọn chế độ khác (Nhiệm Vụ, Phó Bản…) thì Bắt thú của khung đó tắt. Chọn bãi làm game tắt "Tự đổi theo cấp". Khung tải lại thì tự bật lại nếu đang bật.
- **Đổi lượng → KNB** (💱) và **Gửi hết KNB** (📨), chỉ có ở mục Tất cả (đều hỏi xác nhận, không hoàn tác):
  - **Ba nút Đổi lượng → KNB, Gửi hết KNB và Gửi đồ Hoàng Kim bỏ qua khung 5** (khung chạy ở cổng 8805, thường là nhân vật nhận / giữ đồ); hộp xác nận ghi rõ "(trừ khung 5)".
  - Đổi: mở Kỳ Trân Các và bấm mua KNB (1 KNB = 10 vạn lượng, giới hạn mỗi ngày — hiện 5.000) cho tới khi ngân lượng chỉ còn **số vạn lượng ở ô "Giữ lại"** (mặc định 500).
    Số ngân lượng lấy từ bản lưu của game (cũ tới ~10 giây nên chỉ đổi ít hơn chứ không đổi quá). Game không cho đổi ngược KNB → lượng. Kỳ Trân Các có hai bảng, script tự chuyển sang "💰 Bảng Kim Nguyên Bảo". KNB khóa không gửi thư được nên không tính vào "Gửi hết KNB".
  - Gửi: mở Hộp thư, gửi **toàn bộ KNB** đang có cho nhân vật ở ô "Gửi KNB cho nhân vật" (không kèm đồ, không phải thư giao dịch). Chỉ dùng được với tài khoản online.
- **Mở rương ngựa** (🐎, mục Tất cả): mở hết Rương Ngựa đang có. Trước hết mở rương trong "túi vật phẩm" của Hành trang bằng nút **Dùng ×N** của game
  (mở tối đa 10 rương mỗi lần bấm), rồi mở nốt rương nằm thành chồng trong lưới hành trang từng cái một qua Kỳ Trân Các › "Thú cưỡi" › Dùng.
  Ngựa vào hành trang, Quý trở lên tự khóa. Dừng khi hết rương hoặc game báo lỗi (ví dụ "Hành trang đầy").
- **Mua lệnh bài Dã Tẩu** (🎫, mục Tất cả, hỏi xác nhận): mua hết Lệnh Bài Dã Tẩu có thể mua bằng **KNB khóa** ở Kỳ Trân Các (bảng "🔒 Bảng KNB khóa" › thẻ "Ủy thác & nhiệm vụ";
  giá và số lượng tối đa mỗi ngày theo Kỳ Trân Các của game, script đọc từ card chứ không ghi cứng). Bấm ×10 rồi Mua cho tới khi đủ số lượng trong ngày hoặc hết KNB khóa;
  báo số đã mua, KNB khóa đã dùng (= số lượng × giá trên card) và "hôm nay X/Y".
- **Gửi đồ Hoàng Kim** (📨, mục Tất cả, dùng chung ô tên người nhận với Gửi hết KNB; hỏi xác nhận, không hoàn tác): mở Hộp thư rồi gửi mọi món
  Hoàng Kim trong hành trang (ô có lớp `r4`), mỗi thư tối đa 10 món (giới hạn của game) và lặp tới khi hết. **Gồm cả món đã khóa 🔒** (game cho gửi thư món khóa; khóa chỉ chặn
  tự bán / bán Chợ). Giữ lại: ô 📜 (giữ cho Dã Tẩu), đồ đang mặc và đồ Bạch Kim. Gửi bằng thư thường (không phải thư giao dịch). Không thấy món nào thì báo kèm các độ hiếm đang có trong hành trang.
- **Tài khoản và mã máy trên tên khung**: tên khung có thêm `· tk <tên tài khoản>` (đọc từ phiên đăng nhập của game trong sessionStorage của khung); rê chuột vào tên khung để xem thêm 6 ký tự đầu mã máy
  của game (`jxDev`). Dùng để nhìn ra hai khung có đang đăng nhập cùng một tài khoản hay dùng chung mã máy không.
- **Màn hình đen** (🌑 ở cuối cột trái, cạnh Tải lại): bật / tắt tùy chọn "Màn hình đen" của game (Hệ thống > Hiển Thị: ngừng vẽ, game vẫn chạy, nhẹ máy nhất khi treo)
  cho mọi khung đang bật. Nút hiện BẬT khi có khung đang đen; bấm vào khung đen để bật lại riêng khung đó (nút tự cập nhật). Game tự nhớ lựa chọn
  trong `localStorage` của khung (khóa `jxidle_ui`) nên tải lại khung vẫn giữ nguyên. Agent mở thẻ Hệ thống một lần chạy để tích ô `#uBlack` rồi trả lại thẻ cũ.
- **Nhật ký** (📒 ở đầu trang): bảng theo từng nhân vật gồm cấp tăng, số tầng tháp leo được, ngân lượng và Kim Nguyên Bảo kiếm / chi trong ngày (giờ Việt Nam),
  số liệu 14 ngày gần nhất và danh sách sự kiện đáng chú ý (đồ phổ, Thần Mã; đổi mẫu nhận diện ở
  `LOG_NOTABLE` trong `agent.js`); có sự kiện mới thì hiện thông báo nhỏ ở góc dưới phải. Số liệu lưu trong `localStorage` của trình duyệt.
  Cấp, ngân lượng, KNB, tầng tháp và tên nhân vật đọc từ bản lưu của chính game (localStorage của khung, game ghi mỗi ~10 giây, chỉ đọc không ghi)
  nên chính xác và vẫn cập nhật khi trang ở tab nền (thanh trên của game chỉ được vẽ lại khi khung đang được nhìn thấy, còn số mặc định cấp 1 / 0 lượng nếu chưa vẽ nên không dùng). Chỉ ghi số tăng / giảm so với lần đọc trước, lần đọc đầu chỉ đặt mốc. "Kiếm" cộng các lần số tăng,
  "chi" cộng các lần giảm. Tầng tháp tính theo mốc tầng game lưu (tăng dần mỗi tầng qua, ra / vào tháp vẫn giữ).
  Dòng nhật ký chỉ có khi khung thông báo của game ở tab **Hệ thống**: lần đầu sau khi tải khung script tự bấm sang tab đó một lần.
- Bố cục 2×2 hoặc 4 cột, phóng to / tắt từng khung. **Dùng bố cục 2×2 khi chạy Nhiệm Vụ**: ở 4 cột game không vẽ khung
  "Nhiệm vụ Theo Dấu" nên script không đọc được tiến độ. Vì vậy khi chọn Nhiệm Vụ, Phó Bản hoặc Chạy PB + NV mà đang ở bố cục 1 hàng, trang tự chuyển về lưới.
- **Bố cục lưới (nút Lưới)**: mọi khung đều nằm ngang, không bỏ trống ô nào. 4 khung = 2×2, **5 khung = 3 khung trên + 2 khung dưới** (mỗi khung dưới rộng hơn).
  Game chỉ vẽ trọn bố cục ngang khi khung rộng từ khoảng 640px (hẹp hơn thì chừa dải đen bên phải), nên ô lưới hẹp hơn mức đó (ví dụ 3 khung trên của lưới 5 khung) được chạy ở bề rộng 650px
  rồi tự thu nhỏ vừa ô (khoảng 0,88×). Nút **1 hàng** (các khung đứng cạnh nhau, dọc) giữ nguyên, không thu nhỏ.

Mật khẩu **không** được lưu trong trang này; hãy dùng "Nhớ tài khoản" của game và trình quản lý mật khẩu của Chrome.

## Proxy riêng cho từng khung (đổi IP)

Nút **🌐** ở thanh tiêu đề của **khung thứ 5** (khung chạy ở cổng 8805; các khung 1–4 không có nút này và luôn dùng IP máy): dán proxy dạng `http://user:pass@host:port` hoặc `socks5://user:pass@host:port` (bỏ `user:pass@` nếu proxy không cần đăng nhập).
Máy chủ lưu vào `quan-ly-4-acc/proxy.json` (không đưa lên GitHub; cũng đặt được bằng biến môi trường `VL_PROXY_5=socks5://host:port`), kiểm tra bằng cách so IP máy với IP qua proxy,
rồi tải lại khung. Nút 🌐 sáng lên khi khung đang dùng proxy; để trống ô nhập để tắt.

- Với khung có proxy, **cả trang game lẫn mọi kết nối game gọi ra `*.volamidle.net`** (đăng nhập, dữ liệu, WebSocket) đều đi qua proxy, nên máy chủ game thấy IP của proxy.
  Cách làm: `px-shim.js` được chèn vào khung đó, đổi các lời gọi `fetch` / `XMLHttpRequest` / `WebSocket` tới `*.volamidle.net` thành gọi về cổng của khung, máy chủ cục bộ chuyển tiếp qua proxy.
  Chỉ máy chủ của game được phép đi qua đường này (thêm tên miền khác bằng `VL_PX_ALLOW=ten-mien.com`).
- **Hộp chọn proxy**: bấm 🌐 mở danh sách proxy chọn sẵn (cờ nước · proxy · độ trễ). Khi mở, app tự kiểm tra từng proxy qua chính game (sống / chết, IP + nước game thấy, thời gian phản hồi),
  xếp cái sống và nhanh lên đầu; bấm một dòng để dùng ngay (tự kiểm tra IP rồi tải lại khung 5). **✎ Nhập tay…** để dán proxy khác, **⏻ Tắt proxy** để về IP máy, **⟳ Kiểm tra lại** để thử lại cả danh sách.
  Danh sách nằm ở `quan-ly-4-acc/proxy-presets.json` (khoảng 10 proxy công cộng HK / SG / JP / VN, chọn từ nhiều lần quét vì nhanh và còn sống; **proxy miễn phí chết rất nhanh**, cái nào ✗ chết thì sửa file hoặc thêm cái mới).
  Proxy riêng của bạn (có user/pass, ví dụ Webshare) đặt trong `quan-ly-4-acc/proxy-presets.local.json` (cùng dạng `[{ "url": "http://user:pass@host:port", "country": "US" }]`, **không đưa lên GitHub**), nó được gộp vào cùng hộp chọn và mật khẩu không hiện ra trang.
- **Trạng thái kết nối** hiện ngay cạnh nút 🌐 của khung 5: `● <IP game thấy> · <thời gian phản hồi>` (xanh) khi proxy chạy tốt; `● IP trùng máy` (vàng) khi proxy chưa đổi được IP;
  `● không kết nối` / `● proxy lỗi` (đỏ) khi kiểm tra thất bại hoặc game vừa gặp lỗi qua proxy; `○ chưa đặt proxy` khi khung dùng IP máy. Rê chuột vào để xem chi tiết (proxy, IP máy, giờ kiểm tra, nội dung lỗi), bấm vào để kiểm tra lại ngay.
  App tự kiểm tra mỗi 60 giây (một yêu cầu nhỏ qua proxy) và đọc lỗi thật từ lưu lượng game mỗi 10 giây.
- Các khung 1–4 chạy như cũ. Proxy gắn với **cổng** của khung (cổng 8805), không gắn với vị trí hiển thị: xóa khung 1–4 rồi thêm lại không làm khung 5 mất proxy. Khung 5 là khung được thêm sau cùng khi 4 khung đầu còn đủ.
- **Tự đổi proxy khi proxy chết** (ô tích trong hộp 🌐, mặc định bật, nhớ ở `quan-ly-4-acc/proxy-auto.json`, không đưa lên GitHub): máy chủ cứ 30 giây kiểm tra proxy của khung
  (bỏ qua nếu vừa có lưu lượng game đi qua thành công). Proxy không trả lời 2 lần liên tiếp **và** IP máy vẫn ra mạng được (tránh đổi oan khi mất mạng) thì máy chủ thử cả danh sách
  chọn sẵn, đổi sang proxy sống **nhanh nhất, ưu tiên cùng nước** với proxy cũ, bỏ proxy đang dùng ở khung khác, rồi ghi vào `proxy.json`. Khung không cần tải lại (lệnh gọi game đi qua máy chủ nên lấy
  proxy mới ngay; kết nối WebSocket cũ đứt thì game tự nối lại). Trang quản lý báo bằng thông báo nhỏ và tooltip của nhãn trạng thái. Không còn proxy chọn sẵn nào sống thì giữ nguyên và thử lại sau 2 phút.
  Chạy ở máy chủ nên vẫn hoạt động khi bạn không mở trang quản lý. Đổi IP giữa chừng có thể làm game hỏi đăng nhập lại; không muốn thì bỏ tích ô này.
- **Proxy MTProto của Telegram (Server / Port / Secret) không dùng được**: nó chỉ chạy cho ứng dụng Telegram. Cần proxy HTTP/HTTPS hoặc SOCKS5.
- Thư viện chống bot của game (nếu bật) và font / ảnh từ CDN vẫn tải trực tiếp từ máy bạn. Nếu proxy hỏng, khung đó không tải được game (không tự quay về IP máy để tránh lộ IP thật).

## Lưu ý

- Các script chỉ bấm những nút có sẵn trên giao diện game, nhưng vẫn là tự động hóa. Hãy tuân theo luật của game.
- Script đọc giao diện game theo tên phần tử hiện tại. Khi game cập nhật có thể cần chỉnh lại `agent.js`.
- Bán đồ, dùng bình và mở rương **không hoàn tác được**.

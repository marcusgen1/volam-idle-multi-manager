# Võ Lâm Idle – Quản lý nhiều nhân vật

**Võ Lâm Manager** là ứng dụng desktop (Electron): một cửa sổ có thanh điều khiển bên trái và **tối đa 5 khung game** cạnh nhau. Mỗi khung chạy **trang game chính thức**
trong **một phiên riêng** (như một hồ sơ trình duyệt riêng): localStorage, cookie và phiên đăng nhập không dùng chung nên các tài khoản không đè lên nhau.
Kèm các nút tự động hóa (đổi chế độ, Boss tuần, bán đồ xanh, bán HK cơ bản, đóng bình / dùng hết bình / mở hết rương Phúc Duyên, màn hình đen…) và proxy riêng cho từng khung.

> Repo riêng tư. Không chứa mã của game: ứng dụng mở thẳng `https://volamidle.pages.dev`.

> **Vì sao là ứng dụng riêng?** Game bản mới (từ v1019) chỉ chạy ở tên miền chính thức và từ chối chạy qua `127.0.0.1` ("Võ Lâm Idle chỉ chơi online"), nên bản cũ chạy trong trình duyệt
> qua máy chủ chuyển tiếp không dùng được nữa. Ứng dụng không giả tên miền hay vá file game: khung chỉ là một trình duyệt nhúng mở trang chính thức.
> Game vẫn áp dụng giới hạn riêng của nó (số tài khoản mỗi máy / mỗi mạng, JxGuard): ứng dụng không vượt các giới hạn đó.

## Cấu trúc

| Tệp | Vai trò |
|---|---|
| `desktop/main.js` | Tiến trình chính của ứng dụng: cửa sổ, phiên riêng cho từng khung, chỉ cho khung mở trang game, chạy máy chủ cục bộ |
| `desktop/preload-game.js` | Chạy trong mỗi khung: nạp `agent.js` vào trang game và nối với trang quản lý |
| `desktop/preload-dash.js`, `desktop/icon.png` | Cầu nối của cửa sổ chính, biểu tượng |
| `quan-ly-4-acc/server.js` | Máy chủ cục bộ (chạy ngay trong ứng dụng): phục vụ trang quản lý, lưu proxy, cổng chuyển tiếp proxy cho từng khung, tự đổi proxy chết |
| `quan-ly-4-acc/app.html` | Giao diện thanh điều khiển và lưới khung |
| `quan-ly-4-acc/agent.js` | Script chạy trong từng khung game để điều khiển chế độ chơi |
| `chay-ung-dung.sh` / `.bat`, `cai-ung-dung.sh` | Mở ứng dụng (Linux, macOS / Windows); thêm vào menu ứng dụng của Linux |
| `quan-ly-4-acc/chay-quan-ly.*`, `mo-4-cua-so.*` | Cách cũ (trình duyệt), game bản mới không còn chạy kiểu này |

## Chạy ứng dụng

Cần **Node.js 18.11 trở lên** và mạng ở lần đầu (tải Electron khoảng 100 MB).

| Hệ điều hành | Lệnh |
|---|---|
| Linux / macOS | `./chay-ung-dung.sh` |
| Windows | bấm đúp `chay-ung-dung.bat` |
| Mọi hệ điều hành | `npm install` rồi `npm start` |
| Linux, thêm vào menu ứng dụng | `./cai-ung-dung.sh` (gỡ: xóa `~/.local/share/applications/vo-lam-manager.desktop`) |

- Dữ liệu (phiên đăng nhập từng khung, cài đặt) lưu ở `~/.config/vo-lam-manager` (Linux); xóa thư mục này là đăng xuất tất cả.
  Đăng nhập một lần, lần sau ứng dụng nhớ.
- Cổng `8800` (trang quản lý) và `8811`–`8815` (cổng chuyển tiếp proxy của khung 1–5) chỉ lắng nghe `127.0.0.1`. Cổng `8800` đang bị chương trình khác giữ
  (ví dụ bản trình duyệt cũ vẫn chạy) thì ứng dụng báo và không mở. Đổi cổng gốc bằng `VL_BASE_PORT`, đổi số khung tối đa bằng `VL_SLOTS`.
- Trong khung, ứng dụng không mở cửa sổ mới và không rời trang game; liên kết ngoài mở bằng trình duyệt của hệ thống. Khung không cấp quyền nào ngoài toàn màn hình.
- `agent.js` được đọc lại mỗi lần tải khung: sửa xong chỉ cần bấm ⟳ ở khung. Sửa `app.html` thì Ctrl+R ở cửa sổ ứng dụng.
- Game đo độ lệch `outerWidth − innerWidth` để đoán DevTools đang mở. Trong khung nhúng, `outerWidth` là cỡ cả cửa sổ nên lệch rất lớn và game sẽ ghi cờ "f12" nhầm;
  `desktop/preload-game.js` đặt hai giá trị `outerWidth` / `outerHeight` bằng đúng cỡ khung (ứng dụng không có DevTools). Không đụng tới phép kiểm tra nào khác của game.

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
./chay-ung-dung.sh          # lần đầu tự cài Electron; thêm ./cai-ung-dung.sh để có mục trong menu ứng dụng
```

Cần môi trường đồ họa. Trong terminal của VS Code, biến `ELECTRON_RUN_AS_NODE` làm Electron chạy như Node thường; `chay-ung-dung.sh` đã bỏ biến đó.

### 3. Máy Linux không có màn hình (VPS / server)

Ứng dụng cần màn hình nên không chạy trực tiếp trên server không có giao diện đồ họa. Chạy ứng dụng trên máy có màn hình của bạn.

### 4. Cách cũ: 4 cửa sổ Chrome / Chromium riêng (`mo-4-cua-so.sh`)

Mỗi tài khoản một hồ sơ Chrome riêng chạy trang game chính thức, không có nút điều khiển. Cần `google-chrome`, `chromium` hoặc `chromium-browser`.
Hồ sơ lưu ở `~/.local/share/VolamProfiles/acc1…acc4`. Dùng ứng dụng ở trên thì không cần cách này.

### Gỡ lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `Permission denied` khi chạy `.sh` | `chmod +x chay-ung-dung.sh cai-ung-dung.sh` |
| Ứng dụng báo cổng 8800 đang bị dùng | Có bản cũ (trình duyệt / `node server.js`) đang chạy: `ss -ltnp \| grep 880` rồi tắt tiến trình đó |
| `node: not found` | Node.js chưa cài hoặc cũ hơn 18.11: xem lại mục 1 |
| Ứng dụng không mở, báo lỗi Electron | Chạy bằng `./chay-ung-dung.sh` (bỏ biến `ELECTRON_RUN_AS_NODE`); lần đầu cần mạng để tải Electron |
| Khung trắng / không tải game | Máy cần truy cập được `https://volamidle.pages.dev` (kiểm tra mạng / proxy của khung) |

## Cập nhật từ GitHub

Cần cài `git` và chạy từ bản clone (không phải tải zip); không thì tính năng này tự tắt.

- **Khi khởi động**: không tự cập nhật; dùng nút **⬆ Cập nhật** trong ứng dụng hoặc `git pull`.
- **Khi đang chạy**: máy chủ `git fetch` sau 5 giây rồi cứ 3 giờ một lần. Có commit mới thì trang quản lý hiện thanh vàng
  "Có bản mới trên GitHub", bấm **Cập nhật** để `git pull --ff-only` rồi **khởi động lại ứng dụng** (các khung giữ phiên đăng nhập), hoặc **Để sau**.
- Lệnh cập nhật chỉ nhận từ chính trang quản lý (kiểm tra header, Host và Origin), trang web khác không gọi được.
- Nút **⬆ Cập nhật** ở đầu trang: kiểm tra GitHub ngay (không cần chờ thông báo); có bản mới thì hỏi xác nhận rồi cập nhật, không thì báo "đang dùng bản mới nhất" hoặc lý do không kiểm tra được.
- Muốn cập nhật tay: `git pull` trong thư mục repo.

## Tính năng chính

- **Thêm / xóa khung**: nút **＋ Thêm khung** ở đầu trang (tối đa bằng số cổng máy chủ mở, mặc định 5) và nút **✕** ở mỗi khung. Mỗi khung giữ một phiên cố định (acc<số>) nên xóa một khung không làm mất phiên đăng nhập của khung khác. Muốn nhiều hoặc ít khung hơn: `VL_SLOTS=8 npm start`. Mỗi khung là một bản game chạy riêng nên càng nhiều khung máy càng nặng.
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
- **Hẹn giờ** (⏰ ở cột trái): tự chạy **Phó Bản → mua lệnh bài Dã Tẩu → Nhiệm Vụ → về Leo Tháp** (hoặc Luyện Công) vào các giờ trong ngày bạn chọn (tối đa 6 giờ, chọn ngày trong tuần, chọn khung áp dụng).
  Mỗi việc là một ô tích nên chỉ chạy phần bạn muốn (ví dụ chỉ mua lệnh bài rồi về Leo Tháp). Hộp thoại ghi sẵn "lần chạy kế" và có **▶ Chạy thử ngay**.
  - Đến giờ, mỗi khung đang bật và đã vào game nhận lệnh "chạy tất cả" kèm danh sách việc, agent làm tuần tự: Phó Bản, rồi về Luyện Công mua hết Lệnh Bài Dã Tẩu (KNB khóa, không hoàn tác; Kỳ Trân Các đang mở bảng khác thì thử lại vài lần),
    rồi Nhiệm Vụ, cuối cùng sang Leo Tháp. Bạn tự bấm đổi chế độ trong khung giữa chừng thì phần còn lại của lần đó bị hủy.
  - Chỉ chạy khi ứng dụng đang mở (cửa sổ thu nhỏ vẫn chạy). Khung chưa vào game (ví dụ đang tự đăng nhập lại) được thử lại trong 10 phút rồi bỏ qua lần đó. Mỗi giờ hẹn chỉ chạy một lần mỗi ngày;
    mở lại ứng dụng trong vòng 10 phút sau giờ hẹn vẫn chạy bù. Cấu hình lưu trong `localStorage` của ứng dụng (`state.sched`).
  - Chế độ lưu của khung được đặt về chế độ cuối (Leo Tháp / Luyện Công) ngay khi bắt đầu, nên khung tải lại giữa chừng sẽ về thẳng chế độ cuối chứ không chạy lại từ đầu.
- **Lưu tài khoản và tự đăng nhập lại** (nút **🔑** ở mỗi khung, chỉ trong ứng dụng desktop): nhập tên tài khoản + mật khẩu cho khung đó. Khi khung bị đưa về màn đăng nhập
  (hết phiên, bị đăng xuất, tải lại) mà không ai đang gõ phím trong vài giây, ứng dụng tự điền vào form đăng nhập của game và bấm **Đăng nhập**. **▶ Đăng nhập ngay** để đăng nhập ngay,
  ô **Tự đăng nhập lại** bật / tắt từng khung, **🗑 Xóa đã lưu** để xóa. Nút 🔑 sáng khi khung đã lưu tài khoản.
  - Mật khẩu lưu ở `credentials.json` trong thư mục dữ liệu của ứng dụng (quyền 0600), **mã hóa bằng kho khóa của hệ điều hành** (libsecret / kwallet trên Linux, Keychain, DPAPI). Máy không có kho khóa thì
    chỉ được che (base64) và hộp thoại cảnh báo. Mật khẩu **không bao giờ gửi sang trang quản lý**: trang chỉ nhận tên tài khoản và các cờ; chỉ tiến trình chính điền vào form và chỉ khi khung đang ở trang game.
  - Chống lặp: tự đăng nhập tối đa 3 lần trong 10 phút, quá thì tạm dừng 30 phút và báo (sai mật khẩu, game chặn, hoặc game tự đăng xuất ngay sau khi vào, ví dụ vượt giới hạn tài khoản mỗi máy). Ô mật khẩu đã có chữ thì không điền đè.
  - Bạn chủ động bấm **Đăng xuất** trong game cũng đưa khung về màn đăng nhập và sẽ bị tự đăng nhập lại: tắt ô **Tự đăng nhập lại** của khung đó nếu không muốn.
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

Nút **🌐** ở thanh tiêu đề của **khung thứ 5** (phiên `acc5`; các khung 1–4 không có nút này và luôn dùng IP máy): dán proxy dạng `http://user:pass@host:port` hoặc `socks5://user:pass@host:port` (bỏ `user:pass@` nếu proxy không cần đăng nhập).
Máy chủ lưu vào `quan-ly-4-acc/proxy.json` (không đưa lên GitHub; cũng đặt được bằng biến môi trường `VL_PROXY_5=socks5://host:port`), kiểm tra bằng cách so IP máy với IP qua proxy,
rồi tải lại khung. Nút 🌐 sáng lên khi khung đang dùng proxy; để trống ô nhập để tắt.

- Với khung có proxy, **toàn bộ lưu lượng của khung** (trang game, đăng nhập, dữ liệu, WebSocket, CDN) đi qua proxy, nên máy chủ game thấy IP của proxy.
  Cách làm: phiên của mỗi khung trỏ tới một cổng chuyển tiếp cục bộ (8811–8815 cho khung 1–5, chỉ nhận CONNECT tới cổng 80 / 443); cổng đó nối qua proxy của khung (HTTP hoặc SOCKS5,
  có hoặc không có mật khẩu) hoặc nối thẳng nếu khung không có proxy. Cấu hình proxy được đọc lại ở mỗi kết nối nên đổi / tự đổi proxy có hiệu lực ngay.
- **Hộp chọn proxy**: bấm 🌐 mở danh sách proxy chọn sẵn (cờ nước · proxy · độ trễ). Khi mở, app tự kiểm tra từng proxy qua chính game (sống / chết, IP + nước game thấy, thời gian phản hồi),
  xếp cái sống và nhanh lên đầu; bấm một dòng để dùng ngay (tự kiểm tra IP rồi tải lại khung 5). **✎ Nhập tay…** để dán proxy khác, **⏻ Tắt proxy** để về IP máy, **⟳ Kiểm tra lại** để thử lại cả danh sách.
  Danh sách nằm ở `quan-ly-4-acc/proxy-presets.json` (khoảng 10 proxy công cộng HK / SG / JP / VN, chọn từ nhiều lần quét vì nhanh và còn sống; **proxy miễn phí chết rất nhanh**, cái nào ✗ chết thì sửa file hoặc thêm cái mới).
  Proxy riêng của bạn (có user/pass, ví dụ Webshare) đặt trong `quan-ly-4-acc/proxy-presets.local.json` (cùng dạng `[{ "url": "http://user:pass@host:port", "country": "US" }]`, **không đưa lên GitHub**), nó được gộp vào cùng hộp chọn và mật khẩu không hiện ra trang.
- **Trạng thái kết nối** hiện ngay cạnh nút 🌐 của khung 5: `● <IP game thấy> · <thời gian phản hồi>` (xanh) khi proxy chạy tốt; `● IP trùng máy` (vàng) khi proxy chưa đổi được IP;
  `● không kết nối` / `● proxy lỗi` (đỏ) khi kiểm tra thất bại hoặc game vừa gặp lỗi qua proxy; `○ chưa đặt proxy` khi khung dùng IP máy. Rê chuột vào để xem chi tiết (proxy, IP máy, giờ kiểm tra, nội dung lỗi), bấm vào để kiểm tra lại ngay.
  App tự kiểm tra mỗi 60 giây (một yêu cầu nhỏ qua proxy) và đọc lỗi thật từ lưu lượng game mỗi 10 giây.
- Các khung 1–4 chạy như cũ. Proxy gắn với **phiên** của khung (số 5 = `acc5`), không gắn với vị trí hiển thị: xóa khung 1–4 rồi thêm lại không làm khung 5 mất proxy. Khung 5 là khung được thêm sau cùng khi 4 khung đầu còn đủ.
- **Tự đổi proxy khi proxy chết** (ô tích trong hộp 🌐, mặc định bật, nhớ ở `quan-ly-4-acc/proxy-auto.json`, không đưa lên GitHub): máy chủ cứ 30 giây kiểm tra proxy của khung
  (bỏ qua nếu vừa có lưu lượng game đi qua thành công). Proxy không trả lời 2 lần liên tiếp **và** IP máy vẫn ra mạng được (tránh đổi oan khi mất mạng) thì máy chủ thử cả danh sách
  chọn sẵn, đổi sang proxy sống **nhanh nhất, ưu tiên cùng nước** với proxy cũ, bỏ proxy đang dùng ở khung khác, rồi ghi vào `proxy.json`. Khung không cần tải lại (kết nối mới đi qua proxy mới ngay;
  kết nối WebSocket cũ đứt thì game tự nối lại). Trang quản lý báo bằng thông báo nhỏ và tooltip của nhãn trạng thái. Không còn proxy chọn sẵn nào sống thì giữ nguyên và thử lại sau 2 phút.
  Chạy ở máy chủ nên vẫn hoạt động khi bạn không mở trang quản lý. Đổi IP giữa chừng có thể làm game hỏi đăng nhập lại; không muốn thì bỏ tích ô này.
- **Proxy MTProto của Telegram (Server / Port / Secret) không dùng được**: nó chỉ chạy cho ứng dụng Telegram. Cần proxy HTTP/HTTPS hoặc SOCKS5.
- Nếu proxy hỏng và không còn proxy nào để đổi, khung đó không tải được game (không tự quay về IP máy để tránh lộ IP thật).

## Lưu ý

- Các script chỉ bấm những nút có sẵn trên giao diện game, nhưng vẫn là tự động hóa. Hãy tuân theo luật của game.
- Script đọc giao diện game theo tên phần tử hiện tại. Khi game cập nhật có thể cần chỉnh lại `agent.js`.
- Bán đồ, dùng bình và mở rương **không hoàn tác được**.

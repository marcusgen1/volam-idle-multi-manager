# Võ Lâm Idle – Quản lý 4 nhân vật

Trang quản lý chạy **4 cửa sổ game cạnh nhau trong một trang**, mỗi cửa sổ đăng nhập một tài khoản riêng,
kèm các nút tự động hóa (đổi chế độ, Boss tuần, bán đồ xanh, đóng/gửi bình Phúc Duyên…).

> Repo riêng tư. Không chứa mã của game: máy chủ cục bộ chuyển tiếp trang game từ `https://volamidle.pages.dev` lúc chạy.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `quan-ly-4-acc/` | Trang quản lý + máy chủ cục bộ (Node.js) |
| `volam-auto-quest/` | Extension Chrome nhỏ: tự vào lại Leo Tháp khi gục ngã (có nút bật/tắt) |

## Chạy trang quản lý

Cần **Node.js 18.11 trở lên**.

```bash
npm start
```

Hoặc bấm đúp `quan-ly-4-acc/chay-quan-ly.bat` (Windows). Sau đó mở <http://127.0.0.1:8800/>.

- Cổng `8800`: trang quản lý. Cổng `8801`–`8804`: bốn bản chuyển tiếp tới game, mỗi cổng là một *origin* riêng nên
  4 tài khoản có kho lưu trữ / phiên đăng nhập riêng, không đè nhau.
- Máy chủ chỉ lắng nghe `127.0.0.1` (chỉ máy bạn truy cập được).
- Điều duy nhất được thay đổi so với trang gốc: HTML của game được chèn thêm một dòng `<script src="/__agent.js">`
  (`quan-ly-4-acc/agent.js`) để trang quản lý điều khiển chế độ chơi.
- `app.html` và `agent.js` được đọc lại mỗi lần tải, nên sửa xong chỉ cần F5 / bấm ⟳ ở khung. `chay-quan-ly.bat` dùng
  `node --watch` nên sửa `server.js` máy chủ tự khởi động lại.

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

## Phương án khác: 4 cửa sổ Chrome riêng

`quan-ly-4-acc/mo-4-cua-so.bat` mở 4 cửa sổ Chrome xếp 2×2, mỗi cửa sổ một hồ sơ riêng (đăng nhập được nhớ lâu hơn).
Không dùng chung trang quản lý ở trên.

## Extension Chrome (Leo Tháp)

Vào `chrome://extensions` → bật *Developer mode* → *Load unpacked* → chọn thư mục `volam-auto-quest/`.
Bấm biểu tượng extension để bật / tắt.

## Lưu ý

- Các script chỉ bấm những nút có sẵn trên giao diện game, nhưng vẫn là tự động hóa. Hãy tuân theo luật của game.
- Script đọc giao diện game theo tên phần tử hiện tại. Khi game cập nhật có thể cần chỉnh lại `agent.js`.
- Gửi thư và bán đồ **không hoàn tác được**.

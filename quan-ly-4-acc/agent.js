// Script nhỏ được máy chủ cục bộ chèn vào trang game ở mỗi khung của trang quản lý.
// Việc duy nhất nó làm: nhận lệnh "đặt chế độ" từ trang quản lý rồi bấm đúng nút chế độ của game
// (Luyện Công / Phó Bản / Nhiệm Vụ / Leo Tháp), và báo lại chế độ hiện tại.
// Riêng Leo Tháp: nếu gục ngã và game tự về Luyện Công thì tự bấm vào lại.
// Chỉ nhận lệnh từ trang quản lý (cùng máy, cổng 8800), không gửi dữ liệu ra ngoài máy bạn.
(() => {
  if (window.__vlAgent) return;
  window.__vlAgent = true;
  if (window.parent === window) return; // mở game trực tiếp thì không làm gì

  const DASH = location.protocol + "//" + location.hostname + ":8800";
  const MODES = ["farm", "dg", "quest", "tower", "combo"];
  const POLL_MS = 500;
  const REENTER_MS = 2000; // thấy Luyện Công (do gục trong tháp) bao lâu thì vào lại Leo Tháp
  const MAX_TRIES = 3; // vào lại thất bại liên tiếp quá số lần này thì dừng
  const TOWER_MAX_DEATHS = 3; // chết liên tiếp ở Leo Tháp bấy nhiêu lần thì dừng vào lại và ở lại Luyện Công
  const TOWER_OK_MS = 180000; // ở trong tháp liên tục bấy lâu thì lần chết sau đó tính lại từ đầu (không còn "liên tiếp")

  // Nhiệm Vụ: khung Theo Dấu (kể cả tiến độ) không đổi bấy lâu thì coi là hết việc.
  // Khi hết nhiệm vụ trong ngày, game có thể vẫn để lại một dòng trong khung nên không thể chỉ dựa vào việc khung biến mất.
  const STALL_MS = 0; // 0 = tắt tín hiệu "khung Theo Dấu đứng yên" (đã bỏ theo yêu cầu)
  const IDLE_MS = 5000; // khung Theo Dấu trống liên tục bấy lâu (sau khi từng có việc) thì coi là hết việc
  const NEVER_MS = 10000; // chưa từng thấy việc: khung Theo Dấu vắng liên tục bấy lâu thì coi là hết việc
  // true: khung Theo Dấu vắng NEVER_MS là hết việc ngay cả khi chưa từng thấy nó hiện.
  // Khung Theo Dấu chỉ có khi cửa sổ game đủ rộng (bố cục 2×2); ở bố cục 4 cột nó không có,
  // nên khi game không vẽ khung đó thì script bỏ qua các tín hiệu dựa vào nó (xem trackerOk).
  const TRACKER_ALWAYS_ON = true;
  // "Chạy tất cả": lần lượt các chế độ này, xong hết thì về Luyện Công
  const COMBO = ["dg", "quest"];
  // Dòng nhật ký game ghi khi tự dời về bãi luyện công vì hết việc
  const DONE_LOG = { quest: "Hết nhiệm vụ, luyện công", dg: "Hết lượt phó bản, luyện công" };
  const TOAST_DONE = { dg: "Hết lượt phó bản" };

  let desired = null; // chế độ muốn giữ, null = không điều khiển
  let queue = []; // các việc còn lại của "Chạy tất cả" (sau việc đang làm)
  let note = ""; // lý do lần tự chuyển gần nhất (báo cho trang quản lý)
  let applied = true; // đã bấm chuyển sang desired chưa
  let tries = 0;
  let farmSince = 0;
  let towerSince = 0; // thời điểm bắt đầu thấy chế độ Leo Tháp (0 = chưa ở trong tháp)
  let towerDeaths = 0; // số lần chết liên tiếp ở Leo Tháp
  let lastSent = "";
  let lastSentAt = 0;
  let sig = ""; // nội dung khung Theo Dấu lần trước (gồm tiến độ như 14/40)
  let sigSince = 0; // nội dung đó giữ nguyên từ lúc nào
  let explicit = false; // lệnh vừa nhận là do bạn chủ động chọn (không phải khôi phục sau khi tải lại)
  let workSeen = false; // từ lúc đặt Nhiệm Vụ / Phó Bản đã thấy khung Theo Dấu có việc chưa
  let idleSince = 0; // thời điểm khung Theo Dấu bắt đầu trống
  let logBase = 0; // số dòng "hết việc" đã có sẵn trong nhật ký lúc bắt đầu

  const q = (s) => document.querySelector(s);
  const countLog = (marker) => {
    const el = q("#u20log");
    if (!el || !marker) return 0;
    return (el.textContent.match(new RegExp(marker, "g")) || []).length;
  };
  // Khung Theo Dấu có đang ghi việc của chế độ m không.
  // Nhiệm Vụ: bất kỳ dòng nào (Dã Tẩu, Sát Thủ, thuyền, phó bản) = còn việc.
  // Phó Bản: chỉ tính dòng phó bản / thuyền (dòng không có data-q). Dòng Dã Tẩu vẫn hiện khi còn nhiệm vụ nên KHÔNG được
  // coi là việc của Phó Bản, nếu không Phó Bản không bao giờ được coi là xong để chuyển sang Nhiệm Vụ.
  // Khung đang thu gọn (▸) không hiện các dòng nên không xem được: coi như còn bận.
  const trackerBusy = (m) => {
    if (!q("#u20trk .u2trh")) return false;
    if (m !== "dg") return true;
    const arrow = q("#u20trk .u2trh b");
    if (arrow && arrow.textContent.indexOf("▸") >= 0) return true;
    return !!q("#u20trk > div:not(.u2trh):not([data-q])");
  };
  // Game có vẽ khung Theo Dấu ở kích thước cửa sổ hiện tại không: phần tử phải tồn tại và cột chứa nó không bị ẩn hẳn
  const trackerOk = () => {
    const rc = q("#u20rc");
    if (!rc || !q("#u20trk")) return false;
    const cs = getComputedStyle(rc);
    return cs.display !== "none" && cs.visibility !== "hidden";
  };
  const panelSig = () => {
    const el = q("#u20trk");
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  };
  const resetWork = () => {
    towerSince = 0;
    towerDeaths = 0;
    workSeen = false;
    idleSince = 0;
    logBase = countLog(DONE_LOG[desired]);
    sig = panelSig();
    sigSince = Date.now();
  };
  // Thông báo nổi của game (hiện ~2 giây), ví dụ "Hết lượt phó bản hôm nay: luyện công"
  const toastHas = (marker) => {
    const el = q("#toast");
    return !!el && el.classList.contains("on") && el.textContent.indexOf(marker) >= 0;
  };
  const finishWork = (why) => {
    const label = desired === "quest" ? "nhiệm vụ" : "lượt phó bản";
    note = "Hết " + label + ": " + why; // hiện ở trang quản lý để biết vì sao tự chuyển
    if (queue.length) {
      // đang chạy "tất cả": sang việc kế tiếp thay vì về Luyện Công
      desired = queue.shift();
      console.log("[VL] Hết " + label + " (" + why + ") -> sang " + desired);
      applied = true;
      resetWork();
      clickMode(desired);
      report(true, true);
      return;
    }
    console.log("[VL] Hết " + label + " (" + why + ") -> về Luyện Công");
    desired = "farm";
    resetWork();
    clickMode("farm");
    report(true, true);
  };
  const curMode = () => {
    const on = q("#mswMenu [data-msw].on");
    return on ? on.dataset.msw : null;
  };
  const clickMode = (m) => {
    const b = q('#mswMenu [data-msw="' + m + '"]');
    if (!b) return false;
    b.click();
    return true;
  };
  const post = (o) => {
    try {
      window.parent.postMessage(Object.assign({ vl: 1 }, o), DASH);
    } catch (e) {}
  };

  // sync = true khi chính khung đổi lựa chọn (bạn tự bấm / bị chặn), để trang quản lý cập nhật theo
  function report(force, sync) {
    const ready = !!q("#mswMenu");
    const msg = { type: "status", mode: curMode(), ready, hero: ready ? heroName : "", lvl: ready ? readLevel() : 0, gold: ready ? readText("#gold") : "", knb: ready ? readText("#knbTop") : "", desired, next: queue[0] || null, note, boss: bossMsg, pet: petMsg, pd: pdMsg, sell: sellMsg, auto: autoSell, autoInfo: autoSell ? autoInfo : "", sync: !!sync };
    const s = JSON.stringify(msg);
    const now = Date.now();
    if (!force && s === lastSent && now - lastSentAt < 3000) return;
    lastSent = s;
    lastSentAt = now;
    post(msg);
  }

  // --- Khiêu chiến Boss tuần nếu còn lượt ---
  // Bấm nút Hoạt động > tab Boss tuần như bạn vẫn làm, bấm "Khiêu chiến" nếu nút còn sáng, rồi trả lại thẻ đang xem.
  // Nút bị khóa khi hết lượt, hoặc đang ở tháp / phó bản / trọng thương (trường hợp sau thì thử lại).
  // Tự đánh liên tiếp cho đến hết lượt: sau mỗi lần khiêu chiến chờ trận kết thúc (thời lượng đọc từ mô tả của game)
  // rồi khiêu chiến tiếp. Bấm nút Boss tuần lần nữa trong lúc đang chạy để dừng.
  const BOSS_FIGHT_DEFAULT_S = 90; // không đọc được thời lượng trận thì dùng số này
  const BOSS_BUSY_POLL_MS = 5000; // nút còn khóa (đang đánh / ở tháp / phó bản): kiểm tra lại sau bấy lâu
  const BOSS_BUSY_MAX = 60; // số lần kiểm tra lại liên tiếp tối đa trước khi bỏ cuộc (~5 phút)
  const BOSS_MAX_FIGHTS = 20; // chốt chặn an toàn
  let bossMsg = "";
  let bossRun = false;
  let bossCancel = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Chờ ms mili giây nhưng dừng sớm nếu bạn bấm dừng
  const waitCancelable = async (ms) => {
    for (let t = 0; t < ms && !bossCancel; t += 500) await wait(500);
  };
  // Thẻ đang hiển thị trong khu chính của game (id "t-log", "t-quest"...) -> tên thẻ, để trả lại sau khi xong
  const activeTab = () => {
    const el = q("#panel .tab:not(.hidden)");
    return el && el.id ? el.id.replace(/^t-/, "") : null;
  };
  const restoreTab = (prev) => {
    if (!prev || activeTab() === prev) return; // đang ở đúng thẻ rồi thì thôi (bấm lại thẻ đang mở sẽ nhảy sang thẻ khác)
    const b = q('#tabs button[data-t="' + prev + '"]');
    if (b) b.click();
  };
  async function tryBoss() {
    if (!q("#mswMenu")) return { final: true, msg: "Chưa vào game" };
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return { final: false, msg: "Đang mở cửa sổ khác" };
    const act = q("#actBtn");
    if (!act) return { final: true, msg: "Không thấy nút Hoạt động" };
    const prev = activeTab();
    act.click(); // game chuyển sang thẻ Nhiệm vụ (nút Phó bản / Tháp / Boss tuần nằm ở đó)
    await wait(250);
    const tab = q('#t-quest [data-qt="wb"]') || q('#actTabs [data-a="wb"]');
    if (!tab) {
      restoreTab(prev);
      return { final: true, msg: "Không mở được tab Boss tuần" };
    }
    const qtOn = q("#t-quest [data-qt].on");
    const prevQt = qtOn ? qtOn.dataset.qt : null; // mục đang chọn trong thẻ Nhiệm vụ, trả lại sau khi xong
    const restore = () => {
      if (prevQt && prevQt !== "wb") {
        const b = q('#t-quest [data-qt="' + prevQt + '"]');
        if (b) b.click();
      }
      restoreTab(prev);
    };
    tab.click();
    await wait(250);
    const go = q("#t-quest #wbGo") || q("#wbGo");
    if (!go) {
      restore();
      return { final: true, msg: "Không thấy nút khiêu chiến" };
    }
    const label = go.textContent.trim();
    // Mô tả của game có "N lượt / tuần, mỗi lượt M giây" và dòng "Lượt còn a/b"
    const text = (q("#t-quest") || {}).textContent || "";
    const secM = text.match(/mỗi lượt\s*(\d+)\s*giây/);
    const leftM = text.match(/Lượt còn\s*(\d+)\s*\/\s*(\d+)/);
    const fightSec = secM ? +secM[1] : BOSS_FIGHT_DEFAULT_S;
    const left = leftM ? +leftM[1] : null;
    if (go.disabled) {
      restore();
      if (/Hết lượt/.test(label)) return { final: true, msg: "hết lượt tuần này" };
      if (/Cần cấp/.test(label)) return { final: true, msg: label };
      return { final: false, msg: "đang đánh / ở tháp / phó bản / trọng thương", left };
    }
    go.click();
    await wait(150);
    restore();
    return { ok: true, left, fightSec };
  }
  async function runBoss() {
    if (bossRun) {
      bossCancel = true; // bấm lần nữa = dừng
      return;
    }
    bossRun = true;
    bossCancel = false;
    let fights = 0;
    let busy = 0;
    bossMsg = "Boss tuần: đang bắt đầu…";
    report(true);
    try {
      while (!bossCancel) {
        const r = await tryBoss();
        if (r.ok) {
          fights++;
          busy = 0;
          bossMsg =
            "Boss tuần: đã đánh " + fights + " lượt" + (r.left != null ? " · còn " + Math.max(0, r.left - 1) : "") + "…";
          report(true);
          if (fights >= BOSS_MAX_FIGHTS) {
            bossMsg = "Boss tuần: đã đánh " + fights + " lượt (dừng ở giới hạn an toàn)";
            break;
          }
          await waitCancelable((r.fightSec + 3) * 1000); // chờ trận kết thúc rồi kiểm tra lượt còn
          continue;
        }
        if (r.final) {
          bossMsg = "Boss tuần: " + (fights ? "đã đánh " + fights + " lượt · " : "") + r.msg;
          break;
        }
        busy++;
        bossMsg = "Boss tuần: " + (fights ? "đã đánh " + fights + " lượt · " : "") + "chờ (" + r.msg + ") " + busy + "/" + BOSS_BUSY_MAX;
        report(true);
        if (busy >= BOSS_BUSY_MAX) {
          bossMsg = "Boss tuần: " + (fights ? "đã đánh " + fights + " lượt · " : "") + "dừng vì nút khiêu chiến bị khóa quá lâu";
          break;
        }
        await waitCancelable(BOSS_BUSY_POLL_MS);
      }
      if (bossCancel) bossMsg = "Boss tuần: đã dừng" + (fights ? " sau " + fights + " lượt" : "");
    } catch (err) {
      bossMsg = "Boss tuần: lỗi " + (err && err.message ? err.message : err);
    } finally {
      bossRun = false;
      bossCancel = false;
      report(true);
    }
  }

  // --- Phúc Duyên: đóng bình / dùng hết bình trong hành trang / mở hết rương trong Phần thưởng ---
  // Bấm đúng các nút có sẵn trong cửa sổ "Bình Phúc Duyên Lộ" và 🎁 Phần thưởng của game.
  let pdMsg = "";
  let pdRun = false;
  const qa = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const waitFor = async (fn, ms) => {
    for (let t = 0; t <= ms; t += 100) {
      const v = fn();
      if (v) return v;
      await wait(100);
    }
    return null;
  };
  const toastText = () => {
    const el = q("#toast");
    return el ? el.textContent.trim() : "";
  };
  const digits = (s) => +String(s || "").replace(/\D/g, "") || 0;
  // Số bình mỗi loại (1 = Tiểu, 2 = Trung, 3 = Đại): lấy từ nút "Dùng hết" (nút cuối của hàng, data-n là số bình thật).
  // Nút "Dùng 1" đứng trước luôn có data-n = 1 nên không dùng nó.
  const bottleCount = (i) => {
    const btns = qa('#pdlBox [data-pu="' + i + '"]');
    return btns.length ? +btns[btns.length - 1].dataset.n || 0 : 0;
  };
  const pdlSummary = () => "bình Tiểu " + bottleCount(1) + " · Trung " + bottleCount(2) + " · Đại " + bottleCount(3);
  const closePdl = () => {
    const x = q("#pdX");
    if (x) x.click();
  };
  async function openPdl() {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (q("#pdlBox")) return "";
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return "đang mở cửa sổ khác, thử lại sau";
    // Game mở cửa sổ Bình Phúc Duyên Lộ khi bấm vào bất kỳ phần tử có thuộc tính data-pdl-open
    const el = document.createElement("span");
    el.setAttribute("data-pdl-open", "1");
    document.body.appendChild(el);
    el.click();
    el.remove();
    const ok = await waitFor(() => q("#pdlBox"), 5000);
    if (!ok) return toastText() || "không mở được cửa sổ Bình Phúc Duyên Lộ (cần đăng nhập máy chủ)";
    return "";
  }
  async function refreshPdl() {
    const b = q("#pdRe");
    if (b) {
      b.click();
      await wait(900);
    }
  }

  async function pdDong() {
    const err = await openPdl();
    if (err) return err;
    await refreshPdl();
    const btn = q("#pdDong0");
    if (!btn) return "không thấy nút Đóng hết";
    if (btn.disabled) {
      const s = pdlSummary();
      closePdl();
      return "chưa đủ Phúc Duyên chờ đóng (cần từ 10) · " + s;
    }
    const before = pdlSummary();
    btn.click();
    await wait(1500);
    await refreshPdl();
    const after = pdlSummary();
    closePdl();
    return "đã đóng · trước: " + before + " → sau: " + after;
  }

  const closeModalBtn = () => {
    const c = q("#mClose");
    if (c) c.click();
  };

  // Dùng hết bình Phúc Duyên Lộ trong hành trang. Cửa sổ "Bình Phúc Duyên Lộ" có sẵn nút [Dùng hết] cho từng loại bình
  // (nút cuối của hàng); riêng khi chỉ còn 1 bình thì nút đó bị khóa, nên bấm nút [Dùng 1]. Bình Đại dùng trước.
  // Mỗi vòng bấm xong cả 3 loại rồi tải lại số bình; còn bình (nút còn bận) thì vòng sau bấm tiếp, tối đa 5 vòng.
  async function pdDung() {
    const err = await openPdl();
    if (err) return err;
    await refreshPdl();
    const total = () => bottleCount(1) + bottleCount(2) + bottleCount(3);
    const before = pdlSummary();
    if (!total()) {
      closePdl();
      return "hành trang không có bình Phúc Duyên Lộ nào";
    }
    for (let round = 0; round < 5 && total(); round++) {
      for (const kind of [3, 2, 1]) {
        const btns = qa('#pdlBox [data-pu="' + kind + '"]').filter((b) => !b.disabled);
        const btn = btns[btns.length - 1];
        if (!btn) continue;
        btn.click();
        await wait(1500);
      }
      await refreshPdl();
    }
    const after = pdlSummary();
    closePdl();
    return (total() ? "chưa dùng hết · " : "đã dùng · ") + "trước: " + before + " → sau: " + after;
  }

  // Mở hết rương Phúc Duyên: 🎁 Phần thưởng > Phúc Duyên > [Mở hết (N)] (mỗi rương 10 điểm). Có đúng 1 rương thì
  // nút [Mở hết] bị khóa nên bấm [Mở ×1]. Mở nhiều rương thì game hiện cửa sổ kết quả (có nút Quay lại), đọc tóm tắt từ đó.
  async function pdMo() {
    if (!q("#mswMenu")) return "Chưa vào game";
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return "đang mở cửa sổ khác, thử lại sau";
    const gift = q("#giftBtn");
    if (!gift) return "không thấy nút Phần thưởng";
    gift.click();
    const tab = await waitFor(() => q('#giftTabs [data-g="chest"]'), 5000);
    if (!tab) {
      closeModalBtn();
      return "không mở được cửa sổ Phần thưởng";
    }
    tab.click();
    await wait(400);
    const all = q('#mBody [data-ch="999999"]');
    const one = q("#gChest");
    const body = q("#mBody");
    const fd = (body && body.textContent.match(/Điểm Phúc Duyên:\s*(\d+)/)) || [];
    let out;
    if (all && !all.disabled) {
      const n = digits((all.textContent.match(/\((\d+)\)/) || [])[1]);
      all.click();
      const done = await waitFor(() => q("#cBack"), 20000);
      const card = q("#mBody .card.stats");
      const sum = card ? Array.from(card.children).reduce((a, el, i) => a + (i % 2 ? " " : (a ? " · " : "")) + el.textContent.trim(), "") : "";
      out = done ? "đã mở " + n + " rương" + (sum ? " · " + sum : "") : toastText() || "không rõ kết quả (kiểm tra lại trong game)";
    } else if (one && !one.disabled) {
      one.click();
      await wait(1500);
      out = "đã mở 1 rương" + (toastText() ? " · " + toastText() : "");
    } else {
      out = "chưa đủ Phúc Duyên để mở rương (cần từ 10" + (fd[1] ? ", đang có " + fd[1] : "") + ")";
    }
    closeModalBtn();
    return out;
  }
  const PD_NAME = { dong: "Đóng bình Phúc Duyên", dung: "Dùng hết bình Phúc Duyên", mo: "Mở hết rương Phúc Duyên" };
  const PD_RUN = { dong: pdDong, dung: pdDung, mo: pdMo };
  async function runPd(kind) {
    if (pdRun) return;
    pdRun = true;
    pdMsg = PD_NAME[kind] + ": đang chạy…";
    report(true);
    try {
      const r = await PD_RUN[kind]();
      pdMsg = PD_NAME[kind] + ": " + r;
    } catch (err) {
      pdMsg = "Phúc Duyên: lỗi " + (err && err.message ? err.message : err);
    } finally {
      pdRun = false;
      report(true);
    }
  }

  // --- Bắt thú: đi tìm những loài thú chưa có trong Thú điển ---
  // Thú không bắt bằng nút mà rơi ngẫu nhiên khi hạ quái là thú ngoài bãi luyện công (thường 0,1% · tinh anh 1% · trùm 8%),
  // nên "đi bắt" = đứng ở bãi có loài còn thiếu và luyện công. Mỗi vòng: đọc Thú điển (cửa sổ Đồng hành > Thú điển, ô mờ
  // "???" là loài chưa có), tra loài nào ở bãi nào bằng window.JX_FEED.pets của game, chọn bãi mở được có nhiều loài thiếu
  // nhất, chuyển tới đó (Bản đồ luyện công), rồi chờ cho đến khi nhật ký game báo có loài mới (hoặc mỗi vài phút) để tính lại.
  // Dừng khi đủ Thú điển, khi các loài còn thiếu đều ở bãi chưa mở / chưa đủ cấp, hoặc khi bạn bấm nút lần nữa.
  const PET_RECHECK_MS = 180000; // không có tin gì mới thì vẫn đọc lại Thú điển sau bấy lâu
  const PET_LOG_MARK = "Thú điển"; // dòng nhật ký khi có loài mới: "… loài mới trong Thú điển" / "(ghi vào Thú điển)"
  let petMsg = "";
  let petRun = false;
  let petCancel = false;
  let petUi = false; // đang mở cửa sổ game để đọc / chọn: các việc nền khác nhường
  const waitPet = async (ms) => {
    for (let t = 0; t < ms && !petCancel; t += 500) await wait(500);
  };
  const modalOpen = () => {
    const m = q("#modal");
    return !!m && !m.classList.contains("hidden");
  };
  // Đọc Thú điển: trả về { total, got, missing: [chỉ số loài thiếu] } hoặc { err }. Thứ tự ô = thứ tự JX_FEED.pets.
  async function petReadDex() {
    if (!q("#mswMenu")) return { err: "chưa vào game" };
    for (let n = 0; n < 60 && modalOpen() && !petCancel; n++) await wait(1000); // bạn đang dùng một cửa sổ: chờ
    if (petCancel) return { err: "đã dừng" };
    if (modalOpen()) return { err: "đang mở cửa sổ khác quá lâu" };
    petUi = true;
    try {
      const btn = q("#u20pet");
      if (!btn) return { err: "không thấy nút Đồng hành" };
      btn.click();
      const tab = await waitFor(() => q('.ptabs [data-ptab="dex"]'), 5000);
      if (!tab) {
        closeModalBtn();
        return { err: "không mở được Đồng hành (chưa mở khóa hoặc cần đăng nhập)" };
      }
      tab.click();
      await wait(400);
      const cells = qa("#mBody .pdx:not(.rare)");
      closeModalBtn();
      const pets = (window.JX_FEED && window.JX_FEED.pets) || [];
      if (!cells.length) return { err: "không đọc được Thú điển" };
      if (cells.length !== pets.length) return { err: "danh sách thú của game (" + pets.length + ") lệch Thú điển (" + cells.length + ")" };
      const missing = [];
      cells.forEach((el, i) => el.classList.contains("off") && missing.push(i));
      return { total: cells.length, got: cells.length - missing.length, missing };
    } finally {
      petUi = false;
    }
  }
  // Danh sách bãi luyện công trong giao diện: tên bãi -> { row, alt, locked }. Bãi có nhiều bản đồ thì mỗi bản đồ là một nút nhỏ
  // (data-za="chỉ số bãi:số bản đồ") đứng sau hàng của bãi; chưa mở bãi thì hàng bị khóa.
  const readZones = () => {
    const zones = new Map();
    qa(".zrow[data-z]").forEach((row) => {
      const c = row.dataset.z;
      const next = row.nextElementSibling;
      const chips = next && next.classList.contains("zalt") ? qa('.zalt [data-za^="' + c + ':"]').filter((b) => next.contains(b)) : [];
      const add = (name, alt) => {
        name = String(name || "").replace(/^[^\p{L}\p{N}]+/u, "").trim(); // bỏ biểu tượng đứng trước tên (bố cục khác của game)
        if (name && !zones.has(name)) zones.set(name, { c, alt, locked: row.disabled });
      };
      if (chips.length) chips.forEach((b) => add(b.textContent, b.dataset.za));
      else add((row.querySelector("b") || {}).textContent, null);
    });
    return zones;
  };
  async function getZones() {
    let z = readZones();
    if (z.size) return z;
    const prev = activeTab();
    const tab = q('#tabs button[data-t="log"]');
    if (tab) {
      tab.click();
      await wait(500);
      z = readZones();
      restoreTab(prev);
    }
    return z;
  }
  // Đang đứng ở bãi/bản đồ này không: hàng của bãi có lớp "cur", nút bản đồ có lớp "on". Không thấy danh sách thì xem nhãn bãi.
  const zoneHere = (z, name) => {
    const cur = q(".zrow.cur");
    if (!cur) {
      const lbl = q("#stageLbl");
      return !!lbl && lbl.textContent.indexOf(name) >= 0;
    }
    if (cur.dataset.z !== z.c) return false;
    if (!z.alt) return true;
    const chip = q('[data-za="' + z.alt + '"]');
    return !!chip && chip.classList.contains("on");
  };
  // Chọn bãi: bấm hàng của bãi rồi (nếu có nhiều bản đồ) nút bản đồ. Giao diện được vẽ lại sau mỗi lần bấm nên tìm lại nút.
  async function goZone(name) {
    const z = (await getZones()).get(name);
    if (!z || z.locked) return false;
    if (zoneHere(z, name)) return true; // đang đứng ở đó
    const row = q('.zrow[data-z="' + z.c + '"]');
    if (!row) return false;
    row.click();
    await wait(500);
    if (z.alt) {
      const chip = q('[data-za="' + z.alt + '"]');
      if (chip) {
        chip.click();
        await wait(500);
      }
    }
    return zoneHere(z, name);
  }
  // Chọn bãi có nhiều loài thiếu nhất trong số bãi đã mở. Trả về { name, n } hoặc { none: số loài chưa tới được }
  async function petPlan(missing) {
    const pets = window.JX_FEED.pets;
    const zones = await getZones();
    if (!zones.size) return { err: "không thấy danh sách Bản đồ luyện công (thử mở thẻ Màn chơi)" };
    const score = new Map(); // tên bãi -> số loài thiếu có ở đó
    let reachable = 0;
    for (const idx of missing) {
      let ok = false;
      for (const raw of pets[idx][2] || []) {
        const name = String(raw).replace(/\s*\(\d+\s*-\s*\d+\)\s*$/, "").trim();
        const z = zones.get(name);
        if (!z || z.locked) continue;
        ok = true;
        score.set(name, (score.get(name) || 0) + 1);
      }
      if (ok) reachable++;
    }
    if (!score.size) return { none: missing.length };
    let best = null;
    for (const [name, n] of score) {
      const here = zoneHere(zones.get(name), name);
      if (!best || n > best.n || (n === best.n && here)) best = { name, n, here };
    }
    return { name: best.name, n: best.n, reachable, left: missing.length - reachable };
  }
  async function runPet() {
    if (petRun) {
      petCancel = true; // bấm lần nữa = dừng
      return;
    }
    petRun = true;
    petCancel = false;
    petMsg = "Bắt thú: đang đọc Thú điển…";
    // Đứng ở chế độ Luyện Công (chọn bãi cũng tự chuyển về đó); các chế độ khác sẽ làm hỏng việc chọn bãi
    queue = [];
    desired = "farm";
    applied = false;
    report(true, true);
    try {
      while (!petCancel) {
        const dex = await petReadDex();
        if (dex.err) {
          petMsg = "Bắt thú: " + dex.err;
          break;
        }
        if (!dex.missing.length) {
          petMsg = "Bắt thú: đã đủ Thú điển (" + dex.got + "/" + dex.total + " loài)";
          break;
        }
        const plan = await petPlan(dex.missing);
        if (plan.err) {
          petMsg = "Bắt thú: " + plan.err;
          break;
        }
        if (plan.none) {
          petMsg = "Bắt thú: còn " + plan.none + " loài thiếu đều ở bãi chưa mở / chưa đủ cấp (đã có " + dex.got + "/" + dex.total + ")";
          break;
        }
        if (!(await goZone(plan.name))) {
          petMsg = "Bắt thú: không chuyển được tới bãi " + plan.name;
          break;
        }
        const info = "đã có " + dex.got + "/" + dex.total + " · " + plan.name + " (" + plan.n + " loài thiếu)" + (plan.left ? " · " + plan.left + " loài ở bãi chưa mở" : "");
        petMsg = "Bắt thú: " + info;
        report(true);
        const base = countLog(PET_LOG_MARK);
        const t0 = Date.now();
        while (!petCancel && Date.now() - t0 < PET_RECHECK_MS && countLog(PET_LOG_MARK) === base) {
          await wait(1000);
          if (!q("#mswMenu")) {
            petMsg = "Bắt thú: mất kết nối game, đã dừng";
            petCancel = true;
          }
        }
      }
      if (petCancel && !/mất kết nối/.test(petMsg)) petMsg = "Bắt thú: đã dừng";
    } catch (err) {
      petMsg = "Bắt thú: lỗi " + (err && err.message ? err.message : err);
    } finally {
      petRun = false;
      petCancel = false;
      petUi = false;
      report(true);
    }
  }

  // --- Bán đồ xanh trong Hành trang (thủ công + tự động khi hành trang đầy) ---
  // Dùng đúng màn "🧹 Dọn kho" của game: chỉ bật "Bán đồ xanh" ở Hành trang, bấm "Dọn ngay". Game tự giữ lại món khóa 🔒,
  // đồ đang mặc / tốt hơn đồ đang mặc, đồ cần cho Dã Tẩu, đồ trong Rương Chứa Đồ và đồ xanh bạn đã đặt "giữ" (Trợ Thủ › Nhặt đồ).
  const AUTO_SELL_POLL_MS = 30000; // bao lâu kiểm tra hành trang một lần khi bật tự bán
  const AUTO_SELL_MARGIN = 1; // coi là đầy khi số món >= tối đa - số này
  const AUTO_SELL_COOLDOWN_MS = 300000; // lần trước không bán được gì thì chờ bấy lâu mới thử lại
  const DK_KEYS = ["inv", "box", "jew", "white", "blue", "gold", "vio"];
  const DK_WANT = { inv: true, box: false, jew: false, white: false, blue: true, gold: false, vio: false };
  let sellMsg = "";
  let sellRun = false;
  let autoSell = false;
  let autoSellKept = false; // tự bán có gồm cả đồ xanh game đang giữ không
  let autoInfo = ""; // trạng thái kiểm tra hành trang gần nhất của chế độ tự bán
  let autoSellLast = 0;

  // Đọc số món trong hành trang ("57/60") bằng cách chuyển sang thẻ Hành trang rồi trả lại ngay (không có chỗ chờ nên không nháy)
  // Số ô nằm ở chỗ khác nhau tùy bố cục: ".invbar span" (bố cục cũ) hoặc ".u2bh span" (bố cục mới, game dựng lại màn Hành trang).
  const readInvCount = () => {
    for (const el of qa("#t-inv .invbar span, #t-inv .u2bh span")) {
      const m = el.textContent.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (m) return { n: +m[1], max: +m[2] };
    }
    return null;
  };
  const peekInv = () => {
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return { err: "không thấy thẻ Hành trang" };
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    const c = readInvCount();
    if (prev !== "inv") restoreTab(prev);
    return c || { err: "không đọc được số ô hành trang" };
  };
  const dkEl = (k) => q('#mBody [data-dk="' + k + '"]');
  // Mỗi lần đổi một ô, game vẽ lại cả cửa sổ nên phải tìm lại phần tử sau mỗi lần
  async function dkSet(k, want) {
    const el = dkEl(k);
    if (!el || el.checked === want) return;
    el.checked = want;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(60);
  }
  async function dkSetLv(v) {
    const s = q("#dkLv");
    if (!s || s.value === String(v)) return;
    s.value = String(v);
    s.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(60);
  }
  const isBlueTile = (el) => el.classList.contains("r1") && !el.querySelector(".lk");
  const blueTiles = () => qa("#t-inv .invgrid .it").filter(isBlueTile);
  const closeAnyModal = () => {
    const c = q("#mClose");
    if (c) c.click();
  };
  // Bán lẻ từng món xanh còn lại (kể cả món game đang "giữ"): bấm vào ô để mở chi tiết món, [Bán], rồi xác nhận.
  // Bỏ qua món khóa 🔒 hoặc đang giữ để nộp Dã Tẩu 📜 (ô có biểu tượng khóa).
  async function sellBlueTiles() {
    let sold = 0;
    const tried = new Set();
    for (let guard = 0; guard < 120; guard++) {
      const tile = blueTiles().find((el) => !tried.has(el.dataset.uid));
      if (!tile) break;
      tried.add(tile.dataset.uid);
      tile.click();
      const btn = await waitFor(() => q("#bSell"), 2000);
      if (!btn || btn.disabled) {
        closeAnyModal();
        await wait(60);
        continue;
      }
      btn.click();
      const ask = await waitFor(() => q("#askBox"), 2000);
      if (!ask) {
        closeAnyModal();
        break;
      }
      const yes = ask.querySelector('[data-a="1"]');
      if (yes) yes.click();
      if (await waitFor(() => !tile.isConnected, 2500)) sold++;
      await wait(60);
    }
    return sold;
  }
  async function sellBlue(kept) {
    if (!q("#mswMenu")) return { sold: 0, msg: "Chưa vào game" };
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return { sold: 0, msg: "đang mở cửa sổ khác, thử lại sau" };
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return { sold: 0, msg: "không thấy thẻ Hành trang" };
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    await wait(150);
    const blueBefore = blueTiles().length; // số ô xanh (chưa khóa) đang có trong hành trang
    let bulk = 0;
    let goldTxt = "";
    let err = "";
    try {
      const don = q("#bDonKho");
      if (!don) {
        err = "không thấy nút Dọn kho";
      } else {
        don.click();
        if (!(await waitFor(() => q("#dkGo"), 3000))) {
          err = "không mở được màn Dọn kho";
        } else {
          // Ghi nhớ lựa chọn cũ của bạn trong màn Dọn kho để trả lại sau
          const init = {};
          DK_KEYS.forEach((k) => {
            const el = dkEl(k);
            init[k] = el ? el.checked : null;
          });
          const lvEl = q("#dkLv");
          const initLv = lvEl ? lvEl.value : null;
          try {
            for (const k of DK_KEYS) await dkSet(k, DK_WANT[k]);
            await dkSetLv(10);
            const sum = q("#mBody .dk-sum b");
            bulk = sum ? digits(sum.textContent) : 0;
            if (bulk > 0) {
              const gold = q("#mBody .dk-sum b.gold");
              goldTxt = gold ? gold.textContent.trim() : "";
              q("#dkGo").click();
              await wait(400);
            }
          } finally {
            for (const k of DK_KEYS) if (init[k] !== null) await dkSet(k, init[k]);
            if (initLv !== null) await dkSetLv(initLv);
            const no = q("#dkNo");
            if (no) no.click();
            else closeAnyModal();
          }
        }
      }
      // Tùy chọn: bán nốt các món xanh game đang giữ (khớp luật giữ / mạnh hơn đồ đang mặc)
      let single = 0;
      if (kept && !err) {
        await wait(150);
        single = await sellBlueTiles();
      }
      const left = blueTiles().length;
      const total = bulk + single;
      let msg;
      if (err) msg = err;
      else if (total > 0)
        msg = "đã bán " + total + " món đồ xanh" + (bulk && goldTxt ? " (Dọn kho " + bulk + " món, " + goldTxt + " lượng)" : "") +
          (single ? " · bán lẻ " + single + " món đang được giữ" : "");
      else if (left > 0)
        msg = "Dọn kho không có món nào để bán, nhưng còn " + left + " ô xanh trong hành trang: game đang GIỮ chúng (khớp luật giữ / mạnh hơn đồ đang mặc). " +
          "Bật ô \"gồm cả đồ được giữ\" nếu muốn bán.";
      else msg = "không có đồ xanh nào để bán";
      if (total > 0 && left > 0) msg += " · còn " + left + " ô xanh (game đang giữ)";
      return { sold: total, msg, kept: left };
    } finally {
      restoreTab(prev);
    }
  }
  async function runSell(auto, kept) {
    if (sellRun) return { sold: 0 };
    sellRun = true;
    sellMsg = (auto ? "Tự bán đồ xanh" : "Bán đồ xanh") + ": đang bán…";
    report(true);
    let r = { sold: 0 };
    try {
      r = await sellBlue(!!kept);
      sellMsg = (auto ? "Tự bán đồ xanh: " : "Bán đồ xanh: ") + r.msg;
    } catch (err) {
      sellMsg = "Bán đồ xanh: lỗi " + (err && err.message ? err.message : err);
    } finally {
      sellRun = false;
      report(true);
    }
    return r;
  }
  async function autoSellTick() {
    if (!autoSell || sellRun || bossRun || pdRun || petUi) return;
    if (!q("#mswMenu")) return;
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return; // bạn đang dùng một cửa sổ
    if (autoSellLast && Date.now() - autoSellLast < AUTO_SELL_COOLDOWN_MS) return;
    const c = peekInv();
    const info = c.err ? "Tự bán: " + c.err : "Tự bán: hành trang " + c.n + "/" + c.max + (c.n >= c.max - AUTO_SELL_MARGIN ? " (đầy)" : " (chưa đầy)");
    if (info !== autoInfo) {
      autoInfo = info; // hiện trong chú thích của dòng trạng thái để biết chức năng có đang chạy không
      report(true);
    }
    if (c.err || c.n < c.max - AUTO_SELL_MARGIN) return;
    const r = await runSell(true, autoSellKept);
    autoSellLast = r.sold > 0 ? 0 : Date.now(); // bán được thì lần sau đầy lại bán tiếp; không có gì để bán thì nghỉ một lúc
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || e.origin !== DASH) return;
    const m = e.data;
    if (m && m.vl === 1 && m.type === "boss") {
      runBoss();
      return;
    }
    if (m && m.vl === 1 && m.type === "pet") {
      runPet();
      return;
    }
    if (m && m.vl === 1 && m.type === "sell") {
      runSell(false, !!m.kept);
      return;
    }
    if (m && m.vl === 1 && m.type === "autoSell") {
      autoSell = !!m.on;
      autoSellKept = !!m.kept;
      autoSellLast = 0;
      autoInfo = "";
      report(true);
      if (autoSell) autoSellTick().catch(() => {}); // kiểm tra ngay khi vừa bật, không phải chờ 30 giây
      return;
    }
    if (m && m.vl === 1 && m.type === "pd") {
      if (PD_RUN[m.kind]) runPd(m.kind);
      return;
    }
    if (!m || m.vl !== 1 || m.type !== "setMode") return;
    if (m.mode !== null && !MODES.includes(m.mode)) return;
    if (petRun && !m.restore && m.mode !== "farm") petCancel = true; // bạn chọn chế độ khác: dừng đi bắt thú
    queue = [];
    note = "";
    if (m.mode === "combo") {
      queue = COMBO.slice(1);
      desired = COMBO[0];
    } else {
      desired = m.mode;
    }
    explicit = !m.restore; // restore = trang quản lý khôi phục lựa chọn cũ sau khi tải lại khung
    applied = m.mode === null;
    tries = 0;
    farmSince = 0;
    resetWork();
    tick();
  });

  // Bạn tự bấm đổi chế độ trong khung (click thật) -> theo lựa chọn của bạn, không giằng co
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || !e.target.closest) return;
      const b = e.target.closest("#mswMenu [data-msw], [data-mode]");
      if (!b) return;
      desired = b.dataset.msw || b.dataset.mode;
      queue = [];
      note = "";
      applied = true;
      tries = 0;
      farmSince = 0;
      resetWork();
      setTimeout(() => report(true, true), 300);
    },
    true
  );

  // --- Tên nhân vật + cấp độ (để trang quản lý hiện làm tên khung) ---
  // Cấp độ: phần tử #lv luôn có trên màn hình. Tên nhân vật game không hiện cố định (ô "heroName" là tên phái),
  // chỉ có trong thẻ Nhân vật (".u2nm", kèm nút bút chì ✎) nên đọc từ đó rồi nhớ lại. Chỉ đọc một lần sau khi đăng nhập xong.
  // Dự phòng: dòng "Tên · cấp N" của menu Hệ Thống. Nhân vật chưa đặt tên thì game hiện tên phái ở chỗ đó.
  const HERO_RETRY_MS = 20000; // chưa đọc được thì thử lại sau bấy lâu
  const HERO_MAX_TRIES = 5; // số lần đọc tối đa cho mỗi lần đăng nhập (tên không đọc được thì thôi, không bấm mãi)
  let heroName = "";
  let heroAt = 0;
  let heroTries = 0;
  // Ngân lượng / Kim Nguyên Bảo: đọc đúng chữ game đang hiển thị ở thanh trên (đã rút gọn sẵn, ví dụ "1,2tr")
  const readText = (sel) => {
    const el = q(sel);
    return el ? el.textContent.trim() : "";
  };
  const readLevel = () => {
    const el = q("#lv");
    const n = el ? parseInt(el.textContent, 10) : NaN;
    return n > 0 ? n : 0;
  };
  // Chuyển sang thẻ khác, đọc, trả lại thẻ cũ ngay trong một lần chạy (không có chỗ chờ nên không nháy)
  const readFromTab = (tabName, read) => {
    const tab = q('#tabs button[data-t="' + tabName + '"]');
    if (!tab) return "";
    const prev = activeTab();
    if (prev !== tabName) tab.click();
    let out = "";
    try {
      out = read() || "";
    } finally {
      restoreTab(prev);
    }
    return out;
  };
  const peekHeroName = () => {
    heroAt = Date.now();
    heroTries++;
    let name = readFromTab("char", () => {
      const el = q("#t-char .u2nm");
      if (!el) return "";
      const c = el.cloneNode(true);
      c.querySelectorAll("button").forEach((b) => b.remove()); // bỏ nút bút chì ✎
      return c.textContent.replace(/\s+/g, " ").trim();
    });
    if (!name) {
      name = readFromTab("more", () => {
        const el = q("#t-more .escm-who");
        const m = el && el.textContent.match(/^\s*(.+?)\s·\scấp\s\d+/);
        return m ? m[1].trim() : "";
      });
    }
    if (name) heroName = name;
  };
  const heroTick = () => {
    if (heroName || heroTries >= HERO_MAX_TRIES) return; // đã đọc rồi (hoặc bỏ cuộc): không đụng vào game nữa
    if (sellRun || bossRun || pdRun || petUi) return;
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return; // bạn đang dùng một cửa sổ
    if (Date.now() - heroAt >= HERO_RETRY_MS) peekHeroName();
  };

  function tick() {
    if (!q("#mswMenu")) {
      // Chưa đăng nhập / đã đăng xuất: quên tên cũ để lần đăng nhập sau (có thể là nhân vật khác) đọc lại
      heroName = "";
      heroAt = 0;
      heroTries = 0;
      report(false);
      return;
    }
    heroTick();
    const mode = curMode();

    if (desired && !applied) {
      applied = true;
      resetWork();
      const busy = trackerBusy(desired);
      if (mode !== desired) {
        clickMode(desired);
      } else if (explicit && !busy && (desired === "quest" || desired === "dg")) {
        // Game đang ở sẵn chế độ này nên bấm lại không có tác dụng. Bạn vừa chủ động chọn, mà không thấy
        // đang có việc, nên bấm qua Luyện Công rồi quay lại để game tự kiểm tra lại (hết lượt thì báo ngay).
        clickMode("farm");
        clickMode(desired);
      }
      explicit = false;
      if (desired === "dg" && toastHas(TOAST_DONE.dg)) finishWork("thông báo hết lượt");
    } else if ((desired === "quest" || desired === "dg") && mode === desired) {
      // Game giữ nhãn Nhiệm Vụ / Phó Bản dù đã hết việc (chỉ dời bãi). Nhận biết hết việc để tự về Luyện Công.
      const busy = trackerBusy(desired); // khung Theo Dấu còn ghi việc của chế độ này không
      const now = Date.now();
      let done = false;
      let why = "";
      if (desired === "dg" && toastHas(TOAST_DONE.dg)) {
        done = true;
        why = "thông báo hết lượt";
      }
      const cur = panelSig();
      if (!trackerOk()) {
        // Khung quá hẹp: game không vẽ khung Theo Dấu, không thể biết còn việc hay không -> không tự về Luyện Công
        // (trừ khi có thông báo / nhật ký báo hết việc bên dưới).
        if (!note) note = "Khung hẹp (bố cục 4 cột): không đọc được khung Theo Dấu nên không tự về Luyện Công";
        workSeen = false;
        idleSince = 0;
        sig = cur;
        sigSince = now;
      } else if (cur !== sig) {
        sig = cur;
        sigSince = now;
      } else if (STALL_MS > 0 && desired === "quest" && workSeen && now - sigSince >= STALL_MS) {
        done = true;
        why = "nhiệm vụ không tiến triển " + Math.round(STALL_MS / 1000) + " giây";
      }
      if (!trackerOk()) {
        // bỏ qua
      } else if (busy) {
        workSeen = true;
        idleSince = 0;
      } else {
        // Khung Theo Dấu không còn = hết việc. Chưa từng thấy việc (ví dụ nhiệm vụ trong ngày đã hết sẵn)
        // thì chờ lâu hơn một chút để game kịp hiện khung, và chỉ áp dụng khi bạn để "Theo dõi NV" luôn bật.
        if (!idleSince) idleSince = now;
        const limit = workSeen ? IDLE_MS : TRACKER_ALWAYS_ON ? NEVER_MS : Infinity;
        if (now - idleSince >= limit) {
          done = true;
          why = workSeen ? "khung Theo Dấu hết việc" : "khung Theo Dấu không có việc";
        }
      }
      const c = countLog(DONE_LOG[desired]);
      if (c > logBase) {
        done = true;
        why = "nhật ký báo hết việc";
      }
      if (c < logBase) logBase = c;
      if (done) finishWork(why);
    } else if (desired === "tower") {
      if (mode === "tower") {
        const now = Date.now();
        if (!towerSince) towerSince = now;
        if (towerDeaths && now - towerSince >= TOWER_OK_MS) towerDeaths = 0; // trụ được đủ lâu: không còn tính là chết liên tiếp
        tries = 0;
        farmSince = 0;
      } else if (mode === "farm") {
        const now = Date.now();
        if (!farmSince) {
          farmSince = now;
          // Vừa từ tháp về Luyện Công (do gục ngã): tính một lần chết
          if (towerSince) {
            towerDeaths++;
            towerSince = 0;
            console.log("[VL] Gục ngã ở Leo Tháp (lần chết liên tiếp thứ " + towerDeaths + "/" + TOWER_MAX_DEATHS + ")");
          }
        }
        if (towerDeaths >= TOWER_MAX_DEATHS) {
          // Chết liên tiếp quá nhiều: dừng vào lại, ở lại Luyện Công
          desired = "farm";
          note = "Chết " + towerDeaths + " lần liên tiếp ở Leo Tháp: đã dừng và ở lại Luyện Công";
          console.log("[VL] " + note);
          towerDeaths = 0;
          farmSince = 0;
          report(true, true);
          return;
        }
        if (now - farmSince >= REENTER_MS) {
          farmSince = 0;
          if (tries >= MAX_TRIES) {
            desired = null;
            console.log("[VL] Không vào lại được Leo Tháp (thiếu cấp / bị chặn?), dừng tự vào lại");
            report(true, true);
          } else {
            tries++;
            clickMode("tower");
            console.log("[VL] Rời tháp -> vào lại Leo Tháp (lần " + tries + ")");
          }
        }
      } else {
        farmSince = 0;
      }
    }
    report(false);
  }

  setInterval(tick, POLL_MS);
  setInterval(() => {
    autoSellTick().catch(() => {});
  }, AUTO_SELL_POLL_MS);
  post({ type: "hello" });
})();

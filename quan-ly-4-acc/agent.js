// Script nhỏ được máy chủ cục bộ chèn vào trang game ở mỗi khung của trang quản lý.
// Việc duy nhất nó làm: nhận lệnh "đặt chế độ" từ trang quản lý rồi bấm đúng nút chế độ của game
// (Luyện Công / Phó Bản / Nhiệm Vụ / Leo Tháp), và báo lại chế độ hiện tại.
// Riêng Leo Tháp: nếu gục ngã và game tự về Luyện Công thì tự bấm vào lại.
// Chỉ nhận lệnh từ trang quản lý (cùng máy, cổng 8800), không gửi dữ liệu ra ngoài máy bạn.
(() => {
  if (window.__vlAgent) return;
  window.__vlAgent = true;
  // Trong ứng dụng desktop, desktop/preload-game.js tạo window.__vlBridge (post / on) để nói chuyện với trang quản lý;
  // trong trình duyệt thì dùng postMessage giữa khung và trang cha.
  const BR = window.__vlBridge;
  if (!BR && window.parent === window) return; // mở game trực tiếp thì không làm gì

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
  const STEPS = ["sell", "dg", "ldt", "quest"]; // thứ tự các bước hẹn giờ ("sell" = bán đồ xanh + HK cơ bản để lấy chỗ trống)
  // Dòng nhật ký game ghi khi tự dời về bãi luyện công vì hết việc
  const DONE_LOG = { quest: "Hết nhiệm vụ, luyện công", dg: "Hết lượt phó bản, luyện công" };
  const TOAST_DONE = { dg: "Hết lượt phó bản" };

  let desired = null; // chế độ muốn giữ, null = không điều khiển
  let queue = []; // các việc còn lại của "Chạy tất cả" (sau việc đang làm)
  let comboAfter = "farm"; // chế độ sau khi "Chạy PB + NV" xong hết: "farm" (Luyện Công) hoặc "tower" (Leo Tháp)
  let comboKept = false; // hẹn giờ: bước bán có gồm cả đồ xanh game đang giữ không
  let comboRun = 0; // số thứ tự lần chạy combo hiện tại; bạn chọn chế độ khác trong lúc đang mua thì lần mua đó không kéo khung đi tiếp nữa
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
    console.log("[VL] Hết " + label + " (" + why + ")");
    advance();
  };
  const goMode = (m) => {
    desired = m;
    applied = true;
    farmSince = 0;
    tries = 0;
    resetWork();
    clickMode(m);
    report(true, true);
  };
  // Sang việc kế tiếp trong hàng chờ ("ldt" = mua lệnh bài Dã Tẩu); hết hàng thì sang chế độ cuối (Leo Tháp / Luyện Công)
  const advance = () => {
    const s = queue.shift();
    if (s === "ldt") return buyLdt();
    if (s === "sell") return sellStep();
    if (s) {
      console.log("[VL] -> sang " + s);
      return goMode(s);
    }
    const next = comboAfter === "tower" ? "tower" : "farm";
    console.log("[VL] -> " + (next === "tower" ? "Leo Tháp" : "Luyện Công"));
    goMode(next);
  };
  // Lần chạy hẹn giờ: về Luyện Công trong lúc mua lệnh bài Dã Tẩu (cửa sổ game bận thì thử lại vài lần), xong làm tiếp việc kế
  const buyLdt = () => {
    const run = comboRun;
    note = (note ? note + " → " : "") + "mua lệnh bài Dã Tẩu";
    goMode("farm");
    (async () => {
      for (let t = 0; t < 6 && run === comboRun; t++) {
        await runPd("ldt", {});
        if (!/đang mở cửa sổ khác|Chưa vào game|game không phản hồi/.test(pdMsg)) break; // khung chậm (proxy xa): mở lại Kỳ Trân Các thử lần nữa
        await wait(10000);
      }
      if (run !== comboRun) return; // bạn đã chọn chế độ khác
      note = "Đã mua lệnh bài Dã Tẩu";
      advance();
    })().catch(() => {});
  };
  // Lần chạy hẹn giờ: về Luyện Công, bán đồ xanh rồi bán HK cơ bản để có chỗ trống trong hành trang (cửa sổ game bận thì thử lại vài lần), xong làm tiếp việc kế
  const sellStep = () => {
    const run = comboRun;
    note = (note ? note + " → " : "") + "bán đồ xanh + HK cơ bản";
    goMode("farm");
    (async () => {
      const BUSY = /đang mở cửa sổ khác|Chưa vào game/;
      for (const what of ["blue", "hk"]) {
        for (let t = 0; t < 6 && run === comboRun; t++) {
          const r = await runSell(false, comboKept, what);
          if (!(r.msg && BUSY.test(r.msg)) && !(r.sold === 0 && !r.msg)) break; // r.msg rỗng = đang có lần bán khác chạy: chờ rồi thử lại
          await wait(10000);
        }
      }
      if (run !== comboRun) return; // bạn đã chọn chế độ khác
      note = "Đã bán đồ trước khi chạy";
      advance();
    })().catch(() => {});
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
      if (BR) BR.post(Object.assign({ vl: 1 }, o));
      else window.parent.postMessage(Object.assign({ vl: 1 }, o), DASH);
    } catch (e) {}
  };

  // sync = true khi chính khung đổi lựa chọn (bạn tự bấm / bị chặn), để trang quản lý cập nhật theo
  function report(force, sync) {
    const ready = !!q("#mswMenu");
    const sv = ready ? readSave() : null; // số liệu thật từ bản lưu của game (không phụ thuộc việc khung có đang được vẽ)
    const ok = ready && charLoaded(); // không có bản lưu thì đọc chữ trên thanh trên, nhưng chỉ khi đã vào nhân vật (trước đó là số mặc định: cấp 1, 0 lượng)
    if (sv && sv.name) heroName = sv.name;
    const msg = { type: "status", mode: curMode(), ready, hero: ready ? heroName : "", lvl: sv ? sv.lvl : ok ? readLevel() : 0, gold: sv ? fmtGold(sv.gold) : ok ? readText("#gold") : "", goldN: sv ? sv.gold : null, knb: sv ? fmtKnb(sv.knb) : ok ? readText("#knbTop") : "", knbN: sv ? sv.knb : null, tower: sv ? sv.tw : ok ? readTower() : 0, desired, next: queue[0] || null, note, boss: bossMsg, pet: petMsg, petOn: petRun, pd: pdMsg, sell: sellMsg, auto: autoSell, autoInfo: autoSell ? autoInfo : "", black: ready && readBlack(), acct: ready ? readAcct() : "", dev: ready ? readDev() : "", sync: !!sync };
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
  // Thông báo nổi của game đang hiện (có lớp "on" khoảng 2 giây) -> nội dung, "" nếu không có
  const toastOn = () => {
    const el = q("#toast");
    return el && el.classList.contains("on") ? el.textContent.trim() : "";
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
  // Mở hết Hồng Bao / Đại Hồng Bao (lưu trên máy chủ, dùng chung cả tài khoản): mở cửa sổ "🧧 Hồng Bao" của game rồi bấm
  // [Mở ×N] (tối đa 10 cái mỗi lần, nút này khóa khi chỉ còn 1) hoặc [Mở 1] cho tới khi hết. Sau mỗi lần bấm game khóa nút,
  // gọi máy chủ rồi vẽ lại cửa sổ với số còn lại, nên chờ số còn lại đổi (hoặc báo lỗi nếu không đổi).
  const hbCount = (kind) => {
    const btn = q('#mBody [data-hbo="' + kind + '"]');
    const b = btn && btn.parentElement && btn.parentElement.querySelector("b");
    return b ? digits(String(b.textContent).split(":").pop()) : -1; // -1 = không đọc được
  };
  async function pdHb() {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    // Game mở cửa sổ Hồng Bao khi bấm vào phần tử có id bHbOpen (nút 🧧 trong Hành trang)
    const el = document.createElement("span");
    el.id = "bHbOpen";
    document.body.appendChild(el);
    el.click();
    el.remove();
    if (!(await waitFor(() => q("#mBody [data-hbo]"), 8000))) {
      closeModalBtn();
      return toastText() || "không mở được cửa sổ Hồng Bao (cần đăng nhập máy chủ)";
    }
    await wait(500);
    const gold0 = readText("#gold");
    const knb0 = readText("#knbTop");
    const opened = { hb: 0, dhb: 0 };
    let stop = "";
    for (const kind of ["hb", "dhb"]) {
      for (let guard = 0; guard < 300 && !stop; guard++) {
        const n = hbCount(kind);
        if (n < 0) {
          stop = "không đọc được số Hồng Bao";
          break;
        }
        if (n === 0) break;
        const btns = qa('#mBody [data-hbo="' + kind + '"]').filter((b) => !b.disabled);
        const btn = btns[btns.length - 1];
        if (!btn) {
          stop = "nút mở bị khóa";
          break;
        }
        btn.click();
        const moved = await waitFor(() => hbCount(kind) !== n && q('#mBody [data-hbo="' + kind + '"]:not([disabled])') || hbCount(kind) === 0, 20000);
        if (!moved) {
          stop = toastText() || "máy chủ không trả lời";
          break;
        }
        opened[kind] += Math.max(0, n - Math.max(0, hbCount(kind)));
      }
    }
    closeModalBtn();
    const parts = [];
    if (opened.hb) parts.push(opened.hb + " Hồng Bao");
    if (opened.dhb) parts.push(opened.dhb + " Đại Hồng Bao");
    const gain = parts.length ? " · lượng " + gold0 + " → " + readText("#gold") + " · KNB " + knb0 + " → " + readText("#knbTop") : "";
    if (!parts.length) return stop || "không có Hồng Bao nào";
    return "đã mở " + parts.join(" + ") + gain + (stop ? " · dừng: " + stop : "");
  }
  // Đổi ngân lượng thành KNB ở Kỳ Trân Các (bảng "💰 Bảng Kim Nguyên Bảo", mục "Đổi KNB": 1 KNB = 10 vạn lượng, giới hạn mỗi ngày — hiện 5.000):
  // tính số KNB đổi được từ ngân lượng trong bản lưu (trừ phần giữ lại) rồi bấm [×100] / [×10] / [Mua] cho tới khi đủ.
  // Nút nào bị khóa (hết giới hạn ngày) thì hạ xuống cỡ nhỏ hơn. Bản lưu có thể cũ tới ~10 giây (ngân lượng mới kiếm chưa tính)
  // nên chỉ có thể đổi ít hơn một chút chứ không đổi quá.
  // Mở Kỳ Trân Các và tìm một phần tử trong cửa sổ. Bản game có hai bảng ("🔒 Bảng KNB khóa" mặc định, "💰 Bảng Kim Nguyên Bảo")
  // và các thẻ danh mục theo bảng: tìm ngay; chưa thấy thì bấm thẻ danh mục có chữ khớp tabRe ở bảng đang xem; chưa thấy nữa thì
  // chuyển sang bảng còn lại (mỗi bảng tự chọn thẻ đầu) rồi thử lại; cuối cùng (bản cũ chỉ có thẻ danh mục) bấm thẻ đầu tiên.
  // Trả về { el } hoặc { err }; lỗi kèm tên các nút đang hiện để dễ chẩn đoán.
  async function openKtc(findEl, tabRe) {
    const open = q("#u20ktc") || q("#ktcBtn");
    if (!open) return { err: "không thấy nút Kỳ Trân Các" };
    open.click();
    const tryTab = async () => {
      const tab = qa("#mBody [data-kc]").find((b) => tabRe.test(b.textContent));
      if (!tab) return null;
      tab.click();
      return await waitFor(findEl, 3000);
    };
    let el = await waitFor(findEl, 3000);
    if (!el) el = await tryTab();
    if (!el) {
      for (const b of qa("#mBody [data-kb]").filter((x) => !x.classList.contains("on"))) {
        b.click();
        el = (await waitFor(findEl, 2000)) || (await tryTab());
        if (el) break;
      }
    }
    if (!el) {
      const first = q("#mBody [data-kc]");
      if (first) {
        first.click();
        el = await waitFor(findEl, 3000);
      }
    }
    if (el) return { el };
    const seen = qa("#mBody [data-kb], #mBody [data-kc]").map((b) => b.textContent.trim()).join(" | ");
    closeModalBtn();
    return { err: "không thấy mục cần tìm trong Kỳ Trân Các" + (seen ? " (đang hiện: " + seen + ")" : " (cửa sổ không mở)") };
  }
  const KNB_GOLD = 1e5; // ngân lượng cho 1 KNB
  async function pdDoi(m) {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    const keep = Math.max(0, Math.floor(+m.keep || 0)) * 1e4; // nhập theo vạn lượng
    const sv = readSave(true);
    if (!sv) return "chưa đọc được số ngân lượng (nhân vật chưa nạp?)";
    let remain = Math.floor((sv.gold - keep) / KNB_GOLD);
    if (remain <= 0) return "không có gì để đổi (đang có " + fmtGold(sv.gold) + " lượng, giữ lại " + fmtGold(keep) + ")";
    petUi = true;
    try {
      const found = await openKtc(() => q('#mBody [data-ktc="knb"]'), /Đổi KNB/);
      if (found.err) return found.err;
      const before = sv.knb;
      let bought = 0;
      let maxStep = 100;
      let stop = "";
      for (let guard = 0; guard < 500 && remain > 0 && !stop; guard++) {
        const step = Math.min(maxStep, remain >= 100 ? 100 : remain >= 10 ? 10 : 1);
        const btn = q("#mBody " + (step === 100 ? '[data-ktc100="knb"]' : step === 10 ? '[data-ktc10="knb"]' : '[data-ktc="knb"]'));
        if (!btn) {
          stop = "không thấy nút mua KNB";
        } else if (btn.disabled) {
          if (step > 1) maxStep = step === 100 ? 10 : 1; // hết giới hạn ngày / không đủ cho cỡ này: thử cỡ nhỏ hơn
          else stop = "đã tới giới hạn đổi trong ngày hoặc không đủ ngân lượng";
        } else {
          btn.click();
          bought += step;
          remain -= step;
          await wait(400);
        }
      }
      closeModalBtn();
      if (!bought) return stop || "không đổi được";
      // Bản lưu cập nhật sau tối đa ~10 giây: chờ để báo số KNB thật
      let after = before;
      for (let t = 0; t < 14 && after === before; t++) {
        await wait(1000);
        const s2 = readSave(true);
        if (s2) after = s2.knb;
      }
      return "đã mua " + bought + " KNB" + (after !== before ? " (KNB " + before + " → " + after + ")" : " (chưa thấy bản lưu cập nhật)") + (stop ? " · dừng: " + stop : "");
    } finally {
      petUi = false;
    }
  }

  // Gửi hết KNB cho nhân vật khác bằng thư: mở Hộp thư, điền người nhận + số KNB (ô "KNB" của màn Gửi thư, chỉ có ở tài khoản online),
  // bỏ chọn mọi món đồ và ô thư giao dịch, bấm [Gửi thư]. Số KNB lấy từ bản lưu; nếu chưa khớp với số hiện trên màn hình
  // (bản lưu cũ tới ~10 giây, ví dụ vừa đổi xong) thì chờ cho khớp để không gửi thiếu.
  const approxKnb = (t) => {
    const m = String(t || "").match(/([\d.]+)\s*([kMB]?)/);
    return m ? parseFloat(m[1]) * ({ k: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1) : null;
  };
  async function pdGuiKnb(m) {
    const to = String(m.to || "").trim();
    if (!to) return "chưa nhập tên nhân vật nhận";
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    if (!readSave(true)) return "chưa đọc được số KNB (nhân vật chưa nạp?)";
    petUi = true;
    try {
      const btn = q("#u20mail");
      if (btn) btn.click();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key: "F6", bubbles: true })); // phím tắt mở Hộp thư
      if (!(await waitFor(() => q("#nmTo") && q("#nmGold"), 8000))) {
        closeModalBtn();
        return toastText() || "không mở được Hộp thư (cần đăng nhập máy chủ)";
      }
      const label = q("#nmGoldL");
      if (!label || label.textContent.trim() !== "KNB") {
        closeModalBtn();
        return "ô gửi thư đang là ngân lượng, không phải KNB (tài khoản chưa ở chế độ online)";
      }
      const shown = approxKnb((q(".ml-have b") || {}).textContent);
      let knb = 0;
      for (let t = 0; t < 16; t++) {
        const sv = readSave(true);
        knb = sv ? sv.knb : 0;
        if (shown == null || Math.abs(knb - shown) <= Math.max(60, shown * 0.006)) break;
        await wait(1000);
      }
      if (knb <= 0) {
        closeModalBtn();
        return "không có KNB để gửi";
      }
      qa("#nmInv .ep-on").forEach((el) => el.click()); // bỏ chọn món đồ còn nhớ từ lần mở trước
      const gd = q("#nmGdOn");
      if (gd && gd.checked) gd.click();
      const set = (sel, v) => {
        const el = q(sel);
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("#nmTo", to);
      set("#nmGold", String(knb));
      set("#nmNote", "");
      await waitFor(() => !toastOn(), 2500); // chờ thông báo cũ (nếu có) tắt để không đọc nhầm
      q("#nmSend").click();
      await wait(300);
      const res = await waitFor(() => toastOn(), 8000);
      closeModalBtn();
      if (res && /Đã gửi/.test(res)) return "đã gửi " + knb + " KNB cho " + to;
      return res ? "không gửi được: " + res : "không rõ kết quả, kiểm tra Hộp thư trong game";
    } finally {
      petUi = false;
    }
  }
  // Mở Hộp thư và chờ màn Gửi thư (dùng chung cho gửi KNB / gửi đồ). Trả về "" nếu mở được, ngược lại là lý do.
  async function openMailForm() {
    const btn = q("#u20mail");
    if (btn) btn.click();
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "F6", bubbles: true })); // phím tắt mở Hộp thư
    if (await waitFor(() => q("#nmTo") && q("#nmGold"), 8000)) return "";
    closeModalBtn();
    return toastText() || "không mở được Hộp thư (cần đăng nhập máy chủ)";
  }
  const setField = (sel, v) => {
    const el = q(sel);
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // Gửi đồ Hoàng Kim: chọn các món Hoàng Kim trong hành trang ("Kèm món đồ" của màn Gửi thư: ô có lớp r4), mỗi thư tối đa 10 món
  // (giới hạn của game), bấm [Gửi thư] rồi [Gửi] ở hộp xác nhận; lặp tới khi hết. Món khóa 🔒 VẪN gửi được (theo game, khóa chỉ chặn
  // tự bán / bán Chợ, không chặn gửi thư) nên được gửi; chỉ bỏ ô 📜 (đang giữ cho Dã Tẩu), đồ Bạch Kim (r5) và đồ đang mặc
  // (không nằm trong hành trang). Dừng khi game báo lỗi.
  const MAIL_ITEMS_MAX = 10;
  async function pdGuiHk(m) {
    const to = String(m.to || "").trim();
    if (!to) return "chưa nhập tên nhân vật nhận";
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    petUi = true;
    try {
      const err = await openMailForm();
      if (err) return err;
      const hk = () => qa("#nmInv [data-uid].r4").filter((el) => !/📜/.test((el.querySelector("u.lk") || {}).textContent || ""));
      let sent = 0;
      let mails = 0;
      let stop = "";
      for (let guard = 0; guard < 40 && !stop; guard++) {
        const tiles = hk();
        if (!tiles.length) break;
        qa("#nmInv .ep-on").forEach((el) => el.click()); // bỏ chọn món còn nhớ từ lần trước
        const pick = tiles.slice(0, MAIL_ITEMS_MAX);
        pick.forEach((el) => el.click());
        if (qa("#nmInv .ep-on").length !== pick.length) {
          stop = "không chọn được các món đồ";
          break;
        }
        const gd = q("#nmGdOn");
        if (gd && gd.checked) gd.click();
        setField("#nmTo", to);
        setField("#nmGold", "");
        setField("#nmNote", "");
        await waitFor(() => !toastOn(), 2500);
        const oldInv = q("#nmInv");
        q("#nmSend").click();
        const ask = await waitFor(() => q('#askBox [data-a="1"]'), 3000);
        if (!ask) {
          stop = toastText() || "không hiện hộp xác nhận gửi";
          break;
        }
        ask.click();
        const res = await waitFor(() => toastOn(), 10000);
        if (res && /Đã gửi/.test(res)) {
          sent += pick.length;
          mails++;
          // Game vẽ lại cả màn Gửi thư sau khi gửi (sau khi tải lại Hộp thư): chờ ô "Kèm món đồ" mới thay ô cũ, không thao tác trên bản cũ
          if (!(await waitFor(() => { const cur = q("#nmInv"); return cur && cur !== oldInv; }, 15000))) {
            stop = "màn Gửi thư không hiện lại";
          }
        } else {
          stop = res || "không rõ kết quả";
        }
      }
      // Tóm tắt độ hiếm các ô còn trong hành trang TRƯỚC khi đóng cửa sổ (đóng xong thì không còn gì để đọc)
      const seen = {};
      qa("#nmInv [data-uid]").forEach((el) => {
        const m = el.className.match(/\br(\d)\b/);
        const k = m ? "r" + m[1] : "?";
        seen[k] = (seen[k] || 0) + 1;
      });
      closeModalBtn();
      if (!sent) {
        if (stop) return "không gửi được: " + stop;
        // Không thấy món nào: kể ra các độ hiếm đang có trong hành trang để dễ chẩn đoán
        const list = Object.keys(seen).sort().map((k) => k + "×" + seen[k]).join(", ");
        return "không có đồ Hoàng Kim (ô r4) nào trong hành trang để gửi (đồ đang mặc, Bạch Kim và đồ giữ cho Dã Tẩu không tính)" + (list ? " · hành trang đang có: " + list : " · hành trang trống");
      }
      return "đã gửi " + sent + " món Hoàng Kim cho " + to + " (" + mails + " thư)" + (stop ? " · dừng: " + stop : "");
    } finally {
      petUi = false;
    }
  }

  // Mở hết Rương Ngựa. Có hai nơi chứa rương:
  //  1) "Túi vật phẩm" trong thẻ Hành trang: ô Rương Ngựa (data-mi="rngua") mở cửa sổ có [Dùng] và [Dùng ×N] (N = tối đa 10, mở một lần N rương).
  //     Bấm [Dùng ×N] lặp lại tới hết; còn đúng 1 rương thì chỉ có [Dùng]. Sau khi bấm game đóng cửa sổ và vẽ lại ô nên mở lại ô để đọc số mới.
  //  2) Rương nằm thành chồng trong lưới hành trang (mua ở Kỳ Trân Các): chỉ mở được từng cái bằng [Dùng] ở Kỳ Trân Các > "Thú cưỡi"
  //     (game không vẽ lại cửa sổ sau khi bấm nên chờ thông báo rồi bấm thẻ danh mục để vẽ lại và đọc số còn lại).
  // Mỗi lần bấm chờ thông báo nổi của game (tên ngựa / "Mở N Rương Ngựa", hoặc lỗi như "Hành trang đầy" thì dừng).
  const TOAST_ERR = /^(Hành trang đầy|Túi đầy|Không có|Không đủ|Cần |Tối đa|Đang )|lỗi/i;
  const rnguaToast = (toast, horses) => {
    const many = toast.match(/Mở\s+(\d+)\s+Rương/); // "Mở N Rương Ngựa" khi mở nhiều cùng lúc
    if (!many) horses.push(toast.replace(/^Rương Ngựa\s*(\(\d+\))?\s*:?\s*/, ""));
    return many ? +many[1] : 1;
  };
  async function rnguaViaBag() {
    const res = { opened: 0, horses: [], stop: "", found: false };
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return res;
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    try {
      await wait(250);
      const tileCount = () => digits((q('[data-mi="rngua"] i') || {}).textContent);
      let stuck = 0;
      for (let guard = 0; guard < 200 && !res.stop; guard++) {
        const tile = q('[data-mi="rngua"]');
        if (!tile) break;
        res.found = true;
        const before = tileCount();
        tile.click();
        const btn = await waitFor(() => q("#miUse10") || q("#miUse"), 3000);
        if (!btn) {
          res.stop = "không mở được cửa sổ Rương Ngựa";
          break;
        }
        if (btn.disabled) {
          closeModalBtn();
          break;
        }
        await waitFor(() => !toastOn(), 2500); // chờ thông báo cũ tắt để không đọc nhầm
        btn.click();
        const toast = await waitFor(() => toastOn(), 15000);
        if (!toast) {
          closeModalBtn();
          res.stop = "game không phản hồi";
          break;
        }
        if (TOAST_ERR.test(toast)) {
          closeModalBtn();
          res.stop = toast;
          break;
        }
        res.opened += rnguaToast(toast, res.horses);
        await waitFor(() => !toastOn(), 2500);
        closeModalBtn();
        await wait(300);
        const after = q('[data-mi="rngua"]') ? tileCount() : 0;
        if (after >= before && before > 0) {
          if (++stuck >= 2) res.stop = "số Rương Ngựa không giảm sau khi mở";
        } else stuck = 0;
      }
    } finally {
      closeModalBtn();
      restoreTab(prev);
    }
    return res;
  }
  async function rnguaViaKtc() {
    const res = { opened: 0, horses: [], stop: "", found: false };
    const found = await openKtc(() => q('#mBody [data-ktcuse="rngua"]'), /Thú cưỡi/);
    if (found.err) {
      res.stop = found.err;
      return res;
    }
    const btnNow = () => q('#mBody [data-ktcuse="rngua"]');
    const count = () => {
      const b = btnNow();
      const m = b && String(b.title || "").match(/đang có\s*(\d+)/);
      return b ? (m ? +m[1] : 0) : -1; // -1 = không còn nút (cửa sổ đổi)
    };
    // Vẽ lại cửa sổ Kỳ Trân Các: bấm thẻ danh mục đang chọn (game vẽ lại cả cửa sổ rồi mới có số rương mới)
    const refresh = async () => {
      const cur = q("#mBody [data-kc].on") || q("#mBody [data-kc]");
      if (cur) cur.click();
      await wait(250);
    };
    if (!(count() > 0)) {
      closeModalBtn();
      return res;
    }
    res.found = true;
    let stuck = 0;
    for (let guard = 0; guard < 400 && !res.stop; guard++) {
      const btn = btnNow();
      if (!btn) {
        res.stop = "mất nút Dùng";
        break;
      }
      if (btn.disabled) break; // hết rương
      const before = count();
      await waitFor(() => !toastOn(), 2500);
      btn.click();
      const toast = await waitFor(() => toastOn(), 15000);
      if (!toast) {
        res.stop = "game không phản hồi";
        break;
      }
      if (TOAST_ERR.test(toast)) {
        res.stop = toast;
        break;
      }
      res.opened += rnguaToast(toast, res.horses);
      await waitFor(() => !toastOn(), 2500);
      await refresh();
      const after = count();
      if (after >= 0 && after >= before) {
        // số rương không giảm dù đã báo mở: thử vẽ lại thêm một lần, vẫn vậy thì dừng để khỏi lặp vô hạn
        await wait(600);
        await refresh();
        if (count() >= before && ++stuck >= 2) res.stop = "số Rương Ngựa không giảm sau khi mở";
      } else stuck = 0;
    }
    closeModalBtn();
    return res;
  }
  async function pdRngua() {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    petUi = true;
    try {
      const bag = await rnguaViaBag();
      let ktc = { opened: 0, horses: [], stop: "", found: false };
      if (!bag.stop) ktc = await rnguaViaKtc(); // rương còn lại ở dạng chồng trong lưới hành trang
      const opened = bag.opened + ktc.opened;
      const horses = bag.horses.concat(ktc.horses);
      const stop = bag.stop || (ktc.found || ktc.opened ? ktc.stop : "");
      if (!opened) return stop ? "không mở được: " + stop : "không có Rương Ngựa nào";
      const shown = horses.slice(0, 5).join(", ") + (horses.length > 5 ? " +" + (horses.length - 5) : "");
      return "đã mở " + opened + " Rương Ngựa" + (shown ? " · " + shown : "") + (stop ? " · dừng: " + stop : "");
    } finally {
      petUi = false;
    }
  }

  // Mở khóa nhanh đồ Hoàng Kim trong hành trang: game chỉ mở khóa từng món (chi tiết món > [Mở khóa]), không có nút mở khóa hàng loạt.
  // Duyệt các ô Hoàng Kim (lớp r4) có biểu tượng 🔒 ở thẻ Hành trang, bấm ô, bấm [Mở khóa]. Đồ khác (ngựa, Bạch Kim, đồ tím…) giữ nguyên khóa;
  // ô 📜 (giữ cho Dã Tẩu) không phải khóa nên bỏ qua; món không khóa được (không có nút Mở khóa) cũng bỏ qua.
  const lockedTiles = () => qa("#t-inv .invgrid .it.r4").filter((el) => /🔒/.test((el.querySelector(".lk") || {}).textContent || ""));
  async function pdMoKhoa() {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return "không thấy thẻ Hành trang";
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    petUi = true;
    try {
      await wait(200);
      const before = lockedTiles().length;
      if (!before) return "không có món Hoàng Kim nào đang khóa trong hành trang";
      let done = 0;
      const tried = new Set();
      for (let guard = 0; guard < 400; guard++) {
        const tile = lockedTiles().find((el) => !tried.has(el.dataset.uid));
        if (!tile) break;
        tried.add(tile.dataset.uid);
        tile.click();
        const btn = await waitFor(() => q("#bLock"), 2000);
        if (btn && /Mở khóa/.test(btn.textContent)) {
          btn.click();
          if (await waitFor(() => !tile.isConnected || !/🔒/.test((tile.querySelector(".lk") || {}).textContent || ""), 2500)) done++;
        }
        closeModalBtn();
        await wait(60);
      }
      const left = lockedTiles().length;
      return "đã mở khóa " + done + "/" + before + " món Hoàng Kim" + (left ? " · còn " + left + " món khóa (không mở khóa được)" : "");
    } finally {
      petUi = false;
      closeModalBtn();
      restoreTab(prev);
    }
  }

  // Lọc đồ Hoàng Kim "max / gần max" rồi cất vào Rương Chứa Đồ. Chi tiết món (bấm ô trong thẻ Hành trang) liệt kê từng dòng thuộc tính, dòng nào có
  // giá trị ngẫu nhiên thì kèm khoảng [min ~ max], ví dụ "Sinh lực tối đa: +112 điểm [80 ~ 120]". Mỗi dòng có khoảng được tính tỉ lệ
  // giá trị / max (+11% [8 ~ 12] = 92%); từ ngưỡng % trở lên là "gần max" (100% = đúng max). Khoảng có số âm thì tính theo vị trí
  // trong khoảng (giá trị − min) / (max − min). Món có ít nhất N dòng như vậy thì cất vào rương
  // bằng nút [Cất rương] của chi tiết món (cất được cả món đang khóa 🔒). Bỏ qua ô 📜 giữ cho Dã Tẩu. Chế độ kiểm tra chỉ liệt kê, không cất.
  const HK_RNG = /\[\s*([-+−]?\d+(?:[.,]\d+)?)\s*[~–—-]\s*([-+−]?\d+(?:[.,]\d+)?)\s*\]/;
  const numF = (t) => parseFloat(String(t).replace("−", "-").replace(",", "."));
  const hkBagTiles = () => qa("#t-inv .invgrid .it.r4").filter((el) => !/📜/.test((el.querySelector(".lk") || {}).textContent || ""));
  // Các dòng có khoảng [min ~ max] ở chi tiết món đang mở -> [{ text, v, lo, hi, p }] (p = tỉ lệ 0..1)
  function readRolls() {
    const out = [];
    qa("#mBody .sl > div").forEach((el) => {
      const rng = el.querySelector(".rng");
      const m = rng && HK_RNG.exec(rng.textContent);
      if (!m) return;
      const lo = Math.min(numF(m[1]), numF(m[2])), hi = Math.max(numF(m[1]), numF(m[2]));
      if (!(hi > lo)) return; // khoảng cố định: không có "max"
      const all = el.textContent;
      const nums = all.slice(0, all.lastIndexOf(rng.textContent)).match(/[-+−]?\d+(?:[.,]\d+)?/g);
      if (!nums) return;
      const v = numF(nums[nums.length - 1]);
      out.push({ text: all.replace(/\s+/g, " ").trim(), v, lo, hi, pos: Math.max(0, Math.min(1, (v - lo) / (hi - lo))), p: Math.max(0, Math.min(1, lo >= 0 ? v / hi : (v - lo) / (hi - lo))) });
    });
    return out;
  }
  async function pdCatHk(m, dry) {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return "không thấy thẻ Hành trang";
    const pct = Math.max(1, Math.min(100, +m.pct || 90));
    const minLines = Math.max(1, Math.floor(+m.lines || 1));
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    petUi = true;
    try {
      await wait(200);
      const total = hkBagTiles().length;
      if (!total) return "không có món Hoàng Kim nào trong hành trang";
      const tried = new Set();
      const hit = []; // món đạt: { name, n, max, moved }
      let seen = 0, noRoll = 0, stop = "";
      for (let guard = 0; guard < 400 && !stop; guard++) {
        const tile = hkBagTiles().find((el) => !tried.has(el.dataset.uid));
        if (!tile) break;
        tried.add(tile.dataset.uid);
        tile.click();
        const h4 = await waitFor(() => q("#mBody .idet h4"), 2000);
        if (!h4) { closeModalBtn(); await wait(60); continue; }
        await wait(40); // chi tiết vẽ xong cả danh sách dòng
        const name = (h4.firstChild ? h4.firstChild.textContent : h4.textContent).trim();
        const rolls = readRolls();
        seen++;
        if (!rolls.length) noRoll++;
        const good = rolls.filter((r) => r.p * 100 >= pct - 1e-9);
        if (good.length >= minLines) {
          const rec = { name, n: good.length, max: good.filter((r) => r.p >= 1).length, pcts: good.map((r) => Math.round(r.p * 100) + "%"), moved: false };
          hit.push(rec);
          if (!dry) {
            const btn = q("#bStashIt");
            if (!btn) { rec.err = "không có nút Cất rương"; }
            else {
              btn.click();
              // Món biến khỏi hành trang = đã cất; nếu không thì thông báo "Rương đầy" (hiện chừng 2 giây) có thể tắt trước khi hết hạn chờ, nên bắt ngay khi nó hiện
              await waitFor(() => !tile.isConnected || /đầy|lỗi/i.test(toastOn()), 2500);
              if (!tile.isConnected) rec.moved = true;
              else {
                const t = toastOn();
                rec.err = t || "không cất được";
                if (/đầy/i.test(t)) stop = t; // Rương Chứa Đồ hết chỗ: dừng
              }
            }
          }
        }
        closeModalBtn();
        await wait(60);
      }
      const tag = "≥" + pct + "%" + (minLines > 1 ? " từ " + minLines + " dòng" : "");
      const show = hit.slice(0, 8).map((r) => r.name + " (" + r.n + " dòng " + r.pcts.join("/") + (r.max ? ", " + r.max + " max" : "") + (r.err ? " – " + r.err : "") + ")").join("; ");
      const rest = hit.length > 8 ? " … +" + (hit.length - 8) + " món" : "";
      if (dry) return "đã kiểm tra " + seen + " món HK: " + hit.length + " món đạt " + tag + (show ? " → " + show + rest : "") + (noRoll ? " · " + noRoll + " món không có dòng [min ~ max] để so" : "");
      const moved = hit.filter((r) => r.moved).length;
      return "đã cất " + moved + "/" + hit.length + " món đạt " + tag + " vào Rương Chứa Đồ (đã xét " + seen + " món HK)" + (stop ? " · dừng: " + stop : "") + (moved ? " → " + hit.filter((r) => r.moved).slice(0, 8).map((r) => r.name).join("; ") + rest : "");
    } finally {
      petUi = false;
      closeModalBtn();
      restoreTab(prev);
    }
  }

  // Trong hành trang có nhiều món Hoàng Kim cùng tên (cùng loại, khác chỉ số ngẫu nhiên): với mỗi nhóm từ 2 món trở lên, chọn ra MỘT món tốt nhất
  // rồi cất vào Rương Chứa Đồ (các món còn lại giữ nguyên trong hành trang). Điểm của món = tổng, trên mọi dòng có khoảng [min ~ max],
  // của vị trí giá trị trong khoảng (giá trị − min) / (max − min), tức dòng càng gần max càng được nhiều điểm. Hòa điểm thì lấy món có tổng giá trị / max cao hơn.
  // Ô 📜 (giữ cho Dã Tẩu) không xét. Chế độ xem (m.dry) chỉ liệt kê nhóm và món được chọn.
  async function pdBestHk(m) {
    const dry = !!m.dry;
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return "không thấy thẻ Hành trang";
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    petUi = true;
    try {
      await wait(200);
      if (!hkBagTiles().length) return "không có món Hoàng Kim nào trong hành trang";
      // Lượt 1: đọc điểm của từng món
      const items = [];
      const tried = new Set();
      for (let guard = 0; guard < 400; guard++) {
        const tile = hkBagTiles().find((el) => !tried.has(el.dataset.uid));
        if (!tile) break;
        tried.add(tile.dataset.uid);
        tile.click();
        const h4 = await waitFor(() => q("#mBody .idet h4"), 2000);
        if (h4) {
          await wait(40);
          const name = (h4.firstChild ? h4.firstChild.textContent : h4.textContent).trim();
          const rolls = readRolls();
          if (name && rolls.length) {
            items.push({ uid: tile.dataset.uid, name, n: rolls.length, score: rolls.reduce((a, r) => a + r.pos, 0), ratio: rolls.reduce((a, r) => a + r.p, 0), locked: !!tile.querySelector(".lk") });
          }
        }
        closeModalBtn();
        await wait(60);
      }
      const groups = {};
      items.forEach((it) => (groups[it.name] = groups[it.name] || []).push(it));
      const dup = Object.keys(groups).filter((k) => groups[k].length >= 2);
      if (!dup.length) return "đã xét " + items.length + " món HK: không có nhóm nào từ 2 món cùng tên trở lên";
      const pick = dup.map((k) => {
        const g = groups[k].slice().sort((a, b) => b.score - a.score || b.ratio - a.ratio);
        return { name: k, count: g.length, best: g[0], second: g[1] };
      });
      const pc = (it) => Math.round((it.score / it.n) * 100) + "%"; // điểm trung bình mỗi dòng
      const label = (p) => p.name + " (" + p.count + " món → tốt nhất " + pc(p.best) + "/dòng" + (p.second ? ", món thứ hai " + pc(p.second) : "") + ")";
      if (dry) return "đã xét " + items.length + " món HK, " + pick.length + " nhóm trùng: " + pick.slice(0, 8).map(label).join("; ") + (pick.length > 8 ? " … +" + (pick.length - 8) + " nhóm" : "");
      // Lượt 2: cất món tốt nhất của từng nhóm
      let moved = 0, stop = "";
      const done = [];
      for (const p of pick) {
        if (stop) break;
        const tile = qa("#t-inv .invgrid .it.r4").find((el) => el.dataset.uid === p.best.uid);
        if (!tile) continue;
        tile.click();
        const btn = await waitFor(() => q("#bStashIt"), 2000);
        if (!btn) { closeModalBtn(); await wait(60); continue; }
        btn.click();
        await waitFor(() => !tile.isConnected || /đầy|lỗi/i.test(toastOn()), 2500);
        if (!tile.isConnected) { moved++; done.push(label(p)); }
        else {
          const t = toastOn();
          if (/đầy/i.test(t)) stop = t; // Rương Chứa Đồ hết chỗ: dừng
          closeModalBtn();
        }
        await wait(60);
      }
      return "đã cất " + moved + "/" + pick.length + " món tốt nhất vào Rương Chứa Đồ (xét " + items.length + " món HK)" + (stop ? " · dừng: " + stop : "") + (done.length ? " → " + done.slice(0, 6).join("; ") + (done.length > 6 ? " … +" + (done.length - 6) + " nhóm" : "") : "");
    } finally {
      petUi = false;
      closeModalBtn();
      restoreTab(prev);
    }
  }

  // Mua hết Lệnh Bài Dã Tẩu có thể mua bằng KNB khóa: Kỳ Trân Các > bảng "🔒 Bảng KNB khóa" > thẻ "Ủy thác & nhiệm vụ" > card Lệnh Bài Dã Tẩu
  // (giá và số lượng tối đa mỗi ngày đọc từ card, không cố định trong code; chữ trên card: "Hôm nay X/Y · có N"). Bấm [×10] (mua tối đa 10 cái) rồi [Mua] cho tới khi
  // nút bị khóa (đủ số lượt trong ngày hoặc hết KNB khóa) hoặc game báo lỗi. Sau mỗi lần bấm game vẽ lại cửa sổ với số "Hôm nay" mới.
  async function pdLdt() {
    if (!q("#mswMenu")) return "Chưa vào game";
    if (modalOpen()) return "đang mở cửa sổ khác, thử lại sau";
    petUi = true;
    try {
      const found = await openKtc(() => q('#mBody [data-ktc="ldt"]'), /Ủy thác|nhiệm vụ/i);
      if (found.err) return found.err;
      const card = () => {
        const b = q('#mBody [data-ktc="ldt"]');
        return b && b.closest(".u2card, .shoprow");
      };
      const status = () => {
        const c = card();
        const m = c && c.textContent.match(/Hôm nay\s*(\d+)\s*\/\s*(\d+)/);
        return m ? { used: +m[1], cap: +m[2] } : null;
      };
      const price = (() => {
        const c = card();
        const m = c && c.textContent.match(/(\d+)\s*KNB/);
        return m ? +m[1] : 0;
      })();
      let bought = 0;
      let stop = "";
      for (let guard = 0; guard < 200 && !stop; guard++) {
        const b1 = q('#mBody [data-ktc="ldt"]');
        if (!b1) {
          stop = "mất nút Mua";
          break;
        }
        const st = status();
        if (st && st.used >= st.cap) {
          stop = "đã mua đủ " + st.cap + " lệnh bài hôm nay";
          break;
        }
        const b10 = q('#mBody [data-ktc10="ldt"]');
        const btn = b10 && !b10.disabled ? b10 : !b1.disabled ? b1 : null;
        if (!btn) {
          stop = "không đủ KNB khóa" + (st ? " (hôm nay " + st.used + "/" + st.cap + ")" : "");
          break;
        }
        const before = st ? st.used : -1;
        await waitFor(() => !toastOn(), 2500);
        btn.click();
        let toast = "";
        const after = await waitFor(() => {
          toast = toastOn() || toast;
          const s2 = status();
          if (s2 && s2.used > before) return s2;
          return TOAST_ERR.test(toast) ? { err: toast } : null; // game báo lỗi (thiếu KNB khóa, đạt giới hạn…)
        }, 25000);
        if (!after) {
          // kèm chữ trên card để biết game đang hiện gì (khung chậm hay card không có "Hôm nay X/Y")
          const c = card();
          stop = toast || "game không phản hồi (card: " + (c ? c.textContent.replace(/\s+/g, " ").trim().slice(0, 90) : "không thấy") + (b10 ? ", ×10 " + (b10.disabled ? "khóa" : "mở") : "") + ")";
          break;
        }
        if (after.err) {
          stop = after.err;
          break;
        }
        bought += after.used - before;
        await waitFor(() => !toastOn(), 2500);
      }
      const st = status();
      closeModalBtn();
      if (!bought) return stop ? "không mua được: " + stop : "không mua được lệnh bài nào";
      return "đã mua " + bought + " Lệnh Bài Dã Tẩu" + (price ? " (−" + bought * price + " KNB khóa)" : "") + (st ? " · hôm nay " + st.used + "/" + st.cap : "") + (stop ? " · dừng: " + stop : "");
    } finally {
      petUi = false;
    }
  }

  const PD_NAME = { dong: "Đóng bình Phúc Duyên", dung: "Dùng hết bình Phúc Duyên", mo: "Mở hết rương Phúc Duyên", hb: "Mở hồng bao", doi: "Đổi lượng → KNB", knb: "Gửi KNB", hk: "Gửi đồ Hoàng Kim", ngua: "Mở rương ngựa", unlock: "Mở khóa đồ HK", ldt: "Mua lệnh bài Dã Tẩu", hkchk: "Kiểm tra HK max", hkcat: "Cất HK max", hkbest: "Cất món HK tốt nhất" };
  const PD_RUN = { dong: pdDong, dung: pdDung, mo: pdMo, hb: pdHb, doi: pdDoi, knb: pdGuiKnb, hk: pdGuiHk, ngua: pdRngua, unlock: pdMoKhoa, ldt: pdLdt, hkchk: (m) => pdCatHk(m, true), hkcat: (m) => pdCatHk(m, false), hkbest: pdBestHk };
  async function runPd(kind, m) {
    if (pdRun) return;
    pdRun = true;
    pdMsg = PD_NAME[kind] + ": đang chạy…";
    report(true);
    try {
      const r = await PD_RUN[kind](m);
      pdMsg = PD_NAME[kind] + ": " + r;
    } catch (err) {
      pdMsg = PD_NAME[kind] + ": lỗi " + (err && err.message ? err.message : err);
    } finally {
      pdRun = false;
      report(true);
    }
  }

  // --- Nhật ký: chuyển các dòng đáng chú ý của khung thông báo game về trang quản lý ---
  // Game chỉ vẽ dòng nhật ký hệ thống vào #u20lines khi khung thông báo đang ở tab "Hệ thống" (mặc định là "Thế giới"),
  // nên lần đầu sau khi tải khung script bấm sang tab đó một lần (bạn đổi lại thì thôi, không ép nữa). Mỗi giây so danh sách
  // dòng hiện có với lần trước để tìm dòng mới, chỉ gửi những dòng khớp LOG_NOTABLE (đồ phổ, Thần Mã).
  const LOG_NOTABLE = /Đồ phổ|đồ phổ|Thần Mã/;
  let logPrev = null; // các dòng ở lần quét trước (null = chưa quét lần nào: bỏ qua lịch sử có sẵn)
  let logSwitched = false;
  const lineDiff = (prev, cur) => {
    // Danh sách trượt: dòng mới thêm vào cuối, dòng cũ rơi khỏi đầu. Tìm phần cuối của prev trùng với phần đầu của cur.
    for (let keep = Math.min(prev.length, cur.length); keep >= 0; keep--) {
      let ok = true;
      for (let k = 0; k < keep && ok; k++) if (cur[k] !== prev[prev.length - keep + k]) ok = false;
      if (ok) return cur.slice(keep);
    }
    return cur;
  };
  function logScan() {
    const box = q("#u20lines");
    if (!box || !q("#mswMenu")) {
      logPrev = null;
      return;
    }
    const ch = box.dataset.lt;
    if (ch !== "sys" && ch !== "all") {
      logPrev = null;
      const b = !logSwitched && q('#u20ct button[data-lt="sys"]');
      if (b) {
        logSwitched = true;
        b.click();
      }
      return;
    }
    const cur = Array.prototype.map.call(box.children, (el) => el.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    const fresh = logPrev ? lineDiff(logPrev, cur) : [];
    logPrev = cur;
    const out = fresh.filter((t) => LOG_NOTABLE.test(t));
    if (out.length) post({ type: "events", lines: out.slice(0, 20) });
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
    const names = new Map(); // tên bãi -> tên các loài thiếu có ở đó (tên thật lấy từ dữ liệu game, Thú điển chỉ hiện "???")
    let reachable = 0;
    for (const idx of missing) {
      let ok = false;
      for (const raw of pets[idx][2] || []) {
        const name = String(raw).replace(/\s*\(\d+\s*-\s*\d+\)\s*$/, "").trim();
        const z = zones.get(name);
        if (!z || z.locked) continue;
        ok = true;
        score.set(name, (score.get(name) || 0) + 1);
        (names.get(name) || names.set(name, []).get(name)).push(String(pets[idx][1] || "?"));
      }
      if (ok) reachable++;
    }
    if (!score.size) return { none: missing.length };
    let best = null;
    for (const [name, n] of score) {
      const here = zoneHere(zones.get(name), name);
      if (!best || n > best.n || (n === best.n && here)) best = { name, n, here };
    }
    return { name: best.name, n: best.n, names: names.get(best.name) || [], reachable, left: missing.length - reachable };
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
        const shown = plan.names.slice(0, 5).join(", ") + (plan.names.length > 5 ? " +" + (plan.names.length - 5) : "");
        const info = "đã có " + dex.got + "/" + dex.total + " · " + plan.name + ": thiếu " + shown + (plan.left ? " · " + plan.left + " loài ở bãi chưa mở" : "");
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

  // --- Bán đồ xanh (thủ công + tự động khi hành trang đầy) và bán riêng đồ Hoàng Kim cơ bản (chỉ thủ công) trong Hành trang ---
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
  // Bán đồ Hoàng Kim "cơ bản" (bộ Định Quốc, Hiệp Cốt, Kim Phong, Thiên Hoàng: tên món bắt đầu bằng tên bộ) lấy KNB khóa.
  // Bán lẻ từng món như bán đồ xanh lẻ: bấm ô (lớp r4 = Hoàng Kim), đọc tên ở chi tiết món, [Bán · … KNB khóa], xác nhận.
  // Giữ lại món khóa 🔒 / đang giữ cho Dã Tẩu 📜 (ô có biểu tượng khóa), món đã cường hóa (+N), bộ khác (An Bang, Hoàng Kim Môn Phái…).
  const HK_BASIC = /^\s*(?:\[[^\]]*\]\s*)?(?:Định Quốc|Hiệp Cốt|Kim Phong|Thiên Hoàng)(?:\s|$)/;
  const hkTiles = () => qa("#t-inv .invgrid .it.r4").filter((el) => !el.querySelector(".lk"));
  async function sellHkBasicTiles() {
    let sold = 0;
    const tried = new Set();
    for (let guard = 0; guard < 150; guard++) {
      const tile = hkTiles().find((el) => !tried.has(el.dataset.uid));
      if (!tile) break;
      tried.add(tile.dataset.uid);
      tile.click();
      const name = await waitFor(() => q("#mBody .idet h4"), 2000);
      const btn = name && q("#bSell");
      const ok = btn && !btn.disabled && HK_BASIC.test(name.firstChild ? name.firstChild.textContent : name.textContent) && !name.querySelector(".enh") && /KNB khóa/.test(btn.textContent);
      if (!ok) {
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
  // Bán riêng đồ Hoàng Kim cơ bản (không đụng tới đồ xanh): chuyển sang thẻ Hành trang, bán lẻ từng món, trả lại thẻ cũ
  async function sellHk() {
    if (!q("#mswMenu")) return { sold: 0, msg: "Chưa vào game" };
    if (modalOpen()) return { sold: 0, msg: "đang mở cửa sổ khác, thử lại sau" };
    const invTab = q('#tabs button[data-t="inv"]');
    if (!invTab) return { sold: 0, msg: "không thấy thẻ Hành trang" };
    const prev = activeTab();
    if (prev !== "inv") invTab.click();
    try {
      await wait(150);
      const n = await sellHkBasicTiles();
      return {
        sold: n,
        msg: n > 0 ? "đã bán " + n + " món HK cơ bản (→ KNB khóa)" : "không có món HK cơ bản nào để bán (đồ khóa, đã cường hóa và bộ khác được giữ lại)",
      };
    } finally {
      restoreTab(prev);
    }
  }
  // what: "blue" (Bán đồ xanh, cả Tự bán) hoặc "hk" (Bán HK cơ bản)
  async function runSell(auto, kept, what) {
    if (sellRun) return { sold: 0 };
    sellRun = true;
    const label = auto ? "Tự bán" : what === "hk" ? "Bán HK cơ bản" : "Bán đồ xanh";
    sellMsg = label + ": đang bán…";
    report(true);
    let r = { sold: 0 };
    try {
      r = what === "hk" ? await sellHk() : await sellBlue(!!kept);
      sellMsg = label + ": " + r.msg;
    } catch (err) {
      sellMsg = label + ": lỗi " + (err && err.message ? err.message : err);
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

  const onCommand = (m) => {
    if (m && m.vl === 1 && m.type === "boss") {
      runBoss();
      return;
    }
    if (m && m.vl === 1 && m.type === "pet") {
      // on: true = bật (đang chạy thì thôi), false = tắt, không có = đảo trạng thái
      if (m.on === false) petCancel = petRun;
      else if (m.on === true) petRun || runPet();
      else runPet();
      return;
    }
    if (m && m.vl === 1 && m.type === "sell") {
      runSell(false, !!m.kept, m.what === "hk" ? "hk" : "blue");
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
    if (m && m.vl === 1 && m.type === "black") {
      setBlack(!!m.on);
      return;
    }
    if (m && m.vl === 1 && m.type === "pd") {
      if (PD_RUN[m.kind]) runPd(m.kind, m);
      return;
    }
    if (!m || m.vl !== 1 || m.type !== "setMode") return;
    if (m.mode !== null && !MODES.includes(m.mode)) return;
    if (petRun && !m.restore && m.mode !== "farm") petCancel = true; // bạn chọn chế độ khác: dừng đi bắt thú
    queue = [];
    note = "";
    comboRun++;
    comboAfter = m.mode === "combo" && m.after === "tower" ? "tower" : "farm";
    if (m.mode === "combo") {
      // steps (hẹn giờ): danh sách việc theo thứ tự Phó Bản → mua lệnh bài ("ldt") → Nhiệm Vụ, bỏ trống thì mặc định Phó Bản rồi Nhiệm Vụ
      comboKept = !!m.kept;
      const steps = Array.isArray(m.steps) ? STEPS.filter((x) => m.steps.includes(x)) : COMBO;
      queue = steps.slice(1);
      if (steps[0] === "sell" || steps[0] === "ldt") {
        explicit = false;
        queue = steps.slice(); // bước đầu không phải chế độ: để advance() lấy từ đầu hàng
        advance();
        return;
      }
      desired = steps.length ? steps[0] : comboAfter;
    } else {
      desired = m.mode;
    }
    explicit = !m.restore; // restore = trang quản lý khôi phục lựa chọn cũ sau khi tải lại khung
    applied = m.mode === null;
    tries = 0;
    farmSince = 0;
    resetWork();
    tick();
  };
  if (BR) BR.on(onCommand);
  else {
    window.addEventListener("message", (e) => {
      if (e.source !== window.parent || e.origin !== DASH) return;
      onCommand(e.data);
    });
  }

  // Bạn tự bấm đổi chế độ trong khung (click thật) -> theo lựa chọn của bạn, không giằng co
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || !e.target.closest) return;
      const b = e.target.closest("#mswMenu [data-msw], [data-mode]");
      if (!b) return;
      desired = b.dataset.msw || b.dataset.mode;
      comboRun++; // bạn tự chọn: hủy phần "mua lệnh bài rồi đi tiếp" của lần chạy hẹn giờ đang dở
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
  // Tầng tháp đang leo: tên bãi ở thanh trên hiện "Thông Thiên Tháp · tầng 37" khi ở trong tháp (0 = không ở trong tháp)
  const readTower = () => {
    const el = q("#u20zn");
    const m = el && el.textContent.match(/Tháp\s*·\s*tầng\s*(\d+)/);
    return m ? +m[1] : 0;
  };
  const readText = (sel) => {
    const el = q(sel);
    return el ? el.textContent.trim() : "";
  };
  // Số liệu thật của nhân vật: đọc từ bản lưu của chính game trong localStorage của khung này (khóa "jxidle" hoặc "jxidle_N",
  // dạng {f, d, h} với d là JSON trạng thái nhân vật) thay vì từ chữ trên thanh trên. Game chỉ vẽ lại thanh trên khi khung đang
  // được nhìn thấy (tab nền thì đứng yên, khung nạp trong tab nền còn số mặc định cấp 1) còn bản lưu thì game ghi mỗi ~10 giây
  // kể cả khi ẩn. Chỉ đọc, không ghi. Phân tích lại chỉ khi bản lưu đổi (so phần cuối chuỗi: có mã băm h).
  const SAVE_READ_MS = 3000;
  let saveInfo = null;
  let saveSig = "";
  let saveAt = 0;
  const readSave = (force) => {
    const now = Date.now();
    if (!force && now - saveAt < SAVE_READ_MS) return saveInfo;
    saveAt = now;
    try {
      const slot = localStorage.getItem("jxidle_slot"); // số thứ tự ô nhân vật; "menu" = đang ở màn chọn nhân vật
      if (!/^\d+$/.test(slot || "")) return (saveInfo = null);
      const raw = localStorage.getItem(+slot === 0 ? "jxidle" : "jxidle_" + (+slot + 1));
      if (!raw) return (saveInfo = null);
      const sig = slot + ":" + raw.length + ":" + raw.slice(-96);
      if (sig === saveSig) return saveInfo;
      saveSig = sig;
      const st = JSON.parse(JSON.parse(raw).d);
      const num = (v) => (isFinite(+v) ? Math.round(+v) : 0);
      saveInfo =
        st && st.fac != null && num(st.lvl) > 0
          ? { name: String(st.name || "").trim(), lvl: num(st.lvl), gold: num(st.gold), knb: num(st.knb), tw: num(st.rw && st.rw.twF) }
          : null;
    } catch (e) {
      saveInfo = null;
    }
    return saveInfo;
  };
  // Định dạng số giống thanh trên của game (hàm G / E): "9.876", "12,3 vạn", "1.234 vạn" / "1234", "12.3k", "1.23M"
  const fmtGold = (n) => {
    n = Math.round(n);
    if (Math.abs(n) < 1e4) return n.toLocaleString("vi-VN");
    const t = n / 1e4;
    return (Math.abs(t) < 100 ? (Math.round(t * 10) / 10).toLocaleString("vi-VN") : Math.round(t).toLocaleString("vi-VN")) + " vạn";
  };
  const fmtKnb = (n) => {
    n = Math.round(n);
    const a = Math.abs(n);
    return a < 1e4 ? "" + n : a < 1e6 ? (n / 1e3).toFixed(a < 1e5 ? 1 : 0) + "k" : a < 1e9 ? (n / 1e6).toFixed(2) + "M" : (n / 1e9).toFixed(2) + "B";
  };
  // Đã vào nhân vật chưa: nút chế độ của game ẩn cho tới khi nhân vật được nạp (khi đó thanh trên mới có số thật)
  const charLoaded = () => {
    const m = q("#modeSw");
    return !!m && !m.classList.contains("hidden");
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
  // Tài khoản đang đăng nhập ở khung này (game giữ phiên Supabase trong sessionStorage, email dạng "tên@..." nên chỉ lấy phần tên)
  // và 6 ký tự đầu mã máy của game (localStorage "jxDev"), để nhìn ra hai khung có đang dùng chung tài khoản / mã máy không.
  const readAcct = () => {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!/^jxidle_auth/.test(k)) continue;
        const j = JSON.parse(sessionStorage.getItem(k) || "null");
        const e = j && ((j.user && j.user.email) || (j.session && j.session.user && j.session.user.email));
        if (e) return String(e).split("@")[0].slice(0, 24);
      }
    } catch (e) {}
    return "";
  };
  const readDev = () => {
    try {
      return (localStorage.getItem("jxDev") || "").slice(0, 6);
    } catch (e) {
      return "";
    }
  };
  // Màn hình đen: tùy chọn "Màn hình đen" ở Hệ thống > Hiển Thị của game (ngừng vẽ, game vẫn chạy). Game nhớ lựa chọn trong localStorage "jxidle_ui".
  // Ô tích chỉ có trong trang khi thẻ Hệ thống đã được nạp, nên mở thẻ đó một lần chạy (trả lại thẻ cũ ngay) rồi tích / bỏ tích như bạn vẫn làm.
  const readBlack = () => {
    try {
      return !!JSON.parse(localStorage.getItem("jxidle_ui") || "{}").black;
    } catch (e) {
      return false;
    }
  };
  const setBlack = (on) => {
    if (readBlack() === on) return;
    readFromTab("more", () => {
      const cb = q("#uBlack");
      if (cb && cb.checked !== on) {
        cb.checked = on;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    report(true);
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
    if (heroName || heroTries >= HERO_MAX_TRIES) return;
    if (!charLoaded()) return; // chưa nạp nhân vật: chưa đọc, cũng chưa tính vào số lần thử // đã đọc rồi (hoặc bỏ cuộc): không đụng vào game nữa
    if (sellRun || bossRun || pdRun || petUi) return;
    const modal = q("#modal");
    if (modal && !modal.classList.contains("hidden")) return; // bạn đang dùng một cửa sổ
    if (Date.now() - heroAt >= HERO_RETRY_MS) peekHeroName();
  };

  // Màn đăng nhập (#ngU / #ngP / #ngIn): thấy liên tục LOGIN_WAIT_MS mà không ai gõ phím thì báo cho ứng dụng (nếu khung này có lưu tài khoản
  // và bật tự đăng nhập thì ứng dụng điền form). Chỉ chạy trong ứng dụng desktop. Bạn đang gõ (phím bấm trong vài giây qua) hoặc ô mật khẩu đã có chữ thì bỏ qua.
  const LOGIN_WAIT_MS = 4000;
  const LOGIN_RETRY_MS = 20000;
  let loginSeen = 0;
  let loginSent = 0;
  let lastKeyAt = 0;
  if (BR && BR.loginScreen) document.addEventListener("keydown", () => { lastKeyAt = Date.now(); }, true);
  const loginWatch = () => {
    if (!BR || !BR.loginScreen) return;
    const pw = q("#ngP");
    if (!pw || !q("#ngIn")) { loginSeen = 0; return; }
    if (pw.value || Date.now() - lastKeyAt < 8000) { loginSeen = 0; return; }
    const now = Date.now();
    if (!loginSeen) loginSeen = now;
    if (now - loginSeen >= LOGIN_WAIT_MS && now - loginSent >= LOGIN_RETRY_MS) {
      loginSent = now;
      BR.loginScreen();
    }
  };

  function tick() {
    loginWatch();
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
  setInterval(logScan, 1000);
  post({ type: "hello" });
})();

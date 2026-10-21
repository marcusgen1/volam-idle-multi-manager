// Võ Lâm Idle: khi đang leo tháp mà gục ngã (game tự chuyển về Luyện Công) thì tự vào lại Leo Tháp.
// Bật / tắt bằng popup của extension (bấm biểu tượng extension trên thanh công cụ Chrome).
(() => {
  const POLL_MS = 500;
  const TOWER_REENTER_MS = 2000; // thấy Luyện Công (do gục trong tháp) bao lâu thì vào lại Leo Tháp
  const TOWER_MAX_TRIES = 3; // vào lại thất bại liên tiếp quá số lần này thì dừng

  let enabled = true;
  let wantTower = false; // bạn đang leo tháp
  let farmSince = 0; // thời điểm bắt đầu thấy Luyện Công khi đang muốn leo tháp
  let towerTries = 0; // số lần vào lại liên tiếp chưa thành công

  function setEnabled(v) {
    enabled = v !== false; // mặc định bật
    if (!enabled) {
      wantTower = false;
      farmSince = 0;
      towerTries = 0;
    }
    console.log(`[Auto Tháp] ${enabled ? "BẬT" : "TẮT"}`);
  }

  try {
    chrome.storage.local.get({ enabled: true }, (r) => setEnabled(r.enabled));
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) setEnabled(changes.enabled.newValue);
    });
  } catch (e) {
    // extension vừa được tải lại: tab cũ mất kết nối, cần F5 trang
  }

  function currentMode() {
    const on = document.querySelector("#mswMenu [data-msw].on");
    return on ? on.dataset.msw : null;
  }

  // Chỉ tính click thật của bạn (isTrusted): chọn chế độ khác Leo Tháp nghĩa là bạn muốn rời tháp.
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || !e.target.closest) return;
      const b = e.target.closest("#mswMenu [data-msw], [data-mode]");
      if (b) wantTower = (b.dataset.msw || b.dataset.mode) === "tower";
    },
    true
  );

  function tick() {
    if (!enabled) return;
    const mode = currentMode();
    if (mode === "tower") {
      wantTower = true;
      towerTries = 0;
      farmSince = 0;
      return;
    }
    if (!wantTower || mode !== "farm") {
      farmSince = 0;
      return;
    }
    const now = Date.now();
    if (!farmSince) farmSince = now;
    if (now - farmSince < TOWER_REENTER_MS) return;
    farmSince = 0;
    if (towerTries >= TOWER_MAX_TRIES) {
      wantTower = false;
      console.log("[Auto Tháp] Không vào lại được Leo Tháp (thiếu cấp / bị chặn?), dừng tự vào lại");
      return;
    }
    const btn = document.querySelector('#mswMenu [data-msw="tower"]');
    if (!btn) return;
    towerTries++;
    btn.click();
    console.log(`[Auto Tháp] Rời tháp -> vào lại Leo Tháp (lần ${towerTries})`);
  }

  setInterval(tick, POLL_MS);
  console.log("[Auto Tháp] đã nạp");
})();

// Ứng dụng desktop "Võ Lâm Manager" (Electron): một cửa sổ có thanh điều khiển bên trái và tối đa 5 khung game.
// Mỗi khung là một <webview> với phiên riêng (partition persist:acc<số>), tương đương một hồ sơ trình duyệt riêng:
// localStorage, sessionStorage, cookie và phiên đăng nhập không dùng chung giữa các khung, nên không còn chuyện tài khoản này đè lên tài khoản kia.
// Khung mở thẳng trang game chính thức (game bản mới không chạy qua máy chủ cục bộ nữa). Máy chủ cục bộ (quan-ly-4-acc/server.js) chạy ngay trong ứng dụng
// để phục vụ trang quản lý, lưu proxy và mở cổng chuyển tiếp proxy cho từng khung.
const { app, BrowserWindow, Menu, ipcMain, session, shell, dialog, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

process.env.VL_APP = "1";
const BASE_PORT = parseInt(process.env.VL_BASE_PORT, 10) || 8800;
const FWD_BASE = BASE_PORT + 10;
const SLOTS = Math.min(50, Math.max(1, parseInt(process.env.VL_SLOTS, 10) || 5));
const GAME_URL = process.env.VL_GAME_URL || "https://volamidle.pages.dev/";
const GAME_ORIGIN = new URL(GAME_URL).origin;
const DASH_ORIGIN = "http://127.0.0.1:" + BASE_PORT;
const ROOT = path.join(__dirname, "..", "quan-ly-4-acc");
const AGENT_FILE = path.join(ROOT, "agent.js");
const DEBUG = process.env.VL_DEBUG === "1";

app.setName("Vo Lam Manager");
// Dữ liệu (phiên đăng nhập từng khung, cài đặt trang quản lý) lưu ở ~/.config/vo-lam-manager, trừ khi chạy với --user-data-dir
if (!app.commandLine.hasSwitch("user-data-dir")) app.setPath("userData", path.join(app.getPath("appData"), "vo-lam-manager"));
const ICON = path.join(__dirname, "icon.png");
let win = null;

const openExternal = (url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
};

// Cổng trang quản lý bị chương trình khác giữ (thường là bản chạy trong trình duyệt cũ) thì báo rõ rồi thoát, không mở nhầm trang của chương trình đó
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

function setupSlotSession(slot) {
  const ses = session.fromPartition("persist:acc" + slot);
  if (ses.__vlReady) return;
  ses.__vlReady = true;
  // Toàn bộ lưu lượng của khung đi qua cổng chuyển tiếp cục bộ của khung đó: có proxy (proxy.json) thì qua proxy, không thì nối thẳng
  ses.setProxy({ mode: "fixed_servers", proxyRules: "http://127.0.0.1:" + (FWD_BASE + slot) }).catch(() => {});
  const allow = new Set(["fullscreen", "clipboard-sanitized-write"]);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allow.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => allow.has(perm));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    title: "Võ Lâm Manager",
    backgroundColor: "#0e1412",
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-dash.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith(DASH_ORIGIN + "/")) {
      e.preventDefault();
      openExternal(url);
    }
  });
  // Chỉ cho gắn khung game đúng dạng: phiên persist:acc<số> và địa chỉ game; mọi thiết lập quyền của khung do đây quyết định, không do trang
  wc.on("will-attach-webview", (e, prefs, params) => {
    const m = /^persist:acc(\d{1,2})$/.exec(String(params.partition || ""));
    if (!m || !String(params.src || "").startsWith(GAME_ORIGIN + "/")) {
      e.preventDefault();
      return;
    }
    setupSlotSession(+m[1]);
    delete prefs.preloadURL;
    prefs.preload = path.join(__dirname, "preload-game.js");
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    prefs.autoplayPolicy = "no-user-gesture-required";
  });
  wc.on("did-fail-load", (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) {
      wc.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("<body style='background:#0e1412;color:#e6e0d0;font:16px sans-serif;padding:24px'>Không mở được trang quản lý (" + desc + "). Đóng ứng dụng rồi mở lại.</body>"));
    }
  });
  win.loadURL(DASH_ORIGIN + "/");
  win.on("closed", () => { win = null; });
}

// Khung game: không mở cửa sổ mới, không rời trang game (liên kết ngoài mở bằng trình duyệt của hệ thống)
app.on("web-contents-created", (_e, wc) => {
  if (wc.getType() !== "webview") return;
  wc.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith(GAME_ORIGIN + "/")) {
      e.preventDefault();
      openExternal(url);
    }
  });
  for (let k = 1; k <= SLOTS; k++) {
    if (session.fromPartition("persist:acc" + k) === wc.session) {
      slotWcs[k] = wc;
      wc.once("destroyed", () => { if (slotWcs[k] === wc) delete slotWcs[k]; });
      break;
    }
  }
  if (DEBUG) wc.on("console-message", (_ev, level, msg) => console.log("[game]", msg));
});

// --- Lưu tài khoản / mật khẩu từng khung và tự đăng nhập lại ---
// File credentials.json trong thư mục dữ liệu của ứng dụng (quyền 0600). Mật khẩu được mã hóa bằng kho khóa của hệ điều hành (safeStorage:
// libsecret / kwallet trên Linux, Keychain trên macOS, DPAPI trên Windows); máy không có kho khóa thì chỉ được che (base64), trang quản lý được báo để cảnh báo.
// Mật khẩu không bao giờ gửi sang trang quản lý: trang chỉ nhận tên tài khoản và các cờ. Chỉ main điền vào form đăng nhập của khung.
const CRED_FILE = () => path.join(app.getPath("userData"), "credentials.json");
const LOGIN_MAX_TRIES = 3; // số lần tự đăng nhập tối đa trong LOGIN_WINDOW_MS, quá thì tạm dừng LOGIN_PAUSE_MS (tránh lặp khi sai mật khẩu / bị game chặn)
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_PAUSE_MS = 30 * 60 * 1000;
let creds = {};
const loginState = {}; // slot -> { times: [], pausedUntil }
const slotWcs = {}; // slot -> webContents của khung đang chạy

function protectLevel() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return "none";
    const b = safeStorage.getSelectedStorageBackend ? safeStorage.getSelectedStorageBackend() : "";
    return b === "basic_text" ? "basic" : "keyring";
  } catch {
    return "none";
  }
}
function loadCreds() {
  try { creds = JSON.parse(fs.readFileSync(CRED_FILE(), "utf8")) || {}; } catch { creds = {}; }
}
function saveCreds() {
  fs.writeFileSync(CRED_FILE(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}
const encPw = (pw) => (protectLevel() === "none" ? { enc: false, p: Buffer.from(pw, "utf8").toString("base64") } : { enc: true, p: safeStorage.encryptString(pw).toString("base64") });
function decPw(c) {
  try {
    const buf = Buffer.from(c.p, "base64");
    return c.enc ? safeStorage.decryptString(buf) : buf.toString("utf8");
  } catch {
    return "";
  }
}
const credView = () => {
  const slots = {};
  for (const [k, c] of Object.entries(creds)) {
    const st = loginState[k] || {};
    slots[k] = { u: c.u, auto: c.auto !== false, paused: !!(st.pausedUntil && st.pausedUntil > Date.now()) };
  }
  return { protect: protectLevel(), slots };
};
const note = (text) => { if (win && !win.isDestroyed()) win.webContents.send("vl:note", text); };
const slotOf = (wc) => {
  for (const k of Object.keys(slotWcs)) if (slotWcs[k] === wc) return +k;
  return 0;
};

// Điền tài khoản + mật khẩu vào form đăng nhập của game (#ngU, #ngP) rồi bấm Đăng nhập (#ngIn), như bạn tự gõ
async function fillLogin(wc, c) {
  const pw = decPw(c);
  if (!pw) return "no-password";
  const code = "(" + (function (u, p) {
    const q = (s) => document.querySelector(s);
    const U = q("#ngU"), P = q("#ngP"), B = q("#ngIn");
    if (!U || !P || !B) return "no-form";
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set(U, u);
    set(P, p);
    B.click();
    return "ok";
  }).toString() + ")(" + JSON.stringify(c.u) + "," + JSON.stringify(pw) + ")";
  return wc.executeJavaScript(code);
}
// force = bạn bấm "Đăng nhập ngay": bỏ qua cờ tự động và giới hạn số lần
async function tryLogin(slot, force) {
  const c = creds[slot];
  const wc = slotWcs[slot];
  if (!c || !wc || wc.isDestroyed()) return "none";
  if (!String(wc.getURL()).startsWith(GAME_ORIGIN + "/")) return "off-site"; // chỉ điền vào trang game, không bao giờ vào trang khác
  const st = (loginState[slot] = loginState[slot] || { times: [], pausedUntil: 0 });
  const now = Date.now();
  if (!force) {
    if (c.auto === false) return "auto-off";
    if (st.pausedUntil > now) return "paused";
    st.times = st.times.filter((t) => now - t < LOGIN_WINDOW_MS);
    if (st.times.length >= LOGIN_MAX_TRIES) {
      st.pausedUntil = now + LOGIN_PAUSE_MS;
      note("Khung " + slot + ": đã tự đăng nhập " + LOGIN_MAX_TRIES + " lần trong 10 phút mà vẫn ở màn đăng nhập (sai mật khẩu, game chặn hoặc tự đăng xuất). Tạm dừng tự đăng nhập 30 phút. Kiểm tra lại ở nút 🔑.");
      return "paused";
    }
    st.times.push(now);
  } else {
    st.times = [];
    st.pausedUntil = 0;
  }
  let r = "error";
  try { r = await fillLogin(wc, c); } catch {}
  if (r === "ok") note("Khung " + slot + ": " + (force ? "đăng nhập" : "bị thoát ra màn đăng nhập, tự đăng nhập lại") + " tài khoản " + c.u);
  return r;
}
const fromDash = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
ipcMain.handle("vl:cred-info", (e) => (fromDash(e) ? credView() : { protect: "none", slots: {} }));
ipcMain.handle("vl:cred-set", (e, slot, u, pw, auto) => {
  if (!fromDash(e)) return { error: "forbidden" };
  slot = parseInt(slot, 10);
  u = String(u || "").trim();
  if (!(slot >= 1 && slot <= 50) || !u) return { error: "Nhập tên tài khoản" };
  const old = creds[slot];
  if (!pw && !(old && old.u === u)) return { error: "Nhập mật khẩu" };
  const rec = { u, auto: auto !== false };
  if (pw) Object.assign(rec, encPw(String(pw)));
  else { rec.p = old.p; rec.enc = old.enc; } // giữ mật khẩu đã lưu khi chỉ đổi cờ
  creds[slot] = rec;
  if (loginState[slot]) { loginState[slot].times = []; loginState[slot].pausedUntil = 0; }
  try { saveCreds(); } catch (err) { return { error: "Không lưu được: " + err.message }; }
  return credView();
});
ipcMain.handle("vl:cred-clear", (e, slot) => {
  if (!fromDash(e)) return { error: "forbidden" };
  delete creds[parseInt(slot, 10)];
  try { saveCreds(); } catch {}
  return credView();
});
ipcMain.handle("vl:cred-login", async (e, slot) => (fromDash(e) ? tryLogin(parseInt(slot, 10), true) : "forbidden"));
// Agent trong khung báo "đang ở màn đăng nhập, không ai gõ": đăng nhập lại nếu khung này có lưu tài khoản và đang bật tự đăng nhập
ipcMain.on("vl:login-screen", (e) => {
  if (e.sender.getType() !== "webview") return;
  const slot = slotOf(e.sender);
  if (slot) tryLogin(slot, false).catch(() => {});
});

ipcMain.on("vl:agent", (e) => {
  let src = "";
  try {
    if (e.sender.getType() === "webview") src = fs.readFileSync(AGENT_FILE, "utf8"); // đọc lại mỗi lần để bản cập nhật có hiệu lực ngay khi tải lại khung
  } catch {}
  e.returnValue = src;
});
ipcMain.handle("vl:relaunch", (e) => {
  if (!win || e.sender !== win.webContents) return;
  app.relaunch();
  app.exit(0);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    if (!(await portFree(BASE_PORT))) {
      dialog.showErrorBox("Võ Lâm Manager", "Cổng " + BASE_PORT + " đang bị chương trình khác dùng (có thể bản chạy trong trình duyệt vẫn đang mở).\nĐóng nó (hoặc tắt lệnh `node server.js` cũ) rồi mở lại ứng dụng.");
      app.quit();
      return;
    }
    loadCreds();
    require(path.join(ROOT, "server.js")); // máy chủ cục bộ ngay trong ứng dụng
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Ứng dụng", submenu: [{ role: "reload", label: "Tải lại cửa sổ" }, { role: "togglefullscreen", label: "Toàn màn hình" }, { type: "separator" }, { role: "quit", label: "Thoát" }] },
      { label: "Sửa", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    ]));
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}

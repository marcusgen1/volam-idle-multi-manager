// Ứng dụng desktop "Võ Lâm Manager" (Electron): một cửa sổ có thanh điều khiển bên trái và tối đa 5 khung game.
// Mỗi khung là một <webview> với phiên riêng (partition persist:acc<số>), tương đương một hồ sơ trình duyệt riêng:
// localStorage, sessionStorage, cookie và phiên đăng nhập không dùng chung giữa các khung, nên không còn chuyện tài khoản này đè lên tài khoản kia.
// Khung mở thẳng trang game chính thức (game bản mới không chạy qua máy chủ cục bộ nữa). Máy chủ cục bộ (quan-ly-4-acc/server.js) chạy ngay trong ứng dụng
// để phục vụ trang quản lý, lưu proxy và mở cổng chuyển tiếp proxy cho từng khung.
const { app, BrowserWindow, Menu, ipcMain, session, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

process.env.VL_APP = "1";
const BASE_PORT = parseInt(process.env.VL_BASE_PORT, 10) || 8800;
const FWD_BASE = BASE_PORT + 10;
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
  if (DEBUG) wc.on("console-message", (_ev, level, msg) => console.log("[game]", msg));
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
    require(path.join(ROOT, "server.js")); // máy chủ cục bộ ngay trong ứng dụng
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Ứng dụng", submenu: [{ role: "reload", label: "Tải lại cửa sổ" }, { role: "togglefullscreen", label: "Toàn màn hình" }, { type: "separator" }, { role: "quit", label: "Thoát" }] },
      { label: "Sửa", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    ]));
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}

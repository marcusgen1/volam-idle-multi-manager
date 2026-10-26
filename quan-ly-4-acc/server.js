// Máy chủ cục bộ cho trang quản lý nhiều cửa sổ game.
//  - http://127.0.0.1:8800/            : trang quản lý (app.html)
//  - http://127.0.0.1:8801 .. 88xx     : chuyển tiếp tới https://volamidle.pages.dev (mỗi khung một cổng, mặc định 5 cổng)
// Mỗi cổng là một origin riêng nên localStorage / sessionStorage của các khung tách biệt nhau.
// Chỉ lắng nghe trên 127.0.0.1 (chỉ máy bạn truy cập được).
// Nội dung chuyển tiếp không bị lưu lại. Điều duy nhất được thay đổi: trang HTML của game được chèn thêm
// một dòng <script src="/__agent.js"> (file agent.js cạnh server này) để trang quản lý điều khiển chế độ.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { parseProxy, describeProxy, openTunnel, openTls, ProxyAgent } = require("./tunnel");

const TARGET_HOST = "volamidle.pages.dev";
const BASE_PORT = 8800;
// Số cổng khung mở sẵn = số khung tối đa thêm được. Đổi bằng biến môi trường, ví dụ: VL_SLOTS=8 npm start
const SLOTS = Math.min(50, Math.max(1, parseInt(process.env.VL_SLOTS, 10) || 5));
const BIND = "127.0.0.1";
const AGENT_TAG = '<script src="/__agent.js"></script>';

const agent = new https.Agent({ keepAlive: true });

// --- Proxy riêng cho từng khung ---
// Lưu ở proxy.json cạnh server này (không đưa lên GitHub), dạng {"5": "socks5://user:pass@host:port"} (khóa = số khung = cổng - 8800).
// Khung có proxy: trang game, và mọi kết nối game gọi ra máy chủ *.volamidle.net (đăng nhập, dữ liệu, WebSocket) đều đi qua proxy,
// nên máy chủ game thấy IP của proxy. Khung không có proxy chạy như cũ.
const PROXY_FILE = path.join(__dirname, "proxy.json");
let proxyCfg = {};
try {
  proxyCfg = JSON.parse(fs.readFileSync(PROXY_FILE, "utf8")) || {};
} catch {}
for (const k of Object.keys(process.env)) {
  const m = k.match(/^VL_PROXY_(\d+)$/); // hoặc đặt bằng biến môi trường, ví dụ: VL_PROXY_5=socks5://host:port
  if (m && process.env[k]) proxyCfg[m[1]] = process.env[k];
}
// Tình trạng thực tế của proxy từng khung, ghi lại từ lưu lượng thật (trang quản lý đọc để hiện trạng thái)
const proxyStat = {};
const statOf = (slot) => (proxyStat[slot] = proxyStat[slot] || {});
const pxOk = (slot) => { if (proxyCfg[slot]) statOf(slot).okAt = Date.now(); };
const pxErr = (slot, e) => { if (proxyCfg[slot]) Object.assign(statOf(slot), { errAt: Date.now(), err: String((e && e.message) || e) }); };
const proxyAgents = new Map();
const proxyUrlOf = (slot) => (proxyCfg[slot] ? String(proxyCfg[slot]) : "");
function agentFor(slot) {
  const u = proxyUrlOf(slot);
  if (!u) return agent;
  if (!proxyAgents.has(u)) proxyAgents.set(u, new ProxyAgent(u));
  return proxyAgents.get(u);
}
// Chỉ cho đi qua proxy tới máy chủ của game (tránh cổng khung bị trang web khác lợi dụng làm proxy mở)
const PX_ALLOW = ["volamidle.net", "volamidle.pages.dev"].concat(String(process.env.VL_PX_ALLOW || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const allowedHost = (h) => { h = String(h).toLowerCase(); return PX_ALLOW.some((d) => h === d || h.endsWith("." + d)); };

function serveFile(res, file, type) {
  fs.readFile(path.join(__dirname, file), (err, buf) => {
    if (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Không đọc được " + file);
      return;
    }
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(buf);
  });
}

// Địa chỉ /sb/__px/<https|wss>/<host>/<đường dẫn>: trình duyệt của khung có proxy gửi kết nối tới máy chủ game vào đây (xem px-shim.js).
// Dùng tiền tố /sb/ vì service worker của game bỏ qua nó (không lưu cache các phản hồi này).
const PX_RE = /^\/sb\/__px\/(https?|wss?)\/([^/?]+)(\/[^]*)?$/;
function pxTarget(url, slot) {
  const m = PX_RE.exec(url);
  if (!m || !proxyUrlOf(slot)) return null;
  const [, scheme, hostport, rest] = m;
  const [host, port] = hostport.split(":");
  if (!allowedHost(host)) return null;
  const secure = scheme === "https" || scheme === "wss";
  return { host, port: parseInt(port, 10) || (secure ? 443 : 80), hostport, path: rest || "/", secure };
}

function pxForward(req, res, slot) {
  const t = pxTarget(req.url, slot);
  if (!t || !t.secure) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Không chuyển tiếp: khung chưa bật proxy hoặc máy chủ không thuộc game");
  }
  const headers = Object.assign({}, req.headers, { host: t.hostport });
  if (headers.origin) headers.origin = "https://" + TARGET_HOST;
  if (headers.referer) headers.referer = "https://" + TARGET_HOST + "/";
  const up = https.request({ host: t.host, port: t.port, method: req.method, path: t.path, headers, agent: agentFor(slot) }, (ur) => {
    pxOk(slot);
    res.writeHead(ur.statusCode, ur.headers);
    ur.pipe(res);
  });
  up.on("error", (e) => {
    pxErr(slot, e);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Lỗi proxy: " + e.message);
  });
  req.pipe(up);
}

// WebSocket qua proxy: dựng lại yêu cầu nâng cấp rồi nối thẳng hai đầu
function pxUpgrade(req, sock, head, slot) {
  const t = pxTarget(req.url, slot);
  if (!t) return sock.destroy();
  (t.secure ? openTls : openTunnel)(proxyUrlOf(slot), t.host, t.port).then(
    (up) => {
      pxOk(slot);
      let raw = "GET " + t.path + " HTTP/1.1\r\n";
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i], lk = k.toLowerCase();
        let v = req.rawHeaders[i + 1];
        if (lk === "host") v = t.hostport;
        else if (lk === "origin") v = "https://" + TARGET_HOST;
        raw += k + ": " + v + "\r\n";
      }
      up.write(raw + "\r\n");
      if (head && head.length) up.write(head);
      up.pipe(sock);
      sock.pipe(up);
      const end = () => { up.destroy(); sock.destroy(); };
      up.on("error", end); sock.on("error", end); up.on("close", end); sock.on("close", end);
    },
    (e) => { pxErr(slot, e); sock.destroy(); }
  );
}

function proxy(req, res, port) {
  const slot = port - BASE_PORT;
  if (req.url.split("?")[0] === "/__agent.js") {
    serveFile(res, "agent.js", "application/javascript; charset=utf-8");
    return;
  }
  if (req.url.split("?")[0] === "/__px.js") {
    serveFile(res, "px-shim.js", "application/javascript; charset=utf-8");
    return;
  }
  if (req.url.startsWith("/sb/__px/")) return pxForward(req, res, slot);
  const tag = proxyUrlOf(slot) ? '<script src="/__px.js"></script>' + AGENT_TAG : AGENT_TAG; // shim phải chạy trước mọi script của game

  const wantsHtml = String(req.headers.accept || "").includes("text/html");
  const headers = Object.assign({}, req.headers);
  headers.host = TARGET_HOST;
  if (headers.origin) headers.origin = "https://" + TARGET_HOST;
  if (headers.referer) headers.referer = "https://" + TARGET_HOST + "/";
  if (wantsHtml) delete headers["accept-encoding"]; // cần HTML không nén để chèn script

  const up = https.request(
    { host: TARGET_HOST, port: 443, method: req.method, path: req.url, headers, agent: agentFor(slot) },
    (ur) => {
      pxOk(slot);
      const h = Object.assign({}, ur.headers);
      if (h.location) {
        h.location = h.location.replace("https://" + TARGET_HOST, "http://" + BIND + ":" + port);
      }
      delete h["strict-transport-security"];

      const isHtml = String(h["content-type"] || "").includes("text/html");
      if (wantsHtml && isHtml && ur.statusCode === 200) {
        const chunks = [];
        ur.on("data", (c) => chunks.push(c));
        ur.on("end", () => {
          let html = Buffer.concat(chunks).toString("utf8");
          html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
          delete h["content-encoding"];
          h["content-length"] = Buffer.byteLength(html);
          res.writeHead(200, h);
          res.end(html);
        });
        return;
      }
      res.writeHead(ur.statusCode, h);
      ur.pipe(res);
    }
  );
  up.on("error", (e) => {
    pxErr(slot, e);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Không kết nối được tới game: " + e.message);
  });
  req.pipe(up);
}

// Các cổng khung đã mở được (1 = BASE_PORT + 1 ...). Trang quản lý hỏi số này để biết thêm được tối đa bao nhiêu khung.
const opened = new Set();
function usableSlots() {
  let n = 0;
  while (opened.has(n + 1)) n++; // chỉ đếm các cổng liền nhau từ cổng đầu tiên
  return n;
}

// --- Cập nhật từ GitHub ---
// Thư mục cha của quan-ly-4-acc là bản clone của repo. Máy chủ định kỳ "git fetch" xem có commit mới không;
// có thì trang quản lý hiện thanh thông báo, bấm "Cập nhật" mới chạy "git pull --ff-only".
// Không có git, hoặc thư mục không phải bản clone (tải zip) thì tính năng tự tắt, không ảnh hưởng gì khác.
const REPO_DIR = path.join(__dirname, "..");
const UPDATE_CHECK_MS = 3 * 60 * 60 * 1000; // 3 giờ kiểm tra một lần
const update = { supported: false, head: "", behind: 0, commits: [], dirty: false, checkedAt: 0, error: "", busy: false, applied: false, output: "" };

function git(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd: REPO_DIR, timeout: 60000, windowsHide: true, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) },
      (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(String(stdout).trim()))
    );
  });
}

async function checkUpdate() {
  if (update.busy) return;
  update.busy = true;
  try {
    update.supported = (await git(["rev-parse", "--is-inside-work-tree"])) === "true";
    if (!update.supported) return;
    await git(["fetch", "--quiet", "origin"]);
    const log = await git(["log", "--format=%s", "--max-count=5", "HEAD..@{u}"]);
    update.behind = parseInt(await git(["rev-list", "--count", "HEAD..@{u}"]), 10) || 0;
    update.commits = log ? log.split("\n") : [];
    update.dirty = (await git(["status", "--porcelain", "--untracked-files=no"])) !== "";
    update.head = await git(["rev-parse", "--short", "HEAD"]); // bản đang chạy (để báo "đang dùng bản mới nhất")
    update.error = "";
  } catch (e) {
    update.error = e.message.split("\n")[0];
    if (/ENOENT/.test(e.message)) update.supported = false; // chưa cài git
  } finally {
    update.checkedAt = Date.now();
    update.busy = false;
  }
}

async function applyUpdate() {
  if (update.busy || !update.supported || !update.behind) return;
  update.busy = true;
  try {
    update.output = await git(["pull", "--ff-only", "--quiet"]);
    update.applied = true;
    update.error = "";
  } catch (e) {
    update.error = e.message.split("\n")[0];
  } finally {
    update.busy = false;
  }
  await checkUpdate();
}

// Chỉ nhận lệnh ghi từ chính trang quản lý: header tự đặt buộc trình duyệt kiểm tra CORS (trang web khác không gọi được),
// kiểm tra thêm Host / Origin để chặn DNS rebinding.
function trusted(req) {
  const ok = new Set(["127.0.0.1:" + BASE_PORT, "localhost:" + BASE_PORT]);
  if (!ok.has(String(req.headers.host))) return false;
  if (req.headers.origin && !ok.has(String(req.headers.origin).replace(/^https?:\/\//, ""))) return false;
  return req.headers["x-vl"] === "1";
}

function updateApi(req, res, url) {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "GET") return send(200, update);
  if (req.method !== "POST" || !trusted(req)) return send(403, { error: "forbidden" });
  if (url === "/__update/check") checkUpdate().then(() => send(200, update));
  else if (url === "/__update/apply") applyUpdate().then(() => send(200, update));
  else send(404, { error: "not found" });
}

setTimeout(() => checkUpdate(), 5000);
setInterval(() => checkUpdate(), UPDATE_CHECK_MS).unref();

// --- API proxy từng khung (chỉ nhận từ trang quản lý) ---
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 4096) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

function proxyList() {
  const out = {};
  for (const k of Object.keys(proxyCfg)) {
    if (!proxyCfg[k]) continue;
    try { out[k] = describeProxy(proxyCfg[k]); } catch { out[k] = "(địa chỉ proxy hỏng)"; }
  }
  return out;
}

// Trả { ip, ms }: IP máy chủ game thấy và thời gian cả chuyến (gồm nối proxy + TLS)
const traceIp = (ag) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const r = https.request({ host: TARGET_HOST, path: "/cdn-cgi/trace", agent: ag, timeout: 20000 }, (ur) => {
      let b = "";
      ur.on("data", (c) => (b += c));
      ur.on("end", () => resolve({ ip: (b.match(/^ip=(.+)$/m) || [])[1] || "?", ms: Date.now() - t0 }));
    });
    r.on("timeout", () => r.destroy(new Error("Hết thời gian chờ")));
    r.on("error", reject);
    r.end();
  });

let directIp = { ip: "", at: 0 };
function proxyApi(req, res, url) {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "GET") return send(200, { slots: proxyList(), stat: proxyStat });
  if (req.method !== "POST" || !trusted(req)) return send(403, { error: "forbidden" });
  readBody(req).then(async (b) => {
    const slot = parseInt(b.slot, 10);
    if (!(slot >= 1 && slot <= SLOTS)) return send(400, { error: "Khung không hợp lệ" });
    if (url === "/__proxy/test") {
      if (!proxyUrlOf(slot)) return send(200, { error: "Khung này chưa đặt proxy" });
      try {
        // IP máy ít đổi nên giữ 10 phút, mỗi lần kiểm tra chỉ đi qua proxy
        if (!directIp.ip || Date.now() - directIp.at > 10 * 60 * 1000) directIp = { ip: (await traceIp(agent)).ip, at: Date.now() };
        const r = await traceIp(agentFor(slot));
        pxOk(slot);
        return send(200, { direct: directIp.ip, proxy: r.ip, ms: r.ms });
      } catch (e) {
        pxErr(slot, e);
        return send(200, { error: e.message });
      }
    }
    if (url !== "/__proxy") return send(404, { error: "not found" });
    const u = String(b.url || "").trim();
    if (u) {
      try { parseProxy(u); } catch (e) { return send(400, { error: e.message }); }
      proxyCfg[slot] = u;
    } else delete proxyCfg[slot];
    delete proxyStat[slot]; // đổi proxy thì bỏ tình trạng cũ
    try {
      fs.writeFileSync(PROXY_FILE, JSON.stringify(proxyCfg, null, 2), { mode: 0o600 });
    } catch (e) {
      return send(500, { error: "Không lưu được proxy.json: " + e.message });
    }
    send(200, { slots: proxyList() });
  });
}

function dashboard(req, res) {
  const url = req.url.split("?")[0];
  if (url.startsWith("/__proxy")) return proxyApi(req, res, url);
  if (url.startsWith("/__update")) {
    updateApi(req, res, url);
    return;
  }
  if (url === "/__config") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ base: BASE_PORT, max: usableSlots() }));
    return;
  }
  if (url !== "/" && url !== "/app.html") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Không có trang này");
    return;
  }
  serveFile(res, "app.html", "text/html; charset=utf-8");
}

const dash = http.createServer(dashboard);
dash.on("error", (e) => {
  console.error("Không mở được trang quản lý ở cổng " + BASE_PORT + ": " + e.message);
  process.exit(1); // không có trang quản lý thì không có gì để chạy
});
dash.listen(BASE_PORT, BIND, () => {
  console.log("Trang quản lý: http://" + BIND + ":" + BASE_PORT + "/");
});
for (let i = 1; i <= SLOTS; i++) {
  const port = BASE_PORT + i;
  const srv = http.createServer((req, res) => proxy(req, res, port));
  // Một cổng bị chương trình khác dùng thì chỉ bỏ cổng đó, các cổng còn lại vẫn chạy
  srv.on("upgrade", (req, sock, head) => pxUpgrade(req, sock, head, i));
  srv.on("error", (e) => console.error("Cổng " + port + " không dùng được (" + e.code + "), bỏ qua khung " + i));
  srv.listen(port, BIND, () => {
    opened.add(i);
    console.log("Khung " + i + " -> http://" + BIND + ":" + port + "/" + (proxyList()[i] ? "  (qua proxy " + proxyList()[i] + ")" : ""));
  });
}

// Máy chủ cục bộ cho trang quản lý nhiều cửa sổ game.
//  - http://127.0.0.1:8800/            : trang quản lý (app.html)
//  - http://127.0.0.1:8801 .. 88xx     : chuyển tiếp tới https://volamidle.pages.dev (mỗi khung một cổng, mặc định 12 cổng)
// Mỗi cổng là một origin riêng nên localStorage / sessionStorage của các khung tách biệt nhau.
// Chỉ lắng nghe trên 127.0.0.1 (chỉ máy bạn truy cập được).
// Nội dung chuyển tiếp không bị lưu lại. Điều duy nhất được thay đổi: trang HTML của game được chèn thêm
// một dòng <script src="/__agent.js"> (file agent.js cạnh server này) để trang quản lý điều khiển chế độ.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const TARGET_HOST = "volamidle.pages.dev";
const BASE_PORT = 8800;
// Số cổng khung mở sẵn = số khung tối đa thêm được. Đổi bằng biến môi trường, ví dụ: VL_SLOTS=8 npm start
const SLOTS = Math.min(50, Math.max(1, parseInt(process.env.VL_SLOTS, 10) || 12));
const BIND = "127.0.0.1";
const AGENT_TAG = '<script src="/__agent.js"></script>';

const agent = new https.Agent({ keepAlive: true });

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

function proxy(req, res, port) {
  if (req.url.split("?")[0] === "/__agent.js") {
    serveFile(res, "agent.js", "application/javascript; charset=utf-8");
    return;
  }

  const wantsHtml = String(req.headers.accept || "").includes("text/html");
  const headers = Object.assign({}, req.headers);
  headers.host = TARGET_HOST;
  if (headers.origin) headers.origin = "https://" + TARGET_HOST;
  if (headers.referer) headers.referer = "https://" + TARGET_HOST + "/";
  if (wantsHtml) delete headers["accept-encoding"]; // cần HTML không nén để chèn script

  const up = https.request(
    { host: TARGET_HOST, port: 443, method: req.method, path: req.url, headers, agent },
    (ur) => {
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
          html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + AGENT_TAG) : AGENT_TAG + html;
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
const update = { supported: false, behind: 0, commits: [], dirty: false, checkedAt: 0, error: "", busy: false, applied: false, output: "" };

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

function dashboard(req, res) {
  const url = req.url.split("?")[0];
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
  srv.on("error", (e) => console.error("Cổng " + port + " không dùng được (" + e.code + "), bỏ qua khung " + i));
  srv.listen(port, BIND, () => {
    opened.add(i);
    console.log("Khung " + i + " -> http://" + BIND + ":" + port + "/");
  });
}

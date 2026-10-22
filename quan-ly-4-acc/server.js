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

function dashboard(req, res) {
  const url = req.url.split("?")[0];
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

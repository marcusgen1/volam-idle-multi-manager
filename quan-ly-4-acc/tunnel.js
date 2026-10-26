// Mở kết nối TCP tới host:port thông qua một proxy HTTP (CONNECT) hoặc SOCKS5, rồi bọc TLS lên trên.
// Không dùng thư viện ngoài. Proxy dạng: http://[user:pass@]host:port  |  socks5://[user:pass@]host:port
// (Proxy MTProto của Telegram không dùng được ở đây: nó chỉ chạy cho ứng dụng Telegram.)
const net = require("net");
const tls = require("tls");
const https = require("https");

const TIMEOUT_MS = 15000;

function parseProxy(str) {
  let u;
  try {
    u = new URL(String(str).trim());
  } catch {
    throw new Error("Địa chỉ proxy không hợp lệ (cần dạng http://host:port hoặc socks5://host:port)");
  }
  const kind = u.protocol.replace(":", "");
  if (!["http", "socks5", "socks5h", "socks"].includes(kind)) throw new Error("Chỉ hỗ trợ proxy http:// và socks5://");
  if (!u.hostname) throw new Error("Thiếu địa chỉ máy chủ proxy");
  const port = parseInt(u.port, 10) || (kind === "http" ? 8080 : 1080);
  return {
    kind: kind === "http" ? "http" : "socks5",
    host: u.hostname.replace(/^\[|\]$/g, ""),
    port,
    user: decodeURIComponent(u.username || ""),
    pass: decodeURIComponent(u.password || ""),
  };
}

// Che mật khẩu khi hiển thị
function describeProxy(str) {
  const p = parseProxy(str);
  return p.kind + "://" + (p.user ? p.user + ":***@" : "") + p.host + ":" + p.port;
}

// Đọc đúng n byte từ socket (dùng cho bắt tay SOCKS5)
function reader(sock) {
  let buf = Buffer.alloc(0);
  let waiter = null;
  const onData = (d) => {
    buf = Buffer.concat([buf, d]);
    if (waiter && buf.length >= waiter.n) {
      const w = waiter;
      waiter = null;
      const out = buf.subarray(0, w.n);
      buf = buf.subarray(w.n);
      w.resolve(out);
    }
  };
  sock.on("data", onData);
  return {
    read: (n) =>
      new Promise((resolve, reject) => {
        if (buf.length >= n) {
          const out = buf.subarray(0, n);
          buf = buf.subarray(n);
          return resolve(out);
        }
        waiter = { n, resolve };
        sock.once("error", reject);
        sock.once("close", () => reject(new Error("Proxy đóng kết nối")));
      }),
    done: () => {
      sock.off("data", onData);
      return buf; // byte thừa (nếu có)
    },
  };
}

async function socks5(sock, p, host, port) {
  const r = reader(sock);
  const useAuth = !!(p.user || p.pass);
  sock.write(Buffer.from(useAuth ? [5, 2, 0, 2] : [5, 1, 0]));
  const sel = await r.read(2);
  if (sel[0] !== 5) throw new Error("Máy chủ này không phải proxy SOCKS5");
  if (sel[1] === 2) {
    const u = Buffer.from(p.user), w = Buffer.from(p.pass);
    sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([w.length]), w]));
    const ar = await r.read(2);
    if (ar[1] !== 0) throw new Error("Proxy từ chối tên đăng nhập / mật khẩu");
  } else if (sel[1] !== 0) {
    throw new Error("Proxy SOCKS5 yêu cầu kiểu xác thực không hỗ trợ");
  }
  const h = Buffer.from(host);
  sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, Buffer.from([port >> 8, port & 255])]));
  const head = await r.read(4);
  if (head[1] !== 0) {
    const why = { 1: "lỗi chung", 2: "bị chặn", 3: "mạng không tới được", 4: "không tới được máy chủ", 5: "bị từ chối", 6: "hết hạn", 7: "lệnh không hỗ trợ", 8: "địa chỉ không hỗ trợ" };
    throw new Error("Proxy SOCKS5 không kết nối được tới " + host + " (" + (why[head[1]] || "mã " + head[1]) + ")");
  }
  const rest = head[3] === 1 ? 4 + 2 : head[3] === 4 ? 16 + 2 : (await r.read(1))[0] + 2;
  await r.read(rest);
  r.done();
}

async function httpConnect(sock, p, host, port) {
  const auth = p.user || p.pass ? "Proxy-Authorization: Basic " + Buffer.from(p.user + ":" + p.pass).toString("base64") + "\r\n" : "";
  sock.write("CONNECT " + host + ":" + port + " HTTP/1.1\r\nHost: " + host + ":" + port + "\r\n" + auth + "\r\n");
  let buf = Buffer.alloc(0);
  await new Promise((resolve, reject) => {
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.includes("\r\n\r\n")) {
        sock.off("data", onData);
        resolve();
      } else if (buf.length > 16384) reject(new Error("Phản hồi proxy quá dài"));
    };
    sock.on("data", onData);
    sock.once("error", reject);
    sock.once("close", () => reject(new Error("Proxy đóng kết nối")));
  });
  const line = buf.toString("latin1").split("\r\n")[0];
  const code = parseInt((line.match(/^HTTP\/1\.\d (\d+)/) || [])[1], 10);
  if (code !== 200) throw new Error(code === 407 ? "Proxy từ chối tên đăng nhập / mật khẩu (407)" : "Proxy trả lỗi: " + line.slice(0, 80));
}

// Trả về socket TCP đã nối tới host:port qua proxy (chưa bọc TLS)
async function openTunnel(proxyUrl, host, port) {
  const p = parseProxy(proxyUrl);
  const sock = net.connect({ host: p.host, port: p.port });
  sock.setNoDelay(true);
  const timer = setTimeout(() => sock.destroy(new Error("Hết thời gian chờ proxy")), TIMEOUT_MS);
  try {
    await new Promise((resolve, reject) => {
      sock.once("connect", resolve);
      sock.once("error", reject);
    });
    if (p.kind === "http") await httpConnect(sock, p, host, port);
    else await socks5(sock, p, host, port);
    return sock;
  } catch (e) {
    sock.destroy();
    throw new Error(/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/.test(e.code || "") ? "Không nối được tới proxy " + p.host + ":" + p.port + " (" + e.code + ")" : e.message);
  } finally {
    clearTimeout(timer);
  }
}

async function openTls(proxyUrl, host, port) {
  const raw = await openTunnel(proxyUrl, host, port);
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket: raw, servername: host, ALPNProtocols: ["http/1.1"] });
    t.once("secureConnect", () => resolve(t));
    t.once("error", reject);
  });
}

// https.Agent đi qua proxy (dùng cho https.request / fetch phía máy chủ)
class ProxyAgent extends https.Agent {
  constructor(proxyUrl) {
    super({ keepAlive: true });
    this.proxyUrl = proxyUrl;
  }
  createConnection(opts, cb) {
    openTls(this.proxyUrl, opts.host || opts.hostname, parseInt(opts.port, 10) || 443).then((s) => cb(null, s), (e) => cb(e));
  }
}

module.exports = { parseProxy, describeProxy, openTunnel, openTls, ProxyAgent };

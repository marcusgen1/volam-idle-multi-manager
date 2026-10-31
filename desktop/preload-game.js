// Preload của mỗi khung game (<webview> có phiên riêng): nạp agent.js vào trang game và tạo cầu nối với trang quản lý.
// Cầu nối __vlBridge thay cho postMessage giữa khung và trang cha mà agent dùng khi chạy trong trình duyệt.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

contextBridge.exposeInMainWorld("__vlBridge", {
  post: (m) => ipcRenderer.sendToHost("vl", m),
  on: (cb) => ipcRenderer.on("vl", (_e, m) => cb(m)),
  loginScreen: () => ipcRenderer.send("vl:login-screen"),
});
// Trong khung nhúng, outerWidth / outerHeight của trang là cỡ cả cửa sổ ứng dụng chứ không phải cỡ khung, nên lệch với innerWidth / innerHeight rất xa.
// Game dùng độ lệch này để đoán DevTools đang mở (và ghi cờ "f12" lên máy chủ), mà ứng dụng không có DevTools. Cho hai giá trị bằng đúng cỡ khung
// để không báo nhầm; không đụng tới bất kỳ phép kiểm tra nào khác của game.
webFrame
  .executeJavaScript(
    "Object.defineProperty(window,'outerWidth',{configurable:true,get:()=>window.innerWidth});" +
      "Object.defineProperty(window,'outerHeight',{configurable:true,get:()=>window.innerHeight});"
  )
  .catch(() => {});
const src = ipcRenderer.sendSync("vl:agent");
if (src) webFrame.executeJavaScript(src).catch((e) => console.error("agent.js lỗi:", e && e.message));

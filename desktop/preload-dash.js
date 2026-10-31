// Preload của cửa sổ chính (trang quản lý): chỉ lộ ra cho trang đúng một thứ, cờ "đang chạy trong ứng dụng" và lệnh khởi động lại ứng dụng.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vlApp", {
  app: true,
  relaunch: () => ipcRenderer.invoke("vl:relaunch"),
  // Tài khoản / mật khẩu từng khung: mật khẩu chỉ đi một chiều (trang -> ứng dụng), không bao giờ trả lại cho trang
  cred: {
    info: () => ipcRenderer.invoke("vl:cred-info"),
    set: (slot, u, p, auto) => ipcRenderer.invoke("vl:cred-set", slot, u, p, auto),
    clear: (slot) => ipcRenderer.invoke("vl:cred-clear", slot),
    login: (slot) => ipcRenderer.invoke("vl:cred-login", slot),
  },
  onNote: (cb) => ipcRenderer.on("vl:note", (_e, t) => cb(String(t))),
});

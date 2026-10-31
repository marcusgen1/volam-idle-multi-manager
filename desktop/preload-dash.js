// Preload của cửa sổ chính (trang quản lý): chỉ lộ ra cho trang đúng một thứ, cờ "đang chạy trong ứng dụng" và lệnh khởi động lại ứng dụng.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vlApp", {
  app: true,
  relaunch: () => ipcRenderer.invoke("vl:relaunch"),
});

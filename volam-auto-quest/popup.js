const box = document.getElementById("on");
const st = document.getElementById("st");

function render(on) {
  box.checked = on;
  st.textContent = on ? "Đang BẬT" : "Đang TẮT";
}

chrome.storage.local.get({ enabled: true }, (r) => render(r.enabled));
box.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: box.checked });
  render(box.checked);
});

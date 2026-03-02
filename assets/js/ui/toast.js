/**
 * SIE 2028  ui/toast.js
 */
let _timer = null;

export function toast(msg, duration = 3500) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_timer);
  _timer = setTimeout(() => el.classList.remove("show"), duration);
}

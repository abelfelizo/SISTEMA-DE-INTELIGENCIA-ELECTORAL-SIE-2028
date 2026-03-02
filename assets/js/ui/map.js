/**
 * SIE 2028 — ui/map.js
 * Carga SVG, gestiona zoom/pan, dispara onSelect(provId:"01") al click.
 * SVG IDs esperados: "DO-01" … "DO-32"
 * provId extraído: los dos dígitos del ID ("DO-01" → "01")
 */
import { clamp } from "../core/utils.js";
import { toast } from "./toast.js";

export function initMap({ containerId, svgUrl, onSelect, onReady }) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return null;

  wrap.innerHTML = `<div class="map-loading">Cargando mapa…</div>`;

  let svg = null;
  let shapes = [];
  let selected = null;
  let s = { scale: 1, tx: 0, ty: 0, vb: null, dragging: false, px: 0, py: 0 };

  function applyTransform() {
    if (!svg || !s.vb) return;
    const w = s.vb.w / s.scale;
    const h = s.vb.h / s.scale;
    svg.setAttribute("viewBox", `${s.vb.x + s.tx} ${s.vb.y + s.ty} ${w} ${h}`);
  }

  function zoom(delta) {
    if (!s.vb) return;
    const prev = s.scale;
    s.scale = clamp(s.scale * (delta > 0 ? 1.15 : 0.87), 1, 8);
    const dw = (s.vb.w / prev) - (s.vb.w / s.scale);
    const dh = (s.vb.h / prev) - (s.vb.h / s.scale);
    s.tx += dw / 2;
    s.ty += dh / 2;
    applyTransform();
  }

  function reset() {
    s.scale = 1; s.tx = 0; s.ty = 0;
    applyTransform();
  }

  /** Resalta una provincia por ID ("01") */
  function highlight(provId) {
    shapes.forEach(el => el.classList.remove("map-selected"));
    if (!provId) { selected = null; return; }
    const el = svg?.querySelector(`[id="DO-${provId}"]`);
    if (el) { el.classList.add("map-selected"); selected = provId; }
  }

  fetch(svgUrl)
    .then(r => { if (!r.ok) throw new Error(`SVG ${r.status}`); return r.text(); })
    .then(svgText => {
      wrap.innerHTML = svgText;
      svg = wrap.querySelector("svg");
      if (!svg) throw new Error("SVG inválido");

      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.width  = "100%";
      svg.style.height = "100%";

      if (!svg.getAttribute("viewBox")) {
        const w = svg.getAttribute("width")  || 800;
        const h = svg.getAttribute("height") || 600;
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      }
      const vb = svg.getAttribute("viewBox").split(/\s+/).map(Number);
      s.vb = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };

      // Shapes con ID "DO-NN"
      shapes = [...svg.querySelectorAll("[id^='DO-']")];
      shapes.forEach(el => {
        el.classList.add("map-shape");
        el.addEventListener("click", e => {
          e.stopPropagation();
          const raw = el.getAttribute("id") || "";        // "DO-01"
          const provId = raw.replace(/^DO-/, "");         // "01"
          highlight(provId);
          onSelect?.(provId);
        });
      });

      // Zoom con rueda
      wrap.addEventListener("wheel", e => {
        e.preventDefault();
        zoom(-e.deltaY);
      }, { passive: false });

      // Pan
      wrap.addEventListener("pointerdown", e => {
        s.dragging = true; s.px = e.clientX; s.py = e.clientY;
        wrap.setPointerCapture(e.pointerId);
      });
      wrap.addEventListener("pointermove", e => {
        if (!s.dragging || !s.vb) return;
        const w = s.vb.w / s.scale;
        const h = s.vb.h / s.scale;
        s.tx -= (e.clientX - s.px) * (w / wrap.clientWidth);
        s.ty -= (e.clientY - s.py) * (h / wrap.clientHeight);
        s.px = e.clientX; s.py = e.clientY;
        applyTransform();
      });
      wrap.addEventListener("pointerup",     () => { s.dragging = false; });
      wrap.addEventListener("pointercancel", () => { s.dragging = false; });

      onReady?.({ highlight });
    })
    .catch(err => {
      wrap.innerHTML = `<div class="map-error">Error cargando mapa: ${err.message}</div>`;
      toast("Error cargando mapa: " + err.message);
    });

  // API pública — funciona aunque SVG aún no haya cargado
  return {
    zoomIn:    () => zoom(1),
    zoomOut:   () => zoom(-1),
    reset,
    highlight,
  };
}

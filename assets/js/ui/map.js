/**
 * SIE 2028 -- ui/map.js  (H4)
 * SVG interactivo. Zoom/pan. Seleccion multiple (click-through).
 * onSelect(provId: "01".."32") se dispara en cada click.
 * Log en consola si SVG ID no tiene match en datos.
 */

export function initMap(opts) {
  var containerId = opts.containerId;
  var svgUrl      = opts.svgUrl;
  var onSelect    = opts.onSelect;
  var onReady     = opts.onReady;

  var container = document.getElementById(containerId);
  if (!container) return null;

  var svg    = null;
  var shapes = [];
  var selected = null;
  var scale  = 1;
  var tx = 0, ty = 0;
  var dragging = false;
  var dragStart = { x:0, y:0, tx:0, ty:0 };

  // Cargar SVG via fetch e insertarlo inline
  fetch(svgUrl)
    .then(function(r) { return r.text(); })
    .then(function(text) {
      container.innerHTML = text;
      svg = container.querySelector("svg");
      if (!svg) { console.error("[Mapa] SVG no encontrado en", svgUrl); return; }

      svg.style.width  = "100%";
      svg.style.height = "100%";
      svg.style.cursor = "grab";
      applyTransform();

      // Recoger shapes con ID "DO-NN"
      shapes = Array.from(svg.querySelectorAll("[id^='DO-']"));
      console.log("[Mapa] " + shapes.length + " provincias en SVG");

      // Aplicar estilos base
      shapes.forEach(function(sh) {
        sh.style.cursor = "pointer";
        sh.style.transition = "opacity 0.15s, stroke-width 0.15s";
        sh.style.stroke = "var(--bg)";
        sh.style.strokeWidth = "1";
      });

      // Click handler -- NO bloquea tras primer click
      svg.addEventListener("click", function(e) {
        var target = e.target.closest("[id^='DO-']");
        if (!target) return;

        var raw    = target.getAttribute("id") || "";
        var provId = raw.replace(/^DO-/, "");

        // Remover active anterior
        shapes.forEach(function(sh) {
          sh.classList.remove("map-selected");
          sh.style.strokeWidth = "1";
        });

        // Activar nuevo
        target.classList.add("map-selected");
        target.style.strokeWidth = "2.5";
        target.style.stroke = "#fff";
        selected = provId;

        if (typeof onSelect === "function") onSelect(provId);
      });

      // Zoom con rueda
      svg.addEventListener("wheel", function(e) {
        e.preventDefault();
        var factor = e.deltaY < 0 ? 1.15 : 0.87;
        scale = Math.min(8, Math.max(0.5, scale * factor));
        applyTransform();
      }, { passive: false });

      // Pan
      container.addEventListener("pointerdown", function(e) {
        if (e.target.closest("[id^='DO-']")) return; // clicks en provincias no inician pan
        dragging = true;
        dragStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
        svg.style.cursor = "grabbing";
        container.setPointerCapture(e.pointerId);
      });
      container.addEventListener("pointermove", function(e) {
        if (!dragging) return;
        tx = dragStart.tx + (e.clientX - dragStart.x);
        ty = dragStart.ty + (e.clientY - dragStart.y);
        applyTransform();
      });
      container.addEventListener("pointerup", function() {
        dragging = false;
        svg.style.cursor = "grab";
      });

      if (typeof onReady === "function") onReady();
    })
    .catch(function(e) { console.error("[Mapa] Error cargando SVG:", e); });

  function applyTransform() {
    if (!svg) return;
    svg.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
    svg.style.transformOrigin = "center center";
  }

  function highlight(provId) {
    shapes.forEach(function(sh) {
      sh.classList.remove("map-selected");
      sh.style.strokeWidth = "1";
    });
    if (!provId) { selected = null; return; }
    var target = svg ? svg.querySelector("[id='DO-" + provId + "']") : null;
    if (target) {
      target.classList.add("map-selected");
      target.style.strokeWidth = "2.5";
      target.style.stroke = "#fff";
      selected = provId;
    } else {
      console.warn("[Mapa] Sin match SVG para provId:", provId);
    }
  }

  // Validar que los IDs del SVG tienen match con datos (llamar tras onReady)
  function validateMatches(dataKeys) {
    if (!svg) return;
    var svgIds = shapes.map(function(sh) { return sh.getAttribute("id").replace(/^DO-/, ""); });
    var missing = svgIds.filter(function(id) { return dataKeys.indexOf(id) === -1; });
    var extra   = dataKeys.filter(function(id) { return svgIds.indexOf(id) === -1; });
    if (missing.length) console.warn("[Mapa] SVG sin datos:", missing);
    if (extra.length)   console.warn("[Mapa] Datos sin SVG:", extra);
    if (!missing.length && !extra.length) console.log("[Mapa] SVG<->datos: todos los IDs coinciden OK");
  }

  return {
    zoomIn:    function() { scale = Math.min(8, scale * 1.2); applyTransform(); },
    zoomOut:   function() { scale = Math.max(0.5, scale * 0.83); applyTransform(); },
    reset:     function() { scale = 1; tx = 0; ty = 0; applyTransform(); highlight(null); },
    highlight: highlight,
    validate:  validateMatches,
    getSelected: function() { return selected; },
  };
}

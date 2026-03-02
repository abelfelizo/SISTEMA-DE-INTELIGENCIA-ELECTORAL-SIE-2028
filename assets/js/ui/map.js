
import {clamp} from "../core/utils.js";
import {toast} from "./toast.js";

export function initMap({containerId, svgUrl, onSelect}){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  const svgHost = document.createElement("div");
  svgHost.style.width = "100%";
  svgHost.style.height = "100%";
  svgHost.style.touchAction = "none";
  wrap.appendChild(svgHost);

  let state = {scale:1, tx:0, ty:0, dragging:false, px:0, py:0, vb:null};

  fetch(svgUrl, {cache:"no-store"})
    .then(r=>r.text())
    .then(svgText=>{
      svgHost.innerHTML = svgText;
      const svg = svgHost.querySelector("svg");
      if(!svg) throw new Error("SVG inválido");
      svg.setAttribute("preserveAspectRatio","xMidYMid meet");
      svg.style.width = "100%";
      svg.style.height = "100%";
      // initial viewBox
      if(!svg.getAttribute("viewBox")){
        const w = svg.getAttribute("width") || 1000;
        const h = svg.getAttribute("height") || 600;
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      }
      const vb = svg.getAttribute("viewBox").split(/\s+/).map(Number);
      state.vb = {x:vb[0], y:vb[1], w:vb[2], h:vb[3]};
      // group all paths for easy hit
      const shapes = svg.querySelectorAll("[id^='DO-'],[id^='DO']");
      shapes.forEach(el=>{
        // default style (SVG default fill is black; we need contrast)
        try{
          el.style.fill = "rgba(255,255,255,.10)";
          el.style.stroke = "rgba(255,255,255,.28)";
          el.style.strokeWidth = "1";
        }catch(e){}

        el.style.cursor="pointer";
        el.style.transition="filter .15s, opacity .15s";
        el.addEventListener("mouseenter",()=>{ el.style.opacity="0.85"; });
        el.addEventListener("mouseleave",()=>{ el.style.opacity="1"; });
        el.addEventListener("click",(e)=>{
          e.stopPropagation();
          shapes.forEach(s=>s.style.filter="");
          el.style.filter="drop-shadow(0 0 6px rgba(77,163,255,.65))";
          const id = el.getAttribute("id") || "";
          onSelect?.(id);
        });
      });

      // apply transform via viewBox manipulation for better compatibility
      function apply(){
        const s = state.scale;
        const vb0 = state.vb;
        const w = vb0.w / s;
        const h = vb0.h / s;
        const x = vb0.x + state.tx;
        const y = vb0.y + state.ty;
        svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
      }

      function zoom(delta, cx, cy){
        const prev = state.scale;
        state.scale = clamp(state.scale * (delta>0 ? 1.12 : 0.89), 1, 6);
        // keep center stable by adjusting translation
        const vb0 = state.vb;
        const wPrev = vb0.w / prev, hPrev = vb0.h / prev;
        const wNew  = vb0.w / state.scale, hNew = vb0.h / state.scale;
        // naive: shift so that zoom is around center of current view
        state.tx += (wPrev - wNew)/2;
        state.ty += (hPrev - hNew)/2;
        apply();
      }

      svgHost.addEventListener("wheel",(e)=>{
        e.preventDefault();
        zoom(e.deltaY, e.clientX, e.clientY);
      }, {passive:false});

      svgHost.addEventListener("pointerdown",(e)=>{
        state.dragging=true;
        state.px=e.clientX; state.py=e.clientY;
        svgHost.setPointerCapture(e.pointerId);
      });
      svgHost.addEventListener("pointermove",(e)=>{
        if(!state.dragging) return;
        const dx = (e.clientX - state.px);
        const dy = (e.clientY - state.py);
        state.px = e.clientX; state.py = e.clientY;
        // translate in viewBox units
        const vb0 = state.vb;
        const w = vb0.w / state.scale;
        const h = vb0.h / state.scale;
        state.tx -= dx * (w / svgHost.clientWidth);
        state.ty -= dy * (h / svgHost.clientHeight);
        apply();
      });
      svgHost.addEventListener("pointerup",(e)=>{
        state.dragging=false;
      });
      svgHost.addEventListener("pointercancel",()=>state.dragging=false);

      // expose controls
      return {zoomIn:()=>zoom(-1), zoomOut:()=>zoom(1), reset:()=>{
        state.scale=1; state.tx=0; state.ty=0; apply();
      }};
    })
    .then(api=>{
      wrap.__mapApi = api;
    })
    .catch(err=>{
      toast("Error cargando mapa: " + err.message);
    });

  return {
    zoomIn:()=>wrap.__mapApi?.zoomIn?.(),
    zoomOut:()=>wrap.__mapApi?.zoomOut?.(),
    reset:()=>wrap.__mapApi?.reset?.()
  };
}

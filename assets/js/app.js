/**
 * SIE 2028 — app.js  (H3)
 * Boot único. Router. Estado global. 8 rutas + export PDF.
 */
import { loadCTX }         from "./core/data.js";
import { state }           from "./core/state.js";
import { toast }           from "./ui/toast.js";
import { mountGlobalControls,
         renderDashboard,
         renderMapa,
         renderSimulador,
         renderPotencial,
         renderMovilizacion,
         renderObjetivo,
         renderAuditoria,
         renderBoleta,
         exportarPDF }     from "./ui/views.js";

const ROUTES = [
  { id:"dashboard",    label:"Dashboard",    fn: renderDashboard    },
  { id:"mapa",         label:"Mapa",         fn: renderMapa         },
  { id:"simulador",    label:"Simulador",    fn: renderSimulador    },
  { id:"potencial",    label:"Potencial",    fn: renderPotencial    },
  { id:"movilizacion", label:"Movilización", fn: renderMovilizacion },
  { id:"objetivo",     label:"Objetivo",     fn: renderObjetivo     },
  { id:"boleta",       label:"Boleta única", fn: renderBoleta       },
  { id:"auditoria",    label:"Auditoría",    fn: renderAuditoria    },
];

let ctx=null, currentRoute="dashboard", rendering=false;

async function render(routeId) {
  if (rendering) return;
  rendering = true;
  try {
    if (!ctx) {
      document.getElementById("view").innerHTML=`<div class="loading">Cargando datos…</div>`;
      ctx = await loadCTX();
    }
    currentRoute = routeId;
    document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.route===routeId));
    history.replaceState({},"","#"+routeId);
    const route = ROUTES.find(r=>r.id===routeId)||ROUTES[0];
    route.fn(state, ctx);
    // Mostrar botón export
    const expBtn = document.getElementById("btn-export");
    if (expBtn) expBtn.style.display = ["dashboard","simulador","auditoria"].includes(routeId) ? "" : "none";
  } catch(e) {
    console.error("[SIE]",e);
    toast("Error: "+e.message);
    document.getElementById("view").innerHTML=`<div class="error-msg">Error: ${e.message}</div>`;
  } finally { rendering=false; }
}

function initTheme() {
  const saved = localStorage.getItem("sie28-theme")||"dark";
  document.documentElement.setAttribute("data-theme",saved);
  const btn = document.getElementById("btn-theme");
  if(!btn) return;
  btn.textContent = saved==="dark"?"☀️":"🌙";
  btn.addEventListener("click",()=>{
    const cur=document.documentElement.getAttribute("data-theme");
    const next=cur==="dark"?"light":"dark";
    document.documentElement.setAttribute("data-theme",next);
    localStorage.setItem("sie28-theme",next);
    btn.textContent=next==="dark"?"☀️":"🌙";
  });
}

function boot() {
  initTheme();
  const nav=document.getElementById("nav");
  nav.innerHTML=ROUTES.map(r=>`<button class="nav-btn" data-route="${r.id}">${r.label}</button>`).join("");
  nav.addEventListener("click",e=>{const btn=e.target.closest(".nav-btn");if(btn)render(btn.dataset.route);});
  mountGlobalControls(state);
  state.recomputeAndRender=()=>render(currentRoute);

  // Export PDF button
  const expBtn = document.getElementById("btn-export");
  if (expBtn) {
    expBtn.style.display = "none";
    expBtn.addEventListener("click",()=>exportarPDF(ctx, state));
  }

  const initial=location.hash.replace("#","")||"dashboard";
  render(ROUTES.find(r=>r.id===initial)?initial:"dashboard");
  window.addEventListener("hashchange",()=>{const id=location.hash.replace("#","");if(id&&id!==currentRoute)render(id);});
}

window.addEventListener("DOMContentLoaded",boot);

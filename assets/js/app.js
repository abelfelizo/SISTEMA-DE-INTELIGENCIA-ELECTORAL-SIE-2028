
import {initMap} from "./ui/map.js";
import {renderDashboard, renderMapa, renderEncuestas, renderSimulador, renderPotencial, renderMovilizacion, renderObjetivo} from "./ui/views.js";
import {toast} from "./ui/toast.js";

const state = {
  // Global defaults (master switch)
  global: {
    corte: localStorage.getItem("sie-global-corte") || "Base 2024",
    nivel: localStorage.getItem("sie-global-nivel") || "dip", // pres|sen|dip|mun|dm
  },
  // Per-module overrides
  overrides: JSON.parse(localStorage.getItem("sie-module-overrides") || "{}"),
  // Back-compat (previous code used modoTerritorial)
  get modoTerritorial(){ return this.global.corte; },
  set modoTerritorial(v){ this.setGlobalCorte(v); },

  setGlobalNivel(n){
    this.global.nivel = n;
    localStorage.setItem("sie-global-nivel", n);
  },
  setGlobalCorte(c){
    this.global.corte = c;
    localStorage.setItem("sie-global-corte", c);
  },
  setOverride(moduleId, patch){
    const cur = this.overrides[moduleId] || {enabled:false, nivel:null, corte:null};
    this.overrides[moduleId] = {...cur, ...patch};
    localStorage.setItem("sie-module-overrides", JSON.stringify(this.overrides));
  },
  getEffective(moduleId){
    const o = this.overrides[moduleId];
    if(o && o.enabled){
      return {
        nivel: o.nivel || this.global.nivel,
        corte: o.corte || this.global.corte,
        override: true
      };
    }
    return {nivel:this.global.nivel, corte:this.global.corte, override:false};
  },
  recomputeAndRender(){ /* bound in boot */ }
};


const mapApi = {
  _api: null,
  load(svgUrl, onSelect){
    this._api = initMap({containerId:"map-container", svgUrl, onSelect});
  },
  zoomIn(){ this._api?.zoomIn?.(); },
  zoomOut(){ this._api?.zoomOut?.(); },
  reset(){ this._api?.reset?.(); },
};

let currentRouteId = 'dashboard';

const routes = [
  {id:"dashboard", label:"Dashboard", render: ()=>renderDashboard(state,"dashboard")},
  {id:"mapa", label:"Mapa", render: ()=>renderMapa(state, mapApi,"mapa")},
  {id:"simulador", label:"Simulador", render: ()=>renderSimulador(state,"simulador")},
  {id:"potencial", label:"Potencial", render: ()=>renderPotencial(state,"potencial")},
  {id:"movilizacion", label:"Movilización", render: ()=>renderMovilizacion(state,"movilizacion")},
  {id:"objetivo", label:"Objetivo", render: ()=>renderObjetivo(state,"objetivo")},
  {id:"encuestas", label:"Encuestas", render: ()=>renderEncuestas(state,"encuestas")},
];

function setActive(routeId){
  currentRouteId = routeId;
  document.querySelectorAll(".nav button").forEach(b=>{
    b.classList.toggle("active", b.dataset.route===routeId);
  });
  const r = routes.find(x=>x.id===routeId) || routes[0];
  history.replaceState({}, "", "#"+r.id);
  r.render().catch(e=>toast("Error: "+e.message));
}

function boot(){
  const nav = document.getElementById("nav");
  nav.innerHTML = routes.map(r=>`<button data-route="${r.id}">${r.label}</button>`).join("");
  nav.addEventListener("click",(e)=>{
    const btn = e.target.closest("button[data-route]");
    if(!btn) return;
    setActive(btn.dataset.route);
  });
  const initial = location.hash?.replace("#","") || "dashboard";
  setActive(initial);

  state.recomputeAndRender = ()=>setActive(currentRouteId);

  // Inject global selectors in the topbar
  const topRight = document.querySelector(".topbar-right");
  if(topRight && !document.getElementById("global-nivel")){
    const wrap = document.createElement("div");
    wrap.className = "global-controls";
    wrap.style.display = "inline-flex";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";
    wrap.innerHTML = `
      <select id="global-corte" class="select-sm" title="Corte global">
        <option value="Febrero 2024">Febrero 2024</option>
        <option value="Mayo 2024">Mayo 2024</option>
        <option value="Base 2024">Base 2024</option>
        <option value="Proyección 2028">Proyección 2028</option>
      </select>
      <select id="global-nivel" class="select-sm" title="Nivel global">
        <option value="pres">Presidencial</option>
        <option value="sen">Senadores</option>
        <option value="dip">Diputados</option>
        <option value="mun">Alcaldes</option>
        <option value="dm">DM</option>
      </select>
    `;
    // Insert before theme toggle
    const themeBtn = document.getElementById("theme-toggle");
    topRight.insertBefore(wrap, themeBtn || topRight.firstChild);

    const selC = document.getElementById("global-corte");
    const selN = document.getElementById("global-nivel");
    selC.value = state.global.corte;
    selN.value = state.global.nivel;

    selC.addEventListener("change", ()=>{
      state.setGlobalCorte(selC.value);
      state.recomputeAndRender();
    });
    selN.addEventListener("change", ()=>{
      state.setGlobalNivel(selN.value);
      state.recomputeAndRender();
    });
  }

}

window.addEventListener("DOMContentLoaded", boot);

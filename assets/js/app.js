
import {initMap} from "./ui/map.js";
import {renderDashboard, renderMapa, renderEncuestas, renderSimulador, renderPotencial, renderMovilizacion, renderObjetivo} from "./ui/views.js";
import {toast} from "./ui/toast.js";

const state = {
  modoTerritorial: "Base 2024",
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

const routes = [
  {id:"dashboard", label:"Dashboard", render: ()=>renderDashboard(state)},
  {id:"mapa", label:"Mapa", render: ()=>renderMapa(state, mapApi)},
  {id:"simulador", label:"Simulador", render: ()=>renderSimulador(state)},
  {id:"potencial", label:"Potencial", render: ()=>renderPotencial(state)},
  {id:"movilizacion", label:"Movilización", render: ()=>renderMovilizacion(state)},
  {id:"objetivo", label:"Objetivo", render: ()=>renderObjetivo(state)},
  {id:"encuestas", label:"Encuestas", render: ()=>renderEncuestas(state)},
];

function setActive(routeId){
  document.querySelectorAll(".nav button").forEach(b=>{
    b.classList.toggle("active", b.dataset.route===routeId);
  });
  const r = routes.find(x=>x.id===routeId) || routes[0];
  history.replaceState({}, "", "#"+r.id);
  Promise.resolve(r.render()).catch(e=>toast("Error: "+e.message));
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
}

window.addEventListener("DOMContentLoaded", boot);

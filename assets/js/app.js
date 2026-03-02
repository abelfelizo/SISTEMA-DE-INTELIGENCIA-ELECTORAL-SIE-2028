import { loadState, setState } from "./core/state.js";
import { getCTX } from "./core/data.js";
import { getHashView, onRouteChange } from "./ui/router.js";

import { renderDashboard } from "./ui/views/dashboard.js";
import { renderMapa } from "./ui/views/mapa.js";
import { renderSimulador } from "./ui/views/simulador.js";
import { renderPotencial } from "./ui/views/potencial.js";
import { renderMovilizacion } from "./ui/views/movilizacion.js";
import { renderObjetivo } from "./ui/views/objetivo.js";
import { renderAuditoria } from "./ui/views/auditoria.js";

const VIEW_RENDERERS = { dashboard:renderDashboard, mapa:renderMapa, simulador:renderSimulador, potencial:renderPotencial, movilizacion:renderMovilizacion, objetivo:renderObjetivo, auditoria:renderAuditoria };

let state = loadState();
let ctx = null;

function $(sel){ return document.querySelector(sel); }

function ensureShell(){
  if(!$("#viewRoot")){
    const main = document.createElement("main");
    main.id = "viewRoot";
    document.body.appendChild(main);
  }
  if(!$("#globalNivel") || !$("#globalCorte")){
    const bar = document.createElement("div");
    bar.className = "card";
    bar.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <label class="muted">Nivel</label>
        <select id="globalNivel" class="select select-sm">
          <option value="pres">Presidencial</option>
          <option value="sen">Senadores</option>
          <option value="dip">Diputados</option>
          <option value="mun">Alcaldes</option>
          <option value="dm">DM</option>
        </select>
        <label class="muted">Corte</label>
        <select id="globalCorte" class="select select-sm">
          <option value="feb2024">Feb 2024</option>
          <option value="mayo2024">May 2024</option>
          <option value="proy2028">Proy 2028</option>
        </select>
      </div>`;
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if(!document.querySelector('#navLinks')){
    const nav=document.createElement('div');
    nav.id='navLinks';
    nav.className='card';
    nav.innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap;">
      <a class="link" href="#dashboard">Dashboard</a>
      <a class="link" href="#mapa">Mapa</a>
      <a class="link" href="#simulador">Simulador</a>
      <a class="link" href="#potencial">Potencial</a>
      <a class="link" href="#movilizacion">Movilización</a>
      <a class="link" href="#objetivo">Objetivo</a>
      <a class="link" href="#auditoria">Auditoría</a>
    </div>`;
    document.body.insertBefore(nav, document.body.children[1]);
  }
  }
}

function bindHeader(){
  const nivelSel = $("#globalNivel");
  const corteSel = $("#globalCorte");
  nivelSel.value = state.nivel;
  corteSel.value = state.corte;
  nivelSel.onchange = () => { state = setState(state, { nivel: nivelSel.value }); recomputeAndRender(); };
  corteSel.onchange = () => { state = setState(state, { corte: corteSel.value }); recomputeAndRender(); };
}

export async function recomputeAndRender(){
  const view = getHashView();
  state = setState(state, { view });
  if(!ctx){ ctx = await getCTX(); }
  ensureShell();
  bindHeader();
  const root = $("#viewRoot");
  (VIEW_RENDERERS[view] || renderDashboard)(root, ctx, state, (patch)=>{ state = setState(state, patch); recomputeAndRender(); });
}

async function boot(){
  ensureShell();
  onRouteChange(recomputeAndRender);
  await recomputeAndRender();
}
boot();

import { computePresRisk } from "../../core/engine.js";

function fmt(n){ return (Number(n)||0).toLocaleString("en-US"); }
function pct(x){ return ((Number(x)||0)*100).toFixed(2)+"%"; }
function topN(votes,n=3){
  return Object.entries(votes||{}).filter(([k,v])=>Number(v||0)>0).sort((a,b)=>b[1]-a[1]).slice(0,n);
}

export function renderDashboard(root, ctx, state, setState){
  const year = 2024;
  const nivel = state.nivel;
  const level = ctx.normalized[year][nivel] || {nacional:{meta:{},votes:{}}, territorios:{}};
  const meta = level.nacional.meta || {};
  const votes = level.nacional.votes || {};

  const inscritos = Number(meta.inscritos||0);
  const emitidos = Number(meta.emitidos||0);
  const part = inscritos ? emitidos/inscritos : 0;
  const abst = 1-part;

  const top3 = topN(votes,3);
  const ganador = top3[0]?.[0] || "—";

  let riesgoTxt = "—";
  if(nivel==="pres"){
    const r = computePresRisk(votes);
    riesgoTxt = `2da vuelta: ${r.riesgo2v} · margen: ${r.riesgoMargen}`;
  }

  root.innerHTML = `
    <div class="card">
      <h2>Dashboard</h2>
      <div class="muted">Nivel: <b>${nivel}</b> · Corte: <b>${state.corte}</b></div>
    </div>

    <div class="grid-kpi">
      <div class="kpi"><div class="t">Padrón</div><div class="v">${fmt(inscritos)}</div></div>
      <div class="kpi"><div class="t">Emitidos</div><div class="v">${fmt(emitidos)}</div></div>
      <div class="kpi"><div class="t">Participación</div><div class="v">${pct(part)}</div></div>
      <div class="kpi"><div class="t">Abstención</div><div class="v">${pct(abst)}</div></div>
      <div class="kpi"><div class="t">Ganador (Top1)</div><div class="v">${ganador}</div></div>
      <div class="kpi"><div class="t">Top 3</div><div class="v">${top3.map(([p,v])=>`${p}`).join(", ") || "—"}</div></div>
    </div>

    <div class="card">
      <h3>Resumen ejecutivo</h3>
      <ul>
        <li>Riesgo presidencial: <b>${riesgoTxt}</b></li>
        <li>Territorios críticos: <b>(H3 Potencial)</b></li>
        <li>Curules decisivos: <b>(H3 Dip)</b></li>
      </ul>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn" href="#simulador">Ir a Simulador</a>
        <a class="btn" href="#objetivo">Ir a Objetivo</a>
      </div>
    </div>
  `;
}

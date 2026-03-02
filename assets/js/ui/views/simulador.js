import { applyPartyAdjust, applyMobilizacion, computePresRisk } from "../../core/engine.js";

function fmt(n){ return (Number(n)||0).toLocaleString("en-US"); }
function pct(x){ return ((Number(x)||0)*100).toFixed(2)+"%"; }
function topN(votes,n=5){
  return Object.entries(votes||{}).filter(([k,v])=>Number(v||0)>0).sort((a,b)=>b[1]-a[1]).slice(0,n);
}

export function renderSimulador(root, ctx, state, setState){
  const year = 2024;
  const effNivel = state.simulator.overrideEnabled ? state.simulator.overrideNivel : state.nivel;
  const level = ctx.normalized[year][effNivel] || {nacional:{meta:{},votes:{}}, territorios:{}};
  const baseMeta = level.nacional.meta || {};
  const baseVotes = level.nacional.votes || {};

  const parties = Object.keys(baseVotes).sort();
  const adj = state.simulator.partyAdjust || {};
  const mov = state.simulator.movilizacion || {mode:"pp", value:0};

  const votesAdj = applyPartyAdjust(baseVotes, adj);
  const mv = applyMobilizacion(baseMeta, votesAdj, mov);
  const finalMeta = mv.meta;
  const finalVotes = mv.votes;

  const t = topN(finalVotes,5);
  const ganador = t[0]?.[0] || "—";

  let riesgo = "";
  if(effNivel==="pres"){
    const r = computePresRisk(finalVotes);
    riesgo = ` · 2da vuelta: ${r.riesgo2v} · margen: ${r.riesgoMargen}`;
  }

  root.innerHTML = `
    <div class="card">
      <h2>Simulador</h2>
      <div class="muted">Global nivel: <b>${state.nivel}</b> · Override: <b>${state.simulator.overrideEnabled ? "ON" : "OFF"}</b></div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
        <label class="muted"><input type="checkbox" id="ovOn" ${state.simulator.overrideEnabled?"checked":""}/> Override nivel (solo aquí)</label>
        <select id="ovNivel" class="select select-sm" ${state.simulator.overrideEnabled?"":"disabled"}>
          <option value="pres" ${effNivel==="pres"?"selected":""}>Pres</option>
          <option value="sen" ${effNivel==="sen"?"selected":""}>Sen</option>
          <option value="dip" ${effNivel==="dip"?"selected":""}>Dip</option>
          <option value="mun" ${effNivel==="mun"?"selected":""}>Alc</option>
          <option value="dm" ${effNivel==="dm"?"selected":""}>DM</option>
        </select>

        <label class="muted">Movilización</label>
        <select id="movMode" class="select select-sm">
          <option value="pp" ${mov.mode==="pp"?"selected":""}>+pp participación</option>
          <option value="captura" ${mov.mode==="captura"?"selected":""}>captura abstención</option>
        </select>
        <input id="movVal" class="select select-sm" type="number" step="0.1" value="${Number(mov.value||0)}" style="width:90px;" />
        <button class="btn" id="btnApply">Aplicar</button>
      </div>
    </div>

    <div class="grid-kpi">
      <div class="kpi"><div class="t">Inscritos</div><div class="v">${fmt(finalMeta.inscritos||0)}</div></div>
      <div class="kpi"><div class="t">Emitidos</div><div class="v">${fmt(finalMeta.emitidos||0)}</div></div>
      <div class="kpi"><div class="t">Ganador</div><div class="v">${ganador}${riesgo}</div></div>
      <div class="kpi"><div class="t">Top5</div><div class="v">${t.map(([p])=>p).join(", ")||"—"}</div></div>
    </div>

    <div class="card">
      <h3>Ajuste por partido (Δ pp sobre share)</h3>
      <div class="muted">H2: ajuste nacional. H3: territorial + heterogeneidad.</div>
      <table class="table" id="adjTable">
        <thead><tr><th>Partido</th><th>Votos base</th><th>Δ pp</th></tr></thead>
        <tbody>
          ${parties.map(p=>`<tr data-p="${p}"><td>${p}</td><td>${fmt(baseVotes[p])}</td><td><input class="select select-sm input-sm" type="number" step="0.1" value="${Number(adj[p]||0)}"/></td></tr>`).join("")}
        </tbody>
      </table>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn" id="btnSim">Simular</button>
        <button class="btn" id="btnReset">Reset</button>
      </div>
    </div>
  `;

  const ovOn = root.querySelector("#ovOn");
  const ovNivel = root.querySelector("#ovNivel");
  ovOn.addEventListener("change", ()=>{
    setState({ simulator:{ overrideEnabled: ovOn.checked }});
  });
  ovNivel.addEventListener("change", ()=>{
    setState({ simulator:{ overrideNivel: ovNivel.value }});
  });

  root.querySelector("#btnApply").addEventListener("click", ()=>{
    const mode = root.querySelector("#movMode").value;
    const val = Number(root.querySelector("#movVal").value||0);
    setState({ simulator:{ movilizacion:{ ...mov, mode, value: val }}});
  });

  root.querySelector("#btnSim").addEventListener("click", ()=>{
    const rows = Array.from(root.querySelectorAll("#adjTable tbody tr"));
    const next = {};
    for(const tr of rows){
      const p = tr.getAttribute("data-p");
      const v = Number(tr.querySelector("input").value||0);
      if(v) next[p]=v;
    }
    setState({ simulator:{ partyAdjust: next }});
  });

  root.querySelector("#btnReset").addEventListener("click", ()=>{
    setState({ simulator:{ partyAdjust:{}, movilizacion:{mode:"pp", value:0, distribution:"prop", targetParty:"", negative:false} }});
  });
}

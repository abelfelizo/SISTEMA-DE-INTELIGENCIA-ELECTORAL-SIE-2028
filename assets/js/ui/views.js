
import {toast} from "./toast.js";
import {loadPolls} from "../core/polls.js";
import {dhondt, nextSeatGap} from "../core/dhondt.js";
import {loadDiputados2024, loadCurules2024, loadPadron2024Provincial, loadPadron2024Exterior, loadPadron2024Meta, loadPres2024VotosProv} from "../core/data.js";
import {applyAlliance, mergeCoalition} from "../core/coalition.js";
import {formatPct} from "../core/utils.js";

function provIdFromSvg(id){
  // Expect DO-01..DO-32
  const m = String(id||"").match(/DO-(\d{1,2})/);
  if(!m) return null;
  return Number(m[1]);
}

function aggProvVotes(dipData, provincia_id){
  const districts = dipData.districts.filter(d=>d.provincia_id===provincia_id);
  const out = {};
  for(const d of districts){
    for(const [p,v] of Object.entries(d.votes||{})){
      out[p] = (out[p]||0) + (Number(v)||0);
    }
  }
  return out;
}

function shares(votes){
  const total = Object.values(votes).reduce((a,b)=>a+(Number(b)||0),0) || 1;
  const out = {};
  for(const [p,v] of Object.entries(votes)) out[p] = (Number(v)||0)/total*100;
  return {total, share: out};
}

function top2(shareObj){
  const entries = Object.entries(shareObj).sort((a,b)=>b[1]-a[1]);
  return entries.slice(0,2);
}

export async function renderDashboard(state){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>Dashboard Ejecutivo</h2>
        <div class="kpis">
          <div class="kpi"><div class="label">Meta Presidencial</div><div class="value" id="kpi-pres">—</div><div class="sub">Editable por escenario</div></div>
          <div class="kpi"><div class="label">Meta Diputados</div><div class="value" id="kpi-dip">≥96</div><div class="sub">Mayoría simple</div></div>
          <div class="kpi"><div class="label">Meta Alcaldías</div><div class="value" id="kpi-alc">—</div><div class="sub">Editable por escenario</div></div>
        </div>
        <hr/>
        <div class="row">
          <div class="pill warn">Base 2028 = 2024</div>
          <div class="pill">Datos reales conectados: <b>Diputados 2024</b></div>
        </div>
        <p class="small">Esta versión ya corre con datos reales de Diputados 2024 por provincia/circ y curules oficiales 2024. Encuestas se cargan desde <code>data/polls.json</code>.</p>
      </div>
      <div class="card">
        <h2>Estado de datos</h2>
        <div id="data-status" class="small">Cargando…</div>
      </div>
    </div>
  `;

  const status = document.getElementById("data-status");
  const polls = await loadPolls();
  const curules = await loadCurules2024().catch(()=>null);
  const dip = await loadDiputados2024().catch(()=>null);

  const lines = [];
  lines.push(curules ? `<div class="pill good">Curules 2024 cargadas: ${curules.meta.total_diputados} (territorial ${curules.meta.territorial_total} + exterior ${curules.meta.exterior_total} + nacionales 5)</div>` :
                       `<div class="pill bad">No se pudo cargar curules_2024.json</div>`);
  lines.push(dip ? `<div class="pill good">Votos Diputados 2024: ${dip.meta.total_votes.toLocaleString()}</div>` :
                   `<div class="pill bad">No se pudo cargar diputados_2024_votos.json</div>`);
  lines.push(polls.ok ? `<div class="pill good">Encuestas cargadas: ${polls.polls.length}</div>` :
                        `<div class="pill warn">Encuestas: ${polls.error} (fallback: base 2024)</div>`);
  status.innerHTML = lines.join("<br/>");
}

export async function renderMapa(state, mapApi){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card">
      <h2>Mapa Interactivo (Diputados 2024)</h2>
      <div class="row">
        <label>Modo</label>
        <select id="map-mode">
          <option value="prov" selected>Provincial</option>
          <option value="reg">Regional</option>
        </select>
        <span class="small">Click en una provincia para ver % por partido y margen.</span>
      </div>
      <div class="mapWrap" id="map-wrap">
        <div class="mapTools">
          <button id="btn-zoom-in">＋</button>
          <button id="btn-zoom-out">－</button>
          <button id="btn-reset">Reset</button>
        </div>
        <div id="map-container" style="width:100%;height:100%"></div>
        <div class="mapLegend">
          <div class="legendItem"><span class="dot"></span> Selección</div>
          <div class="legendItem">Zoom/arrastre: rueda + arrastrar</div>
        </div>
      </div>
      <hr/>
      <div class="split">
        <div>
          <h2 style="margin-top:0">Panel demarcación</h2>
          <div id="map-panel" class="small">Selecciona una provincia en el mapa.</div>
        </div>
        <div>
          <h2 style="margin-top:0">Categoría estratégica (simple)</h2>
          <div id="map-cat" class="small">—</div>
        </div>
      </div>
    </div>
  `;

  const dip = await loadDiputados2024();
  const panel = document.getElementById("map-panel");
  const cat = document.getElementById("map-cat");

  function classify(fp, lead, margin){
    if(fp < 10) return {label:"Baja prioridad", pill:"warn"};
    if(lead==="FP" && margin>=8) return {label:"Fortaleza", pill:"good"};
    if(lead==="FP") return {label:"Disputa ganada", pill:"good"};
    if(margin<=5) return {label:"Oportunidad", pill:"warn"};
    if(margin<=12) return {label:"Disputa", pill:"warn"};
    return {label:"Adverso", pill:"bad"};
  }

  function loadMode(mode){
    const url = mode==="reg" ? new URL("../../../assets/maps/regiones.svg", import.meta.url) : new URL("../../../assets/maps/provincias.svg", import.meta.url);
    mapApi.load(url, (id)=>{
      const pid = provIdFromSvg(id);
      if(pid) state.lastProvId = pid;
      if(!pid){
        panel.innerHTML = `<div class="pill warn">Selección: ${id}</div><div class="small">Modo regional no tiene desglose por provincia en esta versión.</div>`;
        cat.innerHTML = `<div class="pill warn">—</div>`;
        return;
      }
      const votesProv = aggProvVotes(dip, pid);
      const s = shares(votesProv);
      const t2 = top2(s.share);
      const lead = t2[0]?.[0]||"—";
      const margin = (t2[0]?.[1]||0) - (t2[1]?.[1]||0);
      const fp = s.share["FP"] || 0;

      const rows = Object.entries(s.share).sort((a,b)=>b[1]-a[1]).slice(0,8)
        .map(([p,v])=>`<tr><td>${p}</td><td>${formatPct(v)}</td></tr>`).join("");
      panel.innerHTML = `
        <div class="pill">Provincia ID: <b>${pid}</b></div>
        <div class="pill">Líder: <b>${lead}</b> · Margen: <b>${formatPct(margin)}</b></div>
        <div class="small">Total votos diputados (prov): <b>${s.total.toLocaleString()}</b></div>
        <div style="overflow:auto;margin-top:8px">
          <table class="table"><thead><tr><th>Partido</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
      `;
      const c = classify(fp, lead, margin);
      cat.innerHTML = `<div class="pill ${c.pill}">${c.label}</div>`;
    });
  }

  document.getElementById("btn-zoom-in").onclick = ()=>mapApi.zoomIn();
  document.getElementById("btn-zoom-out").onclick = ()=>mapApi.zoomOut();
  document.getElementById("btn-reset").onclick = ()=>mapApi.reset();

  const modeSel = document.getElementById("map-mode");
  modeSel.addEventListener("change", ()=>loadMode(modeSel.value));
  loadMode("prov");
}

export async function renderEncuestas(state){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card">
      <h2>Encuestas (carga por archivo)</h2>
      <p class="small">Edita <b>data/encuestas_master.xlsx</b> y exporta a <b>data/polls.json</b>. La web siempre carga lo que haya en ese archivo.</p>
      <div class="row">
        <a class="pill" href="./data/encuestas_master.xlsx" download>Descargar plantilla Excel</a>
        <a class="pill" href="./data/polls.json" download>Descargar polls.json actual</a>
      </div>
      <hr/>
      <div id="polls-status" class="small">Cargando…</div>
      <div style="overflow:auto; margin-top:10px">
        <table class="table" id="polls-table"></table>
      </div>
    </div>
  `;

  const status = document.getElementById("polls-status");
  const table = document.getElementById("polls-table");
  const res = await loadPolls();
  if(!res.ok){
    status.innerHTML = `<div class="pill warn">${res.error}</div><br/>Fallback: base 2024 sin encuestas.`;
    table.innerHTML = "";
    return;
  }
  status.innerHTML = `<div class="pill good">Encuestas cargadas: ${res.polls.length}</div>`;
  const rows = res.polls.slice().sort((a,b)=> String(b.fecha).localeCompare(String(a.fecha)));
  table.innerHTML = `
    <thead><tr>
      <th>Fecha</th><th>Encuestadora</th><th>Nivel</th><th>Tipo</th><th>Cred.</th><th>Resultados</th>
    </tr></thead>
    <tbody>
      ${rows.map(p=>{
        const r = p.resultados || {};
        const keys = Object.keys(r).slice(0,10);
        const txt = keys.map(k=>`${k}:${r[k]}`).join(" | ") + (Object.keys(r).length>10?" …":"");
        return `<tr>
          <td>${p.fecha||""}</td>
          <td>${p.encuestadora||""}</td>
          <td>${p.nivel||""}</td>
          <td>${p.tipo||""}</td>
          <td>${p.credibilidad??""}</td>
          <td style="font-family: var(--mono); font-size:12px">${txt}</td>
        </tr>`;
      }).join("")}
    </tbody>
  `;
}

export async function renderSimulador(state){
  const el = document.getElementById("view");
  const curules = await loadCurules2024();
  const dip = await loadDiputados2024();

  const territorial = curules.territorial || [];
  const provList = [...new Set(territorial.map(x=>x.provincia))].sort((a,b)=>a.localeCompare(b));

  // party list from data
  const parties = dip.meta.parties || [];

  el.innerHTML = `
    <div class="card">
      <h2>Simulador Diputados (Datos reales 2024 + D'Hondt)</h2>
      <div class="row">
        <label>Provincia</label>
        <select id="sim-prov">${provList.map(p=>`<option value="${p}">${p}</option>`).join("")}</select>
        <label>Circ</label>
        <select id="sim-circ"></select>
        <label>Modo</label>
        <select id="sim-mode">
          <option value="baseline" selected>Base 2024</option>
          <option value="alliance">Alianza (transferencia parcial)</option>
          <option value="unica">Boleta única (fusionar listas)</option>
        </select>
      </div>

      <hr/>

      <div class="split">
        <div>
          <h2 style="margin-top:0">Configuración de alianza</h2>
          <div class="small">Solo aplica si el modo es <b>Alianza</b> o <b>Boleta única</b>.</div>
          <div class="row" style="margin-top:10px">
            <label>Partido líder</label>
            <select id="lead-party">
              ${parties.map(p=>`<option value="${p}" ${p==="FP"?"selected":""}>${p}</option>`).join("")}
            </select>
            <label>Aliados</label>
            <select id="ally-parties" multiple size="6" style="min-width:160px">
              ${parties.filter(p=>p!=="FP").map(p=>`<option value="${p}">${p}</option>`).join("")}
            </select>
          </div>
          <div class="row" style="margin-top:10px">
            <label>% a líder</label><input id="t-tolead" type="number" min="0" max="100" value="70" style="width:90px"/>
            <label>% abstención</label><input id="t-abst" type="number" min="0" max="100" value="10" style="width:90px"/>
            <span class="small">El resto queda en el aliado (compite solo) en modo Alianza.</span>
          </div>
          <div class="row" style="margin-top:12px">
            <button id="sim-run" class="pill good">Simular distrito</button>
            <button id="sim-prov-run" class="pill">Simular provincia completa</button>
          </div>
          <hr/>
          <h2 style="margin-top:0">Optimización rápida (objetivo)</h2>
          <div class="small">Calcula en este distrito cuántos votos aproximados necesita el líder para el próximo escaño (gap D'Hondt).</div>
          <button id="sim-gap" class="pill warn" style="margin-top:8px">Calcular gap próximo escaño</button>
          <div id="gap-out" class="small" style="margin-top:8px">—</div>
        </div>

        <div>
          <h2 style="margin-top:0">Resultado</h2>
          <div id="sim-out" class="small">—</div>
          <div style="overflow:auto; margin-top:10px">
            <table class="table" id="sim-table"></table>
          </div>
        </div>
      </div>
    </div>
  `;

  const provSel = document.getElementById("sim-prov");
  const circSel = document.getElementById("sim-circ");
  const modeSel = document.getElementById("sim-mode");
  const leadSel = document.getElementById("lead-party");
  const allySel = document.getElementById("ally-parties");
  const toLead = document.getElementById("t-tolead");
  const abst = document.getElementById("t-abst");

  function loadCircs(){
    const prov = provSel.value;
    const rows = territorial.filter(x=>x.provincia===prov).sort((a,b)=>a.circ-b.circ);
    circSel.innerHTML = rows.map(r=>`<option value="${r.circ}">Circ ${r.circ} (${r.seats})</option>`).join("");
  }
  provSel.addEventListener("change", loadCircs);
  loadCircs();

  function getDistrict(prov, circ){
    return dip.districts.find(x=>x.provincia===prov && x.circ===Number(circ)) || null;
  }
  function getSeats(prov, circ){
    const row = territorial.find(x=>x.provincia===prov && x.circ===Number(circ));
    return row?.seats || 1;
  }

  function selectedAllies(){
    return Array.from(allySel.selectedOptions).map(o=>o.value);
  }

  function applyMovilizacionVotes(votes, provId){
    const m = state.movilizacion;
    if(!m || !m.byProv) return votes;
    const row = m.byProv[String(provId)] || m.byProv[provId];
    if(!row) return votes;
    const baseEm = Number(row.emitidos_pres)||0;
    const escEm = Number(row.emitidos_esc)||0;
    if(baseEm<=0 || escEm<=baseEm) return votes;
    const factor = escEm / baseEm;
    if(!isFinite(factor) || factor<=1) return votes;

    const out = {...votes};
    if(m.mode==="dirigida" && m.partyTarget){
      const total = Object.values(out).reduce((a,b)=>a+(Number(b)||0),0);
      const inc = Math.max(0, Math.round(total*(factor-1)));
      out[m.partyTarget] = (out[m.partyTarget]||0) + inc;
      return out;
    }
    // proporcional
    for(const k of Object.keys(out)){
      out[k] = Math.round((Number(out[k])||0) * factor);
    }
    return out;
  }

  function simulateOne(){
    const prov = provSel.value;
    const circ = circSel.value;
    const k = getSeats(prov, circ);
    const district = getDistrict(prov, circ);
    const baseVotes = district ? district.votes : null;
    const provId = district ? district.provincia_id : null;
    if(!baseVotes){
      toast("No se encontró data de votos para este distrito.");
      return null;
    }
    let votesAdj = {...baseVotes};
    // Movilización (si está calculada en el motor Movilización)
    if(provId!=null) votesAdj = applyMovilizacionVotes(votesAdj, provId);
    const mode = modeSel.value;
    const lead = leadSel.value;
    const allies = selectedAllies();
    if(mode==="alliance"){
      votesAdj = applyAlliance(votesAdj, {lead, allies, toLead:Number(toLead.value)||0, abst:Number(abst.value)||0});
    }else if(mode==="unica"){
      votesAdj = mergeCoalition(votesAdj, {lead, allies});
    }
    const r = dhondt(votesAdj, k);
    return {prov, circ:Number(circ), k, baseVotes, votesAdj, result:r, lead};
  }

  function renderResult(sim){
    const out = document.getElementById("sim-out");
    const table = document.getElementById("sim-table");
    if(!sim){ out.innerHTML="—"; table.innerHTML=""; return; }
    out.innerHTML = `<div class="pill good">D'Hondt (k=${sim.k}) · ${sim.prov} · Circ ${sim.circ}</div>`;
    const seatRows = Object.entries(sim.result.seatsByParty).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>0);
    table.innerHTML = `
      <thead><tr><th>Partido</th><th>Curules</th><th>Votos (ajustado)</th></tr></thead>
      <tbody>
        ${seatRows.map(([p,s])=>`<tr><td>${p}</td><td><b>${s}</b></td><td>${(sim.votesAdj[p]||0).toLocaleString()}</td></tr>`).join("")}
      </tbody>`;
  }

  document.getElementById("sim-run").addEventListener("click", ()=>{
    const sim = simulateOne();
    renderResult(sim);
  });

  document.getElementById("sim-prov-run").addEventListener("click", ()=>{
    const prov = provSel.value;
    const dist = dip.districts.filter(d=>d.provincia===prov);
    const lead = leadSel.value;
    const allies = selectedAllies();
    const mode = modeSel.value;

    const totals = {};
    let seatsFP = 0;
    let seatsTotal = 0;
    for(const d of dist){
      const k = getSeats(prov, d.circ);
      let v = {...d.votes};
      if(mode==="alliance") v = applyAlliance(v, {lead, allies, toLead:Number(toLead.value)||0, abst:Number(abst.value)||0});
      if(mode==="unica") v = mergeCoalition(v, {lead, allies});
      const r = dhondt(v, k);
      for(const [p,s] of Object.entries(r.seatsByParty)){
        totals[p] = (totals[p]||0) + s;
      }
      seatsTotal += k;
    }
    const out = document.getElementById("sim-out");
    out.innerHTML = `<div class="pill good">Resultado provincia · ${prov}</div><div class="small">Curules totales (prov): ${seatsTotal}</div>`;
    const table = document.getElementById("sim-table");
    const rows = Object.entries(totals).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>0);
    table.innerHTML = `
      <thead><tr><th>Partido</th><th>Curules (suma)</th></tr></thead>
      <tbody>${rows.map(([p,s])=>`<tr><td>${p}</td><td><b>${s}</b></td></tr>`).join("")}</tbody>`;
  });

  document.getElementById("sim-gap").addEventListener("click", ()=>{
    const sim = simulateOne();
    if(!sim) return;
    const lead = sim.lead;
    const g = nextSeatGap(sim.votesAdj, sim.k, lead);
    document.getElementById("gap-out").innerHTML =
      `<div class="pill warn">Gap próximo escaño (${lead})</div>
       <div class="small">Curules actuales: <b>${g.currentSeats}</b> · Próximo divisor: <b>${g.nextDiv}</b></div>
       <div class="small">Votos aprox necesarios: <b>${g.votesNeeded.toLocaleString()}</b> (en este distrito)</div>`;
  });
}

export async function renderPotencial(state){
  const el = document.getElementById("view");
  const dip = await loadDiputados2024();
  // aggregate by province
  const byProv = new Map();
  for(const d of dip.districts){
    const pid = d.provincia_id;
    if(!byProv.has(pid)) byProv.set(pid, {provincia_id:pid, provincia:d.provincia, votes:{}});
    const obj = byProv.get(pid);
    for(const [p,v] of Object.entries(d.votes||{})){
      obj.votes[p] = (obj.votes[p]||0) + (Number(v)||0);
    }
  }
  const rows = [];
  for(const obj of byProv.values()){
    const s = shares(obj.votes);
    const t2 = top2(s.share);
    const lead = t2[0]?.[0]||"—";
    const margin = (t2[0]?.[1]||0) - (t2[1]?.[1]||0);
    const fp = s.share["FP"]||0;
    let cat="Adverso", pill="bad";
    if(fp<10){cat="Baja prioridad"; pill="warn";}
    else if(lead==="FP" && margin>=8){cat="Fortaleza"; pill="good";}
    else if(lead==="FP"){cat="Disputa ganada"; pill="good";}
    else if(margin<=5){cat="Oportunidad"; pill="warn";}
    else if(margin<=12){cat="Disputa"; pill="warn";}
    rows.push({prov:obj.provincia, pid:obj.provincia_id, fp, lead, margin, cat, pill});
  }
  rows.sort((a,b)=>["Fortaleza","Disputa ganada","Oportunidad","Disputa","Adverso","Baja prioridad"].indexOf(a.cat) - ["Fortaleza","Disputa ganada","Oportunidad","Disputa","Adverso","Baja prioridad"].indexOf(b.cat));

  el.innerHTML = `
    <div class="card">
      <h2>Clasificador de Potencial (Basado en Diputados 2024)</h2>
      <p class="small">Versión inicial: clasifica provincias usando % FP y margen vs líder en Diputados 2024. Luego se integran tendencia 2020–2024 y padrón/abstención para score completo.</p>
      <div style="overflow:auto;margin-top:10px">
        <table class="table">
          <thead><tr><th>Provincia</th><th>FP %</th><th>Líder</th><th>Margen</th><th>Categoría</th></tr></thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${r.prov}</td>
                <td>${formatPct(r.fp)}</td>
                <td>${r.lead}</td>
                <td>${formatPct(r.margin)}</td>
                <td><span class="pill ${r.pill}">${r.cat}</span></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderMovilizacion(state){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card">
      <div class="row between">
        <div>
          <h2>Analizador de Abstención / Movilización (Base Presidencial 2024)</h2>
          <div id="mov-status" class="pill warn">Cargando padrón y participación...</div>
        </div>
        <div class="small muted">Fuente padrón: Senadores 19 Mayo 2024 · Fuente participación: Presidencial por colegios 2024</div>
      </div>

      <div class="grid2" style="margin-top:12px;">
        <div class="card-sub">
          <h3>Escenario de movilización</h3>
          <div class="small muted">Aumenta participación presidencial (puntos porcentuales) y distribuye el “extra” de votos.</div>

          <div class="field">
            <label>+ Participación (pp)</label>
            <input id="mov-delta" type="range" min="0" max="12" step="0.5" value="3">
            <div class="row between small">
              <div>0</div><div id="mov-delta-val" class="pill">+3.0 pp</div><div>12</div>
            </div>
          </div>

          <div class="field">
            <label>Distribución del extra</label>
            <div class="row" style="gap:10px; flex-wrap:wrap;">
              <label class="chip"><input type="radio" name="mov-mode" value="proporcional" checked> Proporcional a votos</label>
              <label class="chip"><input type="radio" name="mov-mode" value="dirigida"> Dirigida a un partido</label>
            </div>
          </div>

          <div class="field" id="mov-party-wrap" style="display:none;">
            <label>Partido objetivo (recibe el extra)</label>
            <select id="mov-party"></select>
          </div>

          <div class="field">
            <label>Aplicar a</label>
            <div class="row" style="gap:10px; flex-wrap:wrap;">
              <label class="chip"><input type="radio" name="mov-scope" value="nacional" checked> Nacional</label>
              <label class="chip"><input type="radio" name="mov-scope" value="provincia"> Provincia seleccionada en mapa</label>
            </div>
            <div class="small muted">Si eliges “provincia”, selecciona una provincia en el mapa primero.</div>
          </div>

          <button class="pill good" id="mov-run">Calcular</button>
        </div>

        <div class="card-sub">
          <h3>Validación</h3>
          <div id="mov-validate" class="small muted">—</div>
          <div class="hr"></div>
          <h3>Resultado nacional</h3>
          <div id="mov-kpi" class="kpi-grid">
            <div class="kpi"><div class="k">Inscritos</div><div class="v" id="k-ins">—</div></div>
            <div class="kpi"><div class="k">Emitidos (base)</div><div class="v" id="k-em">—</div></div>
            <div class="kpi"><div class="k">Participación (base)</div><div class="v" id="k-part">—</div></div>
            <div class="kpi"><div class="k">Emitidos (escenario)</div><div class="v" id="k-em2">—</div></div>
          </div>
          <div class="small muted" style="margin-top:8px;">Nota: el escenario ajusta participación presidencial; el efecto multinivel se aplica en el simulador.</div>
        </div>
      </div>

      <div class="hr"></div>

      <h3>Detalle por provincia</h3>
      <div class="small muted">Participación presidencial real 2024 por provincia (inscritos del nivel senatorial).</div>
      <div style="overflow:auto; margin-top:10px;">
        <table class="tbl" id="mov-table">
          <thead>
            <tr>
              <th>Provincia</th>
              <th class="right">Inscritos</th>
              <th class="right">Emitidos</th>
              <th class="right">Participación</th>
              <th class="right">Abstención</th>
              <th class="right">Δ Emitidos (esc)</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  const fmtInt = (n)=> (n==null? "—" : Number(n).toLocaleString("es-DO"));
  const fmtPct = (x)=> (x==null? "—" : (Number(x)*100).toFixed(2) + "%");

  let cache = state._movCache;
  const status = document.getElementById("mov-status");
  const validateEl = document.getElementById("mov-validate");

  async function ensure(){
    if(cache) return cache;
    try{
      const [padProv, meta, presVotes] = await Promise.all([
        loadPadron2024Provincial(),
        loadPadron2024Meta(),
        loadPres2024VotosProv()
      ]);
      cache = {padProv, meta, presVotes};
      state._movCache = cache;
      status.className = "pill ok";
      status.textContent = "Base cargada (padrón + participación)";
      validateEl.innerHTML = `
        <div><b>Inscritos total (validado):</b> ${fmtInt(meta.totales.inscritos_total)} · <b>Emitidos presidencial:</b> ${fmtInt(meta.totales.emitidos_pres_total)} · <b>Participación nacional:</b> ${fmtPct(meta.validaciones.participacion_nacional_pres)}</div>
        <div class="small muted">Interior: ${fmtInt(meta.totales.inscritos_interior)} · Exterior: ${fmtInt(meta.totales.inscritos_exterior)} · Penitenciario (emitidos): ${fmtInt(meta.totales.emitidos_pres_penitenciario)}</div>
      `;
      // fill party select
      const sel = document.getElementById("mov-party");
      sel.innerHTML = presVotes.party_cols.map(p=>`<option value="${p}">${p}</option>`).join("");
      return cache;
    }catch(e){
      status.className = "pill bad";
      status.textContent = "Error cargando data";
      validateEl.textContent = e.message;
      throw e;
    }
  }

  function getSelectedProvId(){
    return state.lastProvId || null;
  }

  function computeScenario(deltaPP, mode, partyTarget, scope){
    const rows = cache.padProv.rows.map(r=>({...r}));
    // base totals interior
    let totalIns = 0, totalEm = 0, totalEm2 = 0;
    const selectedProv = (scope==="provincia") ? getSelectedProvId() : null;

    // build base votes shares per province for proportional allocation
    const votesIndex = new Map();
    for(const vr of cache.presVotes.rows){
      votesIndex.set(vr.provincia_id, vr);
    }

    for(const r of rows){
      const apply = (scope==="nacional") || (selectedProv && r.provincia_id===selectedProv);
      totalIns += r.inscritos;
      totalEm += r.emitidos_pres;

      let em2 = r.emitidos_pres;
      if(apply){
        const basePart = r.emitidos_pres / r.inscritos;
        const newPart = Math.min(0.99, basePart + (deltaPP/100));
        em2 = Math.round(r.inscritos * newPart);
      }
      r.emitidos_esc = em2;
      r.delta_emitidos = em2 - r.emitidos_pres;
      totalEm2 += em2;

      // optional: compute party deltas (not displayed in table for now)
      const vr = votesIndex.get(r.provincia_id);
      if(vr && r.delta_emitidos>0){
        if(mode==="dirigida" && partyTarget){
          r.delta_partidos = {[partyTarget]: r.delta_emitidos};
        }else{
          // proportional to valid votes by party
          const totalValid = vr.validos || 0;
          const deltas = {};
          if(totalValid>0){
            for(const p of cache.presVotes.party_cols){
              const share = (vr.partidos[p]||0)/totalValid;
              deltas[p] = Math.round(r.delta_emitidos * share);
            }
            // fix rounding drift by adjusting the max party
            const sumD = Object.values(deltas).reduce((a,b)=>a+b,0);
            const drift = r.delta_emitidos - sumD;
            if(drift!==0){
              let bestP=null, bestV=-1;
              for(const p of Object.keys(deltas)){
                const v = vr.partidos[p]||0;
                if(v>bestV){bestV=v; bestP=p;}
              }
              if(bestP) deltas[bestP]+=drift;
            }
          }
          r.delta_partidos = deltas;
        }
      }else{
        r.delta_partidos = {};
      }
    }

    return {rows, totalIns, totalEm, totalEm2};
  }

  function renderTable(scn){
    const tbody = document.querySelector("#mov-table tbody");
    tbody.innerHTML = scn.rows.map(r=>`
      <tr ${state.lastProvId===r.provincia_id ? 'class="hl"' : ''}>
        <td>${r.provincia}</td>
        <td class="right">${fmtInt(r.inscritos)}</td>
        <td class="right">${fmtInt(r.emitidos_pres)}</td>
        <td class="right">${fmtPct(r.participacion_pres)}</td>
        <td class="right">${fmtInt(r.abstencion_pres)}</td>
        <td class="right">${r.delta_emitidos>=0? "+" : ""}${fmtInt(r.delta_emitidos)}</td>
      </tr>
    `).join("");
  }

  function renderKpi(scn){
    document.getElementById("k-ins").textContent = fmtInt(scn.totalIns);
    document.getElementById("k-em").textContent = fmtInt(scn.totalEm);
    document.getElementById("k-part").textContent = fmtPct(scn.totalEm/scn.totalIns);
    document.getElementById("k-em2").textContent = fmtInt(scn.totalEm2);
  }

  function wire(){
    const delta = document.getElementById("mov-delta");
    const deltaVal = document.getElementById("mov-delta-val");
    const partyWrap = document.getElementById("mov-party-wrap");

    delta.addEventListener("input", ()=>{
      deltaVal.textContent = `+${Number(delta.value).toFixed(1)} pp`;
    });
    document.querySelectorAll('input[name="mov-mode"]').forEach(r=>{
      r.addEventListener("change", ()=>{
        const v = document.querySelector('input[name="mov-mode"]:checked').value;
        partyWrap.style.display = (v==="dirigida") ? "" : "none";
      });
    });

    document.getElementById("mov-run").addEventListener("click", ()=>{
      const deltaPP = Number(document.getElementById("mov-delta").value);
      const mode = document.querySelector('input[name="mov-mode"]:checked').value;
      const scope = document.querySelector('input[name="mov-scope"]:checked').value;
      const partyTarget = (mode==="dirigida") ? document.getElementById("mov-party").value : null;
      if(scope==="provincia" && !getSelectedProvId()){
        toast("Selecciona una provincia en el mapa para usar 'Provincia'.");
        return;
      }
      const scn = computeScenario(deltaPP, mode, partyTarget, scope);
      renderKpi(scn);
      renderTable(scn);
      // store into state so simulador can reuse
      state.movilizacion = {deltaPP, mode, partyTarget, scope, byProv: Object.fromEntries(scn.rows.map(r=>[r.provincia_id, r]))};
      toast("Escenario calculado. Si vas al simulador, puedes aplicarlo al reparto de curules.");
    });
  }

  ensure().then(()=>{
    // initial render baseline
    const scn = computeScenario(0, "proporcional", null, "nacional");
    renderKpi(scn);
    renderTable(scn);
    wire();
  });
}


export async function renderObjetivo(state){
  const el = document.getElementById("view");
  const curules = await loadCurules2024();
  const dip = await loadDiputados2024();
  const territorial = curules.territorial || [];
  const provList = [...new Set(territorial.map(x=>x.provincia))].sort((a,b)=>a.localeCompare(b));
  const parties = dip.meta.parties || [];
  el.innerHTML = `
    <div class="card">
      <h2>Módulo Objetivo (Diputados · datos reales 2024)</h2>
      <p class="small">Este módulo identifica dónde es más eficiente ganar el próximo escaño usando gap D'Hondt por distrito (curules reales 2024 + votos reales 2024).</p>
      <div class="row">
        <label>Partido objetivo</label>
        <select id="obj-party">${parties.map(p=>`<option value="${p}" ${p==="FP"?"selected":""}>${p}</option>`).join("")}</select>
        <label>Top N distritos</label>
        <input id="obj-top" type="number" min="5" value="15" style="width:90px"/>
        <button id="obj-run" class="pill good">Calcular</button>
      </div>
      <div id="obj-out" class="small" style="margin-top:10px">—</div>
      <div style="overflow:auto;margin-top:10px">
        <table class="table" id="obj-table"></table>
      </div>
    </div>
  `;

  function getSeats(prov, circ){
    const row = territorial.find(x=>x.provincia===prov && x.circ===Number(circ));
    return row?.seats || 1;
  }

  document.getElementById("obj-run").addEventListener("click", ()=>{
    const target = document.getElementById("obj-party").value;
    const topN = Number(document.getElementById("obj-top").value)||15;
    const gaps = [];
    for(const d of dip.districts){
      const k = getSeats(d.provincia, d.circ);
      const v = d.votes || {};
      if(!v[target]) continue;
      const g = nextSeatGap(v, k, target);
      gaps.push({
        provincia: d.provincia,
        circ: d.circ,
        seats: k,
        votesNeeded: g.votesNeeded,
        currentSeats: g.currentSeats
      });
    }
    gaps.sort((a,b)=>a.votesNeeded-b.votesNeeded);
    const best = gaps.slice(0, topN);
    document.getElementById("obj-out").innerHTML = `<div class="pill good">Top ${best.length} distritos más “baratos” para el próximo escaño de ${target}</div>`;
    const table = document.getElementById("obj-table");
    table.innerHTML = `
      <thead><tr><th>Provincia</th><th>Circ</th><th>k</th><th>Curules actuales</th><th>Votos aprox para próximo escaño</th></tr></thead>
      <tbody>
        ${best.map(r=>`<tr><td>${r.provincia}</td><td>${r.circ}</td><td>${r.seats}</td><td>${r.currentSeats}</td><td><b>${r.votesNeeded.toLocaleString()}</b></td></tr>`).join("")}
      </tbody>
    `;
  });
}


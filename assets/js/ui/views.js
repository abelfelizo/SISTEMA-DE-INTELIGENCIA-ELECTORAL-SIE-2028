/**
 * SIE 2028 — ui/views.js  (H2)
 * 7 módulos. Motores conectados: D'Hondt, simulación, objetivo, potencial, auditoría.
 */
import { toast }                       from "./toast.js";
import { initMap }                     from "./map.js";
import { getLevel, getInscritos }      from "../core/data.js";
import { simular }                     from "../core/simulacion.js";
import { generarEscenarios }           from "../core/objetivo.js";
import { calcPotencial }               from "../core/potencial.js";
import { runAuditoria }                from "../core/auditoria.js";
import { fmtInt, fmtPct, rankVotes }   from "../core/utils.js";
import { simBoleta }   from "../core/boleta.js";
import { exportarPDF } from "../core/exportar.js";


// ── Constantes ────────────────────────────────────────────────
const NIVEL_LABEL = { pres:"Presidencial", sen:"Senadores", dip:"Diputados", mun:"Alcaldes", dm:"DM" };
const CORTE_LABEL = { mayo2024:"Mayo 2024", feb2024:"Feb 2024", proy2028:"Proy. 2028" };
const PARTY_COLORS = {
  PRM:"#7A52F4", PLD:"#9B1B30", FP:"#1B7BF4", PRD:"#E8B124",
  BIS:"#2EAE70", PRSC:"#5599FF", DXC:"#888", ALPAIS:"#E86A24",
};
const MOV_COEF = { pres:1.00, sen:0.85, dip:0.75, mun:0.70, dm:0.70 };
const clr = p => PARTY_COLORS[p] || "#555";

// ── Helpers UI ────────────────────────────────────────────────
const view  = () => document.getElementById("view");
const el    = id => document.getElementById(id);

function kpi(label, value, sub = "", accent = false) {
  return `<div class="kpi-card${accent ? " kpi-accent" : ""}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ""}
  </div>`;
}

function barChart(ranked, limit = 6) {
  return ranked.slice(0, limit).map(({ p, v, pct }) => `
    <div class="bar-row">
      <span class="bar-label">${p}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.round(pct * 100)}%;background:${clr(p)}"></div>
      </div>
      <span class="bar-pct">${fmtPct(pct)}</span>
      <span class="bar-abs muted">${fmtInt(v)}</span>
    </div>`).join("") || `<p class="muted">Sin datos</p>`;
}

function votesTable(ranked, showCurules = false, byParty = {}) {
  if (!ranked.length) return `<p class="muted">Sin datos</p>`;
  return `<table class="tbl">
    <thead><tr>
      <th>Partido</th><th class="r">Votos</th><th class="r">%</th>
      ${showCurules ? `<th class="r">Cur.</th>` : ""}
    </tr></thead>
    <tbody>${ranked.map(({ p, v, pct }) => `
      <tr>
        <td><span class="dot" style="background:${clr(p)}"></span>${p}</td>
        <td class="r">${fmtInt(v)}</td>
        <td class="r">${fmtPct(pct)}</td>
        ${showCurules ? `<td class="r"><b>${byParty[p] || 0}</b></td>` : ""}
      </tr>`).join("")}
    </tbody>
  </table>`;
}

// ── Global controls ────────────────────────────────────────────
export function mountGlobalControls(state) {
  const slot = el("global-controls");
  if (!slot) return;
  slot.innerHTML = `
    <select id="g-nivel" class="sel-sm" title="Nivel">
      ${Object.entries(NIVEL_LABEL).map(([v, l]) =>
        `<option value="${v}"${state.nivel===v?" selected":""}>${l}</option>`).join("")}
    </select>
    <select id="g-corte" class="sel-sm" title="Corte">
      ${Object.entries(CORTE_LABEL).map(([v, l]) =>
        `<option value="${v}"${state.corte===v?" selected":""}>${l}</option>`).join("")}
    </select>`;
  el("g-nivel").addEventListener("change", e => { state.setNivel(e.target.value); state.recomputeAndRender(); });
  el("g-corte").addEventListener("change", e => { state.setCorte(e.target.value); state.recomputeAndRender(); });
}

// ── 1. DASHBOARD ──────────────────────────────────────────────
export function renderDashboard(state, ctx) {
  const nivel  = state.nivel;
  const lv     = getLevel(ctx, 2024, nivel);
  const nat    = lv.nacional;
  const ins    = nivel === "pres" ? (getInscritos(ctx, state.corte) || nat.inscritos || 0) : (nat.inscritos || 0);
  const em     = nat.emitidos || 0;
  const part   = ins ? em / ins : 0;
  const ranked = rankVotes(nat.votes, em);
  const top    = ranked[0];
  const margen = ranked.length > 1 ? ranked[0].pct - ranked[1].pct : (top?.pct || 0);

  let dipCurules = null;
  if (nivel === "dip") {
    dipCurules = simular(ctx, { nivel:"dip", year:2024, corte:state.corte }).curules?.totalByParty || {};
  }

  view().innerHTML = `
    <div class="page-header">
      <h2>Dashboard — ${NIVEL_LABEL[nivel]}</h2>
      <span class="badge">${CORTE_LABEL[state.corte]}</span>
    </div>
    <div class="kpi-grid">
      ${kpi("Padrón", fmtInt(ins), CORTE_LABEL[state.corte])}
      ${kpi("Emitidos 2024", fmtInt(em))}
      ${kpi("Participación", fmtPct(part))}
      ${kpi("Abstención", fmtPct(1-part), fmtInt(Math.round(ins*(1-part)))+" votos")}
      ${top ? kpi("Líder proyectado", top.p, fmtPct(top.pct), true) : ""}
      ${kpi("Margen 1°−2°", margen > 0 ? fmtPct(margen) : "—")}
    </div>
    <div class="row-2col" style="margin-top:16px;gap:16px;">
      <div class="card">
        <h3>Distribución — ${NIVEL_LABEL[nivel]}</h3>
        ${barChart(ranked, 7)}
        ${nivel === "dip" && dipCurules ? `
          <hr class="sep">
          <h3 style="margin-top:12px;">Curules 2024 (D'Hondt base)</h3>
          ${votesTable(ranked.filter(r=>(dipCurules[r.p]||0)>0), true, dipCurules)}
        ` : ""}
      </div>
      <div class="card">
        <h3>Resumen Ejecutivo</h3>
        <ul class="exec-list">
          ${nivel === "pres" ? `
            <li>Riesgo 2ª vuelta: <b class="${top?.pct<0.5?'text-warn':'text-ok'}">${top?.pct<0.5?"Sí (líder <50%)":"Bajo"}</b></li>
            <li>Margen sobre 2°: <b>${fmtPct(margen)}</b></li>` : ""}
          ${nivel === "dip" && dipCurules ? `
            <li>Curules ${top?.p}: <b>${dipCurules[top?.p]||0} / 190</b></li>
            <li>Mayoría (≥96): <b class="${(dipCurules[top?.p]||0)>=96?'text-ok':'text-warn'}">${(dipCurules[top?.p]||0)>=96?"Sí":"No"}</b></li>` : ""}
          ${nivel === "sen" ? `<li>32 senadores · mayoría: 17</li>` : ""}
          <li>Participación 2024: <b>${fmtPct(part)}</b></li>
          <li>Abstención: <b>${fmtInt(Math.round(ins*(1-part)))} votos</b></li>
        </ul>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" onclick="location.hash='#simulador'">Simulador →</button>
          <button class="btn-sm" onclick="location.hash='#objetivo'">Objetivo →</button>
          <button class="btn-sm" onclick="location.hash='#auditoria'">Auditoría →</button>
        </div>
      </div>
    </div>`;
}

// ── 2. MAPA ───────────────────────────────────────────────────
let _mapApi = null;

export function renderMapa(state, ctx) {
  const nivel  = state.nivel;
  const lv     = getLevel(ctx, 2024, nivel);
  const dipRes = nivel === "dip" ? simular(ctx, { nivel:"dip", year:2024 }) : null;

  view().innerHTML = `
    <div class="page-header">
      <h2>Mapa — ${NIVEL_LABEL[nivel]}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn-sm" id="map-zi">Zoom +</button>
        <button class="btn-sm" id="map-zo">Zoom −</button>
        <button class="btn-sm" id="map-r">Reset</button>
      </div>
    </div>
    <div class="map-layout">
      <div class="map-wrap card" id="map-container" style="min-height:500px;padding:0!important;"></div>
      <div class="card" id="map-panel" style="overflow-y:auto;max-height:560px;">
        <p class="muted">Haz click en una provincia.</p>
      </div>
    </div>`;

  el("map-zi").addEventListener("click", () => _mapApi?.zoomIn());
  el("map-zo").addEventListener("click", () => _mapApi?.zoomOut());
  el("map-r").addEventListener("click",  () => _mapApi?.reset());

  _mapApi = initMap({
    containerId: "map-container",
    svgUrl:      "./assets/maps/provincias.svg",
    onSelect: provId => showProvPanel(lv, provId, nivel, dipRes),
    onReady: () => {
      if (["pres","sen","dip"].includes(nivel)) {
        for (const [pid, prov] of Object.entries(lv.prov)) {
          const r = rankVotes(prov.votes, prov.emitidos);
          if (r[0]) {
            const shape = document.querySelector(`[id="DO-${pid}"]`);
            if (shape) {
              shape.style.fill    = clr(r[0].p);
              shape.style.opacity = 0.35 + r[0].pct * 0.65;
            }
          }
        }
      }
    },
  });
}

function showProvPanel(lv, provId, nivel, dipRes) {
  const panel = el("map-panel");
  if (!panel) return;
  const prov = lv.prov?.[provId];
  if (!prov) { panel.innerHTML = `<p class="muted">Sin datos para provincia ${provId}.</p>`; return; }
  const { inscritos, emitidos, validos, votes, nombre } = prov;
  const part   = inscritos ? emitidos/inscritos : 0;
  const ranked = rankVotes(votes, validos||emitidos);
  const margen = ranked.length>=2 ? ranked[0].pct - ranked[1].pct : null;

  let curulesHtml = "";
  if (nivel === "dip" && dipRes) {
    const provCircs = Object.entries(dipRes.curules?.byCirc || {})
      .filter(([k]) => k === provId || k.startsWith(provId + "-"));
    if (provCircs.length) {
      curulesHtml = `<h4 style="margin:12px 0 6px">Curules (D'Hondt base)</h4>
        <table class="tbl">
          <thead><tr><th>Circ.</th><th class="r">Esc.</th><th>Distribución</th></tr></thead>
          <tbody>${provCircs.map(([cid,c]) => `
            <tr>
              <td>${cid}</td>
              <td class="r">${c.seats}</td>
              <td>${Object.entries(c.byParty).filter(([,s])=>s>0).map(([p,s])=>`${p}:${s}`).join(", ")}</td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    }
  }

  panel.innerHTML = `
    <h3 style="margin:0 0 10px">${nombre||"Provincia "+provId}</h3>
    <div class="stat-grid" style="margin-bottom:12px;">
      <div><span class="muted">Inscritos</span><br><b>${fmtInt(inscritos)}</b></div>
      <div><span class="muted">Emitidos</span><br><b>${fmtInt(emitidos)}</b></div>
      <div><span class="muted">Participación</span><br><b>${fmtPct(part)}</b></div>
      <div><span class="muted">Margen 1°−2°</span><br><b>${margen!=null?fmtPct(margen):"—"}</b></div>
    </div>
    ${barChart(ranked, 6)}
    <div style="margin-top:10px;">${votesTable(ranked.slice(0,8))}</div>
    ${curulesHtml}`;
}

// ── 3. SIMULADOR ──────────────────────────────────────────────
export function renderSimulador(state, ctx) {
  const nivel  = state.nivel;
  const lv     = getLevel(ctx, 2024, nivel);
  const nat    = lv.nacional;
  const ranked = rankVotes(nat.votes, nat.emitidos);
  const ins    = nivel==="pres" ? (getInscritos(ctx,state.corte)||nat.inscritos||0) : (nat.inscritos||0);

  // Leer movilización preseleccionada desde módulo Movilización
  const savedMov = localStorage.getItem("sie28-sim-mov") || "0";
  localStorage.removeItem("sie28-sim-mov");

  view().innerHTML = `
    <div class="page-header"><h2>Simulador — ${NIVEL_LABEL[nivel]}</h2></div>
    <div class="sim-layout">
      <div>
        <!-- Ajuste Δpp -->
        <div class="card" style="margin-bottom:14px;">
          <h3>Ajuste por partido (Δ pp)</h3>
          <p class="muted" style="margin-bottom:8px;">Variación en puntos porcentuales de share. Se renormaliza al simular.</p>
          <div style="overflow:auto;max-height:300px;">
            <table class="tbl" id="sim-tbl">
              <thead><tr><th>Partido</th><th class="r">% base</th><th class="r">Δ pp</th></tr></thead>
              <tbody>
                ${ranked.slice(0,15).map(({p,pct}) => `
                  <tr data-p="${p}">
                    <td><span class="dot" style="background:${clr(p)}"></span>${p}</td>
                    <td class="r">${fmtPct(pct)}</td>
                    <td class="r">
                      <input class="inp-sm delta-in" type="number" step="0.1" value="0"
                        style="width:70px;text-align:right;" data-party="${p}">
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Movilización -->
        <div class="card" style="margin-bottom:14px;">
          <h3>Movilización (Δ pp padrón)</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            ${[-5,-3,3,5,7].map(pp=>`<button class="btn-sm${pp<0?" neg":""}" data-mov="${pp}">${pp>0?"+":""}${pp}</button>`).join("")}
            <input id="sim-mov" class="inp-sm" type="number" step="0.1" value="${savedMov}" style="width:70px;">
          </div>
        </div>

        <!-- Alianzas -->
        <div class="card" style="margin-bottom:14px;">
          <h3>Alianzas</h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
            <label class="muted">Líder:</label>
            <select id="sim-lider" class="sel-sm">
              ${ranked.slice(0,10).map(r=>`<option value="${r.p}">${r.p}</option>`).join("")}
            </select>
          </div>
          <div id="sim-aliados" style="max-height:180px;overflow-y:auto;">
            ${ranked.slice(0,10).slice(1).map(r=>`
              <div class="alianza-row" style="display:flex;gap:8px;align-items:center;margin-bottom:4px;" data-p="${r.p}">
                <input type="checkbox" class="alz-chk" value="${r.p}" id="alz-${r.p}">
                <label for="alz-${r.p}" style="min-width:50px;">${r.p}</label>
                <label class="muted">%:</label>
                <input class="inp-sm alz-pct" type="number" min="0" max="100" step="5" value="80"
                  style="width:60px;" data-party="${r.p}" disabled>
              </div>`).join("")}
          </div>
        </div>

        <!-- Arrastre presidencial -->
        ${nivel !== "pres" ? `
        <div class="card" style="margin-bottom:14px;">
          <h3>Arrastre presidencial</h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label><input type="checkbox" id="sim-arrastre"> Activar</label>
            <select id="sim-arr-lider" class="sel-sm">
              ${ranked.slice(0,5).map(r=>`<option value="${r.p}">${r.p}</option>`).join("")}
            </select>
            <select id="sim-arr-k" class="sel-sm">
              <option value="auto">Auto</option>
              <option value="0.60">k=0.60 (margen >10pp)</option>
              <option value="0.40">k=0.40 (5-10pp)</option>
              <option value="0.25">k=0.25 (<5pp)</option>
            </select>
          </div>
        </div>` : ""}

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn" id="btn-sim">▶ Simular</button>
          <button class="btn-sm" id="btn-sim-reset">Reset</button>
        </div>
      </div>

      <!-- Resultado -->
      <div>
        <div class="card" id="sim-result">
          <p class="muted">Configura y presiona Simular.</p>
        </div>
      </div>
    </div>`;

  // Wire
  document.querySelectorAll(".alz-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      const inp = document.querySelector(`.alz-pct[data-party="${chk.value}"]`);
      if (inp) inp.disabled = !chk.checked;
    });
  });
  document.querySelectorAll("[data-mov]").forEach(b =>
    b.addEventListener("click", () => { el("sim-mov").value = b.dataset.mov; }));
  el("sim-lider").addEventListener("change", () => {
    const lider = el("sim-lider").value;
    document.querySelectorAll(".alianza-row").forEach(row => {
      row.style.display = row.dataset.p === lider ? "none" : "";
    });
  });
  el("btn-simular")?.addEventListener("click", () => runSim(ctx, state, nivel, nat));
  el("btn-sim")?.addEventListener("click", () => runSim(ctx, state, nivel, nat));
  el("btn-sim-reset").addEventListener("click", () => {
    document.querySelectorAll(".delta-in").forEach(i => i.value="0");
    el("sim-mov").value = "0";
    document.querySelectorAll(".alz-chk").forEach(c => { c.checked=false; });
    document.querySelectorAll(".alz-pct").forEach(p => { p.disabled=true; });
    el("sim-result").innerHTML = `<p class="muted">Reset.</p>`;
  });
}

function runSim(ctx, state, nivel, nat) {
  const deltasPP = {};
  document.querySelectorAll(".delta-in").forEach(inp => {
    const v = Number(inp.value)||0;
    if (v) deltasPP[inp.dataset.party] = v;
  });
  const movPP   = Number(el("sim-mov")?.value)||0;
  const lider   = el("sim-lider")?.value||"";
  const aliados = [];
  document.querySelectorAll(".alz-chk:checked").forEach(chk => {
    const pct = Number(document.querySelector(`.alz-pct[data-party="${chk.value}"]`)?.value)||80;
    aliados.push({ partido: chk.value, transferPct: pct });
  });
  const alianzas    = lider && aliados.length ? [{ lider, aliados }] : [];
  const arrastre    = el("sim-arrastre")?.checked||false;
  const arrastreLider = el("sim-arr-lider")?.value||null;
  const kRaw        = el("sim-arr-k")?.value||"auto";
  const arrastreK   = kRaw==="auto" ? null : Number(kRaw);

  const res = simular(ctx, { nivel, year:2024, corte:state.corte, deltasPP, alianzas, movPP, arrastre, arrastreLider, arrastreK });
  renderSimResult(el("sim-result"), res, nivel, nat);
}

function renderSimResult(container, res, nivel, nat) {
  const { ranked, emitidos, inscritos, participacion, curules, senadores, ganadores } = res;
  const emBase = nat.emitidos||1;

  let extra = "";
  if (nivel==="dip" && curules) {
    const top = Object.entries(curules.totalByParty).sort(([,a],[,b])=>b-a).slice(0,10);
    const lider = top[0]?.[0];
    const liderCur = top[0]?.[1]||0;
    extra = `<hr class="sep">
      <h4>Curules D'Hondt (${curules.totalSeats}/190)</h4>
      <div class="curul-grid">${top.map(([p,s])=>`
        <div class="curul-item" style="border-left:3px solid ${clr(p)}">
          <b>${p}</b><span>${s}</span>
        </div>`).join("")}
      </div>
      <div style="margin-top:8px;">
        ${liderCur>=96
          ? `<span class="badge badge-good">Mayoría absoluta ✓ (${liderCur})</span>`
          : `<span class="badge badge-warn">Sin mayoría (${liderCur}/96 necesarios)</span>`}
      </div>`;
  }
  if (nivel==="sen" && senadores) {
    const top = Object.entries(senadores.totalByParty).sort(([,a],[,b])=>b-a);
    extra = `<hr class="sep"><h4>Senadores (32)</h4>
      <div class="curul-grid">${top.map(([p,s])=>`
        <div class="curul-item" style="border-left:3px solid ${clr(p)}"><b>${p}</b><span>${s}</span></div>`).join("")}
      </div>`;
  }
  if ((nivel==="mun"||nivel==="dm") && ganadores) {
    const tot = Object.keys(ganadores.byTerritory).length;
    const top = Object.entries(ganadores.totalByParty).sort(([,a],[,b])=>b-a);
    extra = `<hr class="sep"><h4>${NIVEL_LABEL[nivel]} — ${tot} territorios</h4>
      <div class="curul-grid">${top.slice(0,8).map(([p,s])=>`
        <div class="curul-item" style="border-left:3px solid ${clr(p)}"><b>${p}</b><span>${s}</span></div>`).join("")}
      </div>`;
  }

  container.innerHTML = `
    <h3>Resultado simulado</h3>
    <div class="stat-grid" style="margin-bottom:12px;">
      <div><span class="muted">Emitidos sim</span><br><b>${fmtInt(emitidos)}</b></div>
      <div><span class="muted">Δ vs base</span><br><b>${emitidos>emBase?"+":""}${fmtInt(emitidos-emBase)}</b></div>
      <div><span class="muted">Participación</span><br><b>${fmtPct(participacion)}</b></div>
    </div>
    ${barChart(ranked, 8)}
    <div style="margin-top:10px;">${votesTable(ranked.slice(0,10), nivel==="dip", curules?.totalByParty||{})}</div>
    ${extra}`;
}

// ── 4. POTENCIAL ──────────────────────────────────────────────
export function renderPotencial(state, ctx) {
  const nivel  = state.nivel;
  const lider  = rankVotes(getLevel(ctx,2024,nivel).nacional.votes, getLevel(ctx,2024,nivel).nacional.emitidos)[0]?.p || "PRM";
  const data   = calcPotencial(ctx, nivel, lider);
  const cats   = ["Fortaleza","Oportunidad","Disputa","Crecimiento","Adverso","Baja prioridad"];

  view().innerHTML = `
    <div class="page-header">
      <h2>Potencial — ${NIVEL_LABEL[nivel]}</h2>
      <span class="muted">Ref: <b>${lider}</b> · Score 0–100</span>
    </div>
    <div class="kpi-grid" style="margin-bottom:14px;">
      ${cats.map(cat => {
        const count = data.filter(r=>r.categoria.label===cat).length;
        return kpi(cat, count);
      }).join("")}
    </div>
    <div class="card" style="overflow:auto;max-height:65vh;">
      <table class="tbl">
        <thead><tr>
          <th>#</th><th>Territorio</th>
          <th class="r">Score</th><th>Categoría</th>
          <th class="r">% ${lider} 24</th>
          <th class="r">Tend. 24-20</th>
          <th class="r">Abstención</th>
          <th class="r">Margen</th>
          <th class="r">Inscritos</th>
        </tr></thead>
        <tbody>
          ${data.map((r,i) => `
            <tr>
              <td class="muted">${i+1}</td>
              <td><b>${r.nombre}</b></td>
              <td class="r"><b>${r.score}</b></td>
              <td><span class="cat-badge ${r.categoria.cls}">${r.categoria.label}</span></td>
              <td class="r">${fmtPct(r.pct24)}</td>
              <td class="r ${r.tendencia>0?'text-ok':r.tendencia<0?'text-warn':''}">
                ${r.pct20!=null?(r.tendencia>0?"+":"")+fmtPct(r.tendencia):"—"}
              </td>
              <td class="r">${fmtPct(r.abst)}</td>
              <td class="r">${fmtPct(r.margen)}</td>
              <td class="r">${fmtInt(r.padron)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ── 5. MOVILIZACIÓN ───────────────────────────────────────────
export function renderMovilizacion(state, ctx) {
  const nivel  = state.nivel;
  const lv     = getLevel(ctx, 2024, nivel);
  const nat    = lv.nacional;
  const ins    = nivel==="pres" ? (getInscritos(ctx,state.corte)||nat.inscritos||0) : (nat.inscritos||0);
  const em     = nat.emitidos||0;
  const abst   = ins-em;
  const cap    = Math.round(abst*0.6);
  const k      = MOV_COEF[nivel]||1;
  const lv20   = getLevel(ctx, 2020, nivel);
  const terr24 = nivel==="mun" ? lv.mun : nivel==="dm" ? lv.dm : lv.prov;
  const terr20 = nivel==="mun" ? lv20.mun : nivel==="dm" ? lv20.dm : lv20.prov;

  const rows = Object.entries(terr24).map(([id,t]) => {
    const t20    = terr20?.[id];
    const a24    = t.inscritos ? 1-(t.emitidos/t.inscritos) : 0;
    const a20    = t20?.inscritos ? 1-(t20.emitidos/t20.inscritos) : null;
    return { id, nombre:t.nombre||id, a24, delta:a20!=null?a24-a20:null, ins:t.inscritos||0 };
  }).sort((a,b)=>b.a24-a.a24).slice(0,30);

  view().innerHTML = `
    <div class="page-header"><h2>Movilización — ${NIVEL_LABEL[nivel]}</h2></div>
    <div class="row-2col" style="gap:14px;">
      <div>
        <div class="card" style="margin-bottom:14px;">
          <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
            ${kpi("Inscritos", fmtInt(ins))}
            ${kpi("Emitidos 2024", fmtInt(em))}
            ${kpi("Abstención", fmtInt(abst), fmtPct(ins?abst/ins:0))}
            ${kpi("Techo (60% abst.)", fmtInt(cap))}
            ${kpi(`Coef. ${nivel}`, k.toFixed(2))}
          </div>
        </div>
        <div class="card" style="margin-bottom:14px;">
          <h3>Escenarios</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
            ${[-5,-3,3,5,7].map(pp=>`<button class="btn-sm${pp<0?" neg":""}" data-pp="${pp}">${pp>0?"+":""}${pp} pp</button>`).join("")}
            <input id="mov-pp" class="inp-sm" type="number" step="0.1" value="0" style="width:72px;">
            <button class="btn" id="mov-calc">Calcular</button>
          </div>
          <div id="mov-result" style="display:none;">
            <div class="stat-grid">
              <div><span class="muted">Votos brutos</span><br><b id="mv-raw">—</b></div>
              <div><span class="muted">Aplicados (cap)</span><br><b id="mv-used">—</b></div>
              <div><span class="muted">% padrón</span><br><b id="mv-pct">—</b></div>
              <div><span class="muted">Nuevos emitidos</span><br><b id="mv-em">—</b></div>
            </div>
            <button class="btn-sm" id="mov-to-sim" style="margin-top:10px;">Aplicar al Simulador →</button>
          </div>
        </div>
      </div>
      <div class="card" style="overflow:auto;max-height:500px;">
        <h3>Top 30 por abstención</h3>
        <table class="tbl">
          <thead><tr>
            <th>Territorio</th><th class="r">Abst. 24</th>
            <th class="r">Δ 24-20</th><th class="r">Inscritos</th>
          </tr></thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${r.nombre}</td>
                <td class="r">${fmtPct(r.a24)}</td>
                <td class="r ${r.delta!=null?(r.delta>0?'text-warn':'text-ok'):''}">
                  ${r.delta!=null?(r.delta>0?"+":"")+fmtPct(r.delta):"—"}
                </td>
                <td class="r">${fmtInt(r.ins)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  function calc(pp) {
    const raw  = Math.round(ins*(pp/100)*k);
    const used = pp>=0 ? Math.min(raw,cap) : Math.max(raw,-Math.round(em*0.05));
    el("mov-result").style.display="";
    el("mv-raw").textContent  = fmtInt(raw);
    el("mv-used").textContent = fmtInt(used);
    el("mv-pct").textContent  = fmtPct(ins?Math.abs(used)/ins:0);
    el("mv-em").textContent   = fmtInt(em+used);
  }
  document.querySelectorAll("[data-pp]").forEach(b =>
    b.addEventListener("click",()=>{ el("mov-pp").value=b.dataset.pp; calc(Number(b.dataset.pp)); }));
  el("mov-calc").addEventListener("click",()=>calc(Number(el("mov-pp").value)||0));
  el("mov-to-sim")?.addEventListener("click",()=>{
    const pp=Number(el("mov-pp").value)||0;
    localStorage.setItem("sie28-sim-mov",String(pp));
    location.hash="#simulador";
    toast(`+${pp}pp cargado en Simulador`);
  });
}

// ── 6. OBJETIVO ───────────────────────────────────────────────
export function renderObjetivo(state, ctx) {
  const nivel  = state.nivel;
  const ranked = rankVotes(getLevel(ctx,2024,nivel).nacional.votes, getLevel(ctx,2024,nivel).nacional.emitidos);

  view().innerHTML = `
    <div class="page-header"><h2>Objetivo — ${NIVEL_LABEL[nivel]}</h2></div>
    <div class="row-2col" style="gap:14px;">
      <div class="card">
        <h3>Configurar meta</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label class="muted">Partido objetivo</label>
            <select id="obj-partido" class="sel-sm" style="width:100%;margin-top:4px;">
              ${ranked.map(r=>`<option value="${r.p}">${r.p}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="muted">${nivel==="dip"?"Curules objetivo (de 190)":"% votos objetivo"}</label>
            <input id="obj-meta" class="inp-sm" type="number"
              step="${nivel==="dip"?1:0.1}"
              value="${nivel==="dip"?96:51}"
              style="width:100%;margin-top:4px;">
          </div>
          <div>
            <label class="muted">Δ pp movilización (contexto)</label>
            <input id="obj-mov" class="inp-sm" type="number" step="0.1" value="0" style="width:100%;margin-top:4px;">
          </div>
          ${nivel!=="pres"?`
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="obj-arrastre">
            Incluir arrastre presidencial
          </label>`:""}
          <button class="btn" id="obj-calc">Calcular escenarios</button>
        </div>
      </div>
      <div id="obj-result">
        <div class="card"><p class="muted">Configura la meta y presiona Calcular.</p></div>
      </div>
    </div>`;

  el("obj-calc").addEventListener("click", () => {
    const lider    = el("obj-partido").value;
    const meta     = Number(el("obj-meta").value)||(nivel==="dip"?96:51);
    const movPP    = Number(el("obj-mov").value)||0;
    const arrastre = el("obj-arrastre")?.checked||false;
    el("obj-result").innerHTML = `<div class="card"><p class="muted">Calculando…</p></div>`;
    setTimeout(()=>{
      try {
        const esc = generarEscenarios(ctx, { lider, nivel, metaValor:meta, arrastre, movPP, year:2024 });
        renderObjResult(el("obj-result"), esc, nivel, lider);
      } catch(e) {
        el("obj-result").innerHTML = `<div class="card"><p class="muted">Error: ${e.message}</p></div>`;
      }
    }, 10);
  });
}

function renderObjResult(container, esc, nivel, lider) {
  const labels = {
    conservador: { label:"Conservador", cls:"cat-blue",   desc:"90% de la meta" },
    razonable:   { label:"Razonable",   cls:"cat-green",  desc:"100% de la meta" },
    optimizado:  { label:"Optimizado",  cls:"cat-yellow", desc:"105% de la meta" },
    agresivo:    { label:"Agresivo",    cls:"cat-orange", desc:"112% de la meta" },
  };
  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;">
    ${Object.entries(esc).map(([key,e]) => {
      const info = labels[key];
      if (e.imposible) {
        const max = nivel==="dip"
          ? `${Math.round(e.maximo)} curules`
          : `${(e.maximo*100).toFixed(1)}%`;
        return `<div class="card">
          <span class="cat-badge cat-red">${info.label}</span>
          <p style="margin-top:8px;" class="muted">Imposible. Máximo alcanzable: <b>${max}</b></p>
        </div>`;
      }
      const res   = e.resultado;
      const found = res?.ranked?.find(r=>r.p===lider);
      const valor = nivel==="dip"
        ? `${res?.curules?.totalByParty?.[lider]||0} curules`
        : (found?fmtPct(found.pct):"—");
      const delta = e.deltaPP!=null ? `${e.deltaPP>=0?"+":""}${e.deltaPP.toFixed(1)} pp` : "—";
      const narrs = {
        conservador: `Escenario mínimo viable. Requiere ${delta} para ${lider}.`,
        razonable:   `Objetivo central. Con ${delta} para ${lider}: ${valor}.`,
        optimizado:  `Alta eficiencia. Posible con alianzas parciales (${delta}).`,
        agresivo:    `Máximo posible. Requiere coalición amplia + movilización (${delta}).`,
      };
      return `<div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span class="cat-badge ${info.cls}">${info.label}</span>
          <span class="muted">${info.desc}</span>
        </div>
        <div class="stat-grid">
          <div><span class="muted">Δ pp requerido</span><br><b>${delta}</b></div>
          <div><span class="muted">Resultado ${lider}</span><br><b>${valor}</b></div>
          <div><span class="muted">Participación</span><br><b>${fmtPct(res?.participacion||0)}</b></div>
        </div>
        <p class="muted" style="margin-top:8px;">${narrs[key]}</p>
      </div>`;
    }).join("")}
  </div>`;
}

// ── 7. AUDITORÍA ──────────────────────────────────────────────
export function renderAuditoria(state, ctx) {
  const audit = runAuditoria(ctx);
  view().innerHTML = `
    <div class="page-header">
      <h2>Auditoría de Datos</h2>
      <span class="badge badge-err">⚠ ${audit.resumen.errores}</span>
      <span class="badge badge-good">✓ ${audit.resumen.correctos}</span>
    </div>
    <div class="row-2col" style="gap:14px;">
      <div class="card">
        <h3 style="color:var(--red)">Alertas (${audit.issues.length})</h3>
        ${audit.issues.length
          ? `<ul class="audit-list err">${audit.issues.map(i=>`<li>${i.msg}</li>`).join("")}</ul>`
          : `<p class="muted">Sin alertas. Datos íntegros.</p>`}
      </div>
      <div class="card">
        <h3 style="color:var(--green)">Validaciones OK (${audit.ok.length})</h3>
        <ul class="audit-list good">${audit.ok.map(i=>`<li>${i.msg}</li>`).join("")}</ul>
      </div>
    </div>`;
}

// ── BOLETA ÚNICA (H3) ─────────────────────────────────────────

export function renderBoleta(state, ctx) {
  const lv     = getLevel(ctx, 2024, "dip");
  const ranked = rankVotes(lv.nacional.votes, lv.nacional.emitidos);
  const parties = ranked.slice(0, 12).map(r => r.p);

  view().innerHTML = `
    <div class="page-header">
      <h2>Boleta Única Opositora — Optimización Legislativa</h2>
    </div>
    <div class="row-2col" style="gap:14px;">
      <div class="card">
        <h3>Configurar coalición</h3>
        <p class="muted" style="margin-bottom:10px;">Selecciona partidos, quién encabeza y % de transferencia de votos.</p>
        <table class="tbl" id="boleta-tbl">
          <thead><tr>
            <th>Partido</th><th>Incluir</th><th>Encabeza</th><th class="r">Transf. %</th>
          </tr></thead>
          <tbody>
            ${parties.map(p => `
              <tr data-p="${p}">
                <td><span class="dot" style="background:${clr(p)}"></span>${p}</td>
                <td><input type="checkbox" class="bl-chk" value="${p}"></td>
                <td><input type="radio" name="bl-lider" class="bl-lid" value="${p}"></td>
                <td class="r">
                  <input class="inp-sm bl-pct" type="number" min="0" max="100" step="5" value="85"
                    style="width:60px;" data-party="${p}" disabled>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
        <div style="margin-top:12px;">
          <button class="btn" id="btn-boleta">▶ Simular boleta</button>
        </div>
      </div>
      <div id="boleta-result">
        <div class="card"><p class="muted">Selecciona al menos un partido + líder y presiona Simular.</p></div>
      </div>
    </div>`;

  document.querySelectorAll(".bl-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      const pct = document.querySelector(`.bl-pct[data-party="${chk.value}"]`);
      if (pct) pct.disabled = !chk.checked;
    });
  });

  el("btn-boleta").addEventListener("click", () => {
    const liderEl = document.querySelector(".bl-lid:checked");
    if (!liderEl) { toast("Selecciona quién encabeza la coalición"); return; }
    const lider = liderEl.value;
    const partidos = parties.map(p => ({
      partido: p,
      incluir: p === lider || (document.querySelector(`.bl-chk[value="${p}"]`)?.checked || false),
      encabeza: p === lider,
      transferPct: Number(document.querySelector(`.bl-pct[data-party="${p}"]`)?.value) || 85,
    }));
    const res = simBoleta(ctx, { partidos, year: 2024 });
    if (!res) { toast("Error al simular boleta"); return; }
    renderBoletaResult(el("boleta-result"), res);
  });
}

function renderBoletaResult(container, res) {
  const { lider, baseTotal, boletaTotal, ganados, perdidos, deltaLider } = res;
  const baseL   = baseTotal[lider]   || 0;
  const boletaL = boletaTotal[lider] || 0;

  container.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <h3>Impacto en ${lider}</h3>
      <div class="stat-grid">
        <div><span class="muted">Curules base</span><br><b>${baseL}</b></div>
        <div><span class="muted">Curules boleta</span><br><b>${boletaL}</b></div>
        <div><span class="muted">Diferencia</span><br>
          <b class="${deltaLider>0?'text-ok':deltaLider<0?'text-warn':''}">${deltaLider>0?"+":""}${deltaLider}</b>
        </div>
      </div>
      ${boletaL>=96
        ? `<span class="badge badge-good" style="margin-top:8px;">Mayoría absoluta con boleta ✓</span>`
        : `<span class="badge badge-warn" style="margin-top:8px;">Sin mayoría (${boletaL}/96) con boleta</span>`}
    </div>

    ${ganados.length ? `
    <div class="card" style="margin-bottom:12px;">
      <h3 style="color:var(--green)">Demarcaciones donde gana curules (${ganados.length})</h3>
      <table class="tbl">
        <thead><tr><th>Demarcación</th><th class="r">Esc.</th><th>Base</th><th>Con boleta</th><th class="r">Δ</th></tr></thead>
        <tbody>
          ${ganados.map(t=>`
            <tr>
              <td>${t.provincia}${t.circ>0?" C"+t.circ:""}</td>
              <td class="r">${t.seats}</td>
              <td class="muted">${t.baseDistrib}</td>
              <td>${t.boletaDistrib}</td>
              <td class="r text-ok">+${t.delta}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}

    ${perdidos.length ? `
    <div class="card">
      <h3 style="color:var(--yellow)">Donde pierde curules (${perdidos.length})</h3>
      <table class="tbl">
        <thead><tr><th>Demarcación</th><th class="r">Esc.</th><th>Base</th><th>Con boleta</th><th class="r">Δ</th></tr></thead>
        <tbody>
          ${perdidos.map(t=>`
            <tr>
              <td>${t.provincia}${t.circ>0?" C"+t.circ:""}</td>
              <td class="r">${t.seats}</td>
              <td class="muted">${t.baseDistrib}</td>
              <td>${t.boletaDistrib}</td>
              <td class="r text-warn">${t.delta}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}`;
}

export { exportarPDF };

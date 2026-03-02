import {toast} from "./toast.js";
import { getCTX } from "../core/data.js";
import {dhondt} from "../core/dhondt.js";
import {formatPct, clamp} from "../core/utils.js";

const NIVEL_LABEL = {pres:"Presidencial", sen:"Senadores", dip:"Diputados", mun:"Alcaldes", dm:"DM"};
const CORTE_OPTIONS = ["Mayo 2024","Base 2024","Proyección 2028","Febrero 2024"];

function getLevel(ctxYearObj, nivel){
  return (ctxYearObj && ctxYearObj[nivel]) ? ctxYearObj[nivel] : {nacional:{meta:{},votes:{}}, territorios:{}};
}


let CTX = null;
async function getCtx(){
  return await getCTX();
}


function moduleControlsHtml(state, moduleId){
  const eff = state.getEffective ? state.getEffective(moduleId) : {nivel:"dip", corte:"Base 2024", override:false};
  const o = (state.overrides && state.overrides[moduleId]) || {enabled:false, nivel:null, corte:null};
  const checked = o.enabled ? "checked" : "";
  return `
    <div class="card" style="padding:10px; margin-bottom:12px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="badge">Global: ${NIVEL_LABEL[state.global?.nivel||eff.nivel]||eff.nivel} · ${state.global?.corte||eff.corte}</span>
        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="override-${moduleId}" ${checked}/> Override
        </label>
        <span class="badge" id="override-label-${moduleId}" style="display:${checked?'inline-flex':'none'};">Override activo</span>
        <select id="module-corte-${moduleId}" class="select-sm" ${checked?'' :'disabled'}>
          ${CORTE_OPTIONS.map(c=>`<option value="${c}" ${((o.corte||eff.corte)===c)?'selected':''}>${c}</option>`).join("")}
        </select>
        <select id="module-nivel-${moduleId}" class="select-sm" ${checked?'' :'disabled'}>
          ${Object.keys(NIVEL_LABEL).map(n=>`<option value="${n}" ${((o.nivel||eff.nivel)===n)?'selected':''}>${NIVEL_LABEL[n]}</option>`).join("")}
        </select>
        <button class="btn-sm" id="module-follow-${moduleId}">Seguir global</button>
      </div>
    </div>
  `;
}

function wireModuleControls(state, moduleId, rerender){
  const chk = document.getElementById(`override-${moduleId}`);
  const selC = document.getElementById(`module-corte-${moduleId}`);
  const selN = document.getElementById(`module-nivel-${moduleId}`);
  const lab = document.getElementById(`override-label-${moduleId}`);
  const follow = document.getElementById(`module-follow-${moduleId}`);
  if(!chk||!selC||!selN) return;

  chk.addEventListener("change", ()=>{
    state.setOverride(moduleId, {enabled: chk.checked});
    selC.disabled = !chk.checked;
    selN.disabled = !chk.checked;
    lab.style.display = chk.checked ? "inline-flex" : "none";
    rerender();
  });
  selC.addEventListener("change", ()=>{ state.setOverride(moduleId, {corte: selC.value}); rerender(); });
  selN.addEventListener("change", ()=>{ state.setOverride(moduleId, {nivel: selN.value}); rerender(); });
  follow?.addEventListener("click", ()=>{ state.setOverride(moduleId, {enabled:false, corte:null, nivel:null}); rerender(); });
}

function presToMetaVotes(obj){
  const d = obj?.data || {};
  const meta = { inscrito: obj?.meta?.inscritos ?? d.INSCRITOS ?? null, inscritos: obj?.meta?.inscritos ?? d.INSCRITOS ?? null, emitidos: d.EMITIDOS ?? 0, validos: d.VALIDOS ?? 0, nulos: d.NULOS ?? 0 };
  const votes = {};
  Object.keys(d).forEach(k=>{ if(["EMITIDOS","VALIDOS","NULOS","INSCRITOS"].includes(k)) return; votes[k] = Number(d[k]||0); });
  return {meta, votes, nombre: obj?.nombre || ""};
}

function getLevelBundle(r, nivel){
  return getLevel(r, nivel);
}


function partyList(votes){ return Object.keys(votes||{}).filter(k=>k && !["EMITIDOS","VALIDOS","NULOS","INSCRITOS"].includes(k)); }
function fmtInt(n){ return (Number(n)||0).toLocaleString("en-US"); }
function getMainContainer(){ return document.getElementById("view") || document.querySelector("#view") || document.body; }
function cardKPI(title, value, sub=""){ return `<div class="kpi-card"><div class="kpi-title">${title}</div><div class="kpi-value">${value}</div>${sub?`<div class="kpi-sub">${sub}</div>`:""}</div>`; }

export async function renderDashboard(state, moduleId="dashboard"){
  const cont = getMainContainer();
  const eff = state.getEffective(moduleId);
  const ctx = await getCtx();
  const nivel = eff.nivel;
  const b = getLevel(ctx.normalized[2024], nivel);
  const pad = ctx.pad?.mayo2024?.nacional?.inscritos ?? null;
  const meta = b?.nacional?.meta || {};
  const inscritos = (nivel==="pres" && pad) ? pad : (meta.inscritos||0);
  const emitidos = meta.emitidos||0;
  const part = inscritos ? emitidos/inscritos : 0;
  const votes = b?.nacional?.votes || {};
  const plist = partyList(votes);
  let top="—";
  if(plist.length){
    const sorted = plist.map(p=>[p,Number(votes[p]||0)]).sort((a,b)=>b[1]-a[1]);
    top = `${sorted[0][0]} (${formatPct(sorted[0][1]/(emitidos||1))})`;
  }
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="grid-kpi">
      ${cardKPI("Padrón base", pad?fmtInt(pad):fmtInt(inscritos), "Mayo 2024")}
      ${cardKPI("Participación base", formatPct(part))}
      ${cardKPI("Abstención base", formatPct(1-part))}
      ${cardKPI("Proyección actual", top, NIVEL_LABEL[nivel])}
      ${cardKPI("Meta", "—")}
      ${cardKPI("Gap vs meta", "—")}
    </div>
    <div class="card" style="padding:14px; margin-top:12px;">
      <h3 style="margin:0 0 8px 0;">Resumen ejecutivo</h3>
      <ul style="margin:0; padding-left:18px;">
        <li>Territorios críticos: <b>pendiente</b></li>
        <li>Riesgo presidencial: <b>${nivel==="pres" ? ( (1-part)<0.5 ? "Medio" : "—") : "—" }</b></li>
        <li>Curules decisivos: <b>${nivel==="dip" ? "pendiente" : "—"}</b></li>
      </ul>
      <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
        <a class="btn" href="#simulador">Ir a Simulador</a>
        <a class="btn" href="#objetivo">Ir a Objetivo</a>
      </div>
    </div>
  `;
  wireModuleControls(state, moduleId, ()=>renderDashboard(state,moduleId));
}

export async function renderMapa(state, mapApi, moduleId="mapa"){
  const cont = getMainContainer();
  const eff = state.getEffective(moduleId);
  const ctx = await getCtx();
  const nivel = eff.nivel;
  const b = getLevel(ctx.normalized[2024], nivel);
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="layout-2col">
      <div class="card" style="padding:10px;">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
          <button class="btn-sm" id="map-zoom-in">Zoom +</button>
          <button class="btn-sm" id="map-zoom-out">Zoom -</button>
          <button class="btn-sm" id="map-reset">Reset</button>
          <span class="badge">Modo: Resultado</span>
        </div>
        <div id="map-container" style="height:560px;"></div>
      </div>
      <div class="card" style="padding:12px;" id="map-panel">
        <h3 style="margin:0 0 8px 0;">Seleccione un territorio</h3>
        <div class="muted">Click en el mapa.</div>
      </div>
    </div>
  `;
  document.getElementById("map-zoom-in")?.addEventListener("click", ()=>mapApi.zoomIn());
  document.getElementById("map-zoom-out")?.addEventListener("click", ()=>mapApi.zoomOut());
  document.getElementById("map-reset")?.addEventListener("click", ()=>mapApi.reset());

  const svgUrl = "./assets/maps/provincias.svg";
  mapApi.load(svgUrl, (territoryId)=>{
    const panel = document.getElementById("map-panel");
    const provId = String(territoryId).replace(/\\D/g,"").padStart(2,"0");
    let obj = null;
    if(nivel==="pres" || nivel==="sen" || nivel==="dip") obj = b?.territorios?.[provId] || null;
    if(!obj){
      panel.innerHTML = `<h3 style="margin:0 0 8px 0;">${territoryId}</h3><div class="muted">No hay data.</div>`;
      return;
    }
    const meta = obj.meta || {};
    const votes = obj.votes || {};
    const parties = partyList(votes);
    const sorted = parties.map(p=>[p,Number(votes[p]||0)]).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const top1=sorted[0]?.[1]||0, top2=sorted[1]?.[1]||0;
    const margen = (meta.validos||meta.emitidos) ? ((top1-top2)/((meta.validos||meta.emitidos)||1)) : 0;
    panel.innerHTML = `
      <h3 style="margin:0 0 8px 0;">${obj.nombre || ("Provincia "+provId)}</h3>
      <div class="grid-2" style="margin-bottom:10px;">
        <div><span class="muted">Inscritos</span><div><b>${fmtInt(meta.inscritos||0)}</b></div></div>
        <div><span class="muted">Emitidos</span><div><b>${fmtInt(meta.emitidos||0)}</b></div></div>
        <div><span class="muted">Participación</span><div><b>${formatPct((meta.inscritos? (meta.emitidos/meta.inscritos):0))}</b></div></div>
        <div><span class="muted">Margen top1-top2</span><div><b>${formatPct(margen)}</b></div></div>
      </div>
      <div class="muted" style="margin-bottom:6px;">Top partidos</div>
      <table class="table">
        <thead><tr><th>Partido</th><th style="text-align:right;">Votos</th></tr></thead>
        <tbody>${sorted.map(([p,v])=>`<tr><td>${p}</td><td style="text-align:right;">${fmtInt(v)}</td></tr>`).join("")}</tbody>
      </table>
    `;
  });
  wireModuleControls(state, moduleId, ()=>renderMapa(state,mapApi,moduleId));
}

export async function renderSimulador(state, moduleId="simulador"){
  const cont = getMainContainer();
  const eff = state.getEffective(moduleId);
  const ctx = await getCtx();
  const nivel = eff.nivel;
  const b = getLevel(ctx.normalized[2024], nivel);
  const base = b.nacional || {meta:{}, votes:{}};
  const votes = {...(base.votes||{})};
  const parties = partyList(votes).sort();
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="card" style="padding:14px;">
      <h3 style="margin:0 0 10px 0;">Simulador (${NIVEL_LABEL[nivel]})</h3>
      <div class="muted" style="margin-bottom:10px;">Ajustes simples por partido (Δ puntos porcentuales de share). Alianzas/movilización se habilitan en siguiente iteración.</div>
      <div style="overflow:auto; max-height:520px;">
        <table class="table" id="sim-table">
          <thead><tr><th>Partido</th><th style="text-align:right;">Votos base</th><th style="text-align:right;">Δ%</th><th style="text-align:right;">Votos sim</th></tr></thead>
          <tbody>${parties.map(p=>`<tr data-p="${p}"><td>${p}</td><td style="text-align:right;">${fmtInt(votes[p])}</td><td style="text-align:right;"><input class="input-sm" type="number" step="0.1" value="0" style="width:80px;" /></td><td style="text-align:right;" class="sim-v">${fmtInt(votes[p])}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn" id="btn-simular">Simular</button>
        <span class="badge" id="sim-note">—</span>
      </div>
    </div>
  `;
  document.getElementById("btn-simular")?.addEventListener("click", ()=>{
    const rows = Array.from(document.querySelectorAll("#sim-table tbody tr"));
    const total = Object.values(votes).reduce((a,b)=>a+Number(b||0),0) || 1;
    const shares = {};
    rows.forEach(tr=>{
      const p=tr.getAttribute("data-p");
      const delta=Number(tr.querySelector("input")?.value||0);
      const baseShare=(votes[p]||0)/total;
      shares[p]=clamp(baseShare + (delta/100), 0, 1);
    });
    const sum = Object.values(shares).reduce((a,b)=>a+b,0)||1;
    let simTotal=0;
    rows.forEach(tr=>{
      const p=tr.getAttribute("data-p");
      const v=Math.round((shares[p]/sum)*total);
      tr.querySelector(".sim-v").textContent=fmtInt(v);
      simTotal+=v;
    });
    document.getElementById("sim-note").textContent=`Total sim: ${fmtInt(simTotal)} (base ${fmtInt(total)})`;
  });
  wireModuleControls(state, moduleId, ()=>renderSimulador(state,moduleId));
}

export async function renderPotencial(state, moduleId="potencial"){
  const cont = getMainContainer();
  const eff = state.getEffective(moduleId);
  const ctx = await getCtx();
  const nivel = eff.nivel;
  const b24 = getLevel(ctx.normalized[2024], nivel);
  const scope = "territorios";
  const t24 = b24.territorios || {};
  const rows = Object.entries(t24).map(([id,obj])=>{
    const meta=obj.meta||{};
    const abst = meta.inscritos ? (1-(meta.emitidos/meta.inscritos)) : 0;
    const score = Math.round(abst*100);
    return {id, nombre: obj.nombre||id, score, abst};
  }).sort((a,b)=>b.score-a.score).slice(0,200);
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="card" style="padding:14px;">
      <h3 style="margin:0 0 10px 0;">Potencial (${NIVEL_LABEL[nivel]})</h3>
      <div class="muted" style="margin-bottom:10px;">Ranking preliminar por abstención (proxy). Motor completo se activa luego.</div>
      <div style="overflow:auto; max-height:620px;">
        <table class="table"><thead><tr><th>Territorio</th><th style="text-align:right;">Score</th><th style="text-align:right;">Abst.</th></tr></thead>
          <tbody>${rows.map(r=>`<tr><td>${r.nombre}</td><td style="text-align:right;"><b>${r.score}</b></td><td style="text-align:right;">${formatPct(r.abst)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
  wireModuleControls(state, moduleId, ()=>renderPotencial(state,moduleId));
}

export async function renderMovilizacion(state, moduleId="movilizacion"){
  const cont = getMainContainer();
  const eff = state.getEffective(moduleId);
  const ctx = await getCtx();
  const nivel = eff.nivel;
  const b = getLevel(ctx.normalized[2024], nivel);
  const meta = b.nacional.meta||{};
  const abstVotes = Math.round((meta.inscritos||0)-(meta.emitidos||0));
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="card" style="padding:14px;">
      <h3 style="margin:0 0 10px 0;">Movilización (${NIVEL_LABEL[nivel]})</h3>
      <div class="grid-2">
        <div><div class="muted">Inscritos</div><div><b>${fmtInt(meta.inscritos||0)}</b></div></div>
        <div><div class="muted">Emitidos</div><div><b>${fmtInt(meta.emitidos||0)}</b></div></div>
        <div><div class="muted">Abstención (votos)</div><div><b>${fmtInt(abstVotes)}</b></div></div>
        <div><div class="muted">Techo (60% abstención)</div><div><b>${fmtInt(Math.round(abstVotes*0.6))}</b></div></div>
      </div>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-sm" data-pp="3">+3pp</button>
        <button class="btn-sm" data-pp="5">+5pp</button>
        <button class="btn-sm" data-pp="7">+7pp</button>
        <input id="mov-pp" class="input-sm" type="number" step="0.1" placeholder="+pp" style="width:100px;" />
        <button class="btn" id="mov-apply">Aplicar</button>
        <span class="badge" id="mov-note">—</span>
      </div>
    </div>
  `;
  const apply = (pp)=>{
    pp=Number(pp||0);
    const delta=Math.round((meta.inscritos||0)*(pp/100));
    const cap=Math.round(((meta.inscritos||0)-(meta.emitidos||0))*0.6);
    const used=Math.min(Math.max(delta,0),cap);
    document.getElementById("mov-note").textContent=`Movilización: ${fmtInt(used)} votos (cap ${fmtInt(cap)})`;
  };
  document.querySelectorAll("[data-pp]").forEach(b=>b.addEventListener("click", ()=>apply(b.getAttribute("data-pp"))));
  document.getElementById("mov-apply")?.addEventListener("click", ()=>apply(document.getElementById("mov-pp")?.value));
  wireModuleControls(state, moduleId, ()=>renderMovilizacion(state,moduleId));
}

export async function renderObjetivo(state, moduleId="objetivo"){
  const cont=getMainContainer();
  const eff=state.getEffective(moduleId);
  const nivel=eff.nivel;
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="card" style="padding:14px;">
      <h3 style="margin:0 0 10px 0;">Objetivo (${NIVEL_LABEL[nivel]})</h3>
      <div class="muted">Optimizador se habilita en iteración siguiente.</div>
    </div>
  `;
  wireModuleControls(state, moduleId, ()=>renderObjetivo(state,moduleId));
}

export async function renderEncuestas(state, moduleId="encuestas"){
  const cont=getMainContainer();
  const ctx=await getCtx();
  const polls=ctx.polls||{};
  const series=polls.series||polls.data||polls||[];
  cont.innerHTML = `
    ${moduleControlsHtml(state, moduleId)}
    <div class="card" style="padding:14px;">
      <h3 style="margin:0 0 10px 0;">Encuestas</h3>
      <pre style="white-space:pre-wrap; overflow:auto; max-height:520px;">${JSON.stringify(series,null,2).slice(0,4000)}</pre>
    </div>
  `;
  wireModuleControls(state, moduleId, ()=>renderEncuestas(state,moduleId));
}


import {toast} from "./toast.js";
import {loadPolls} from "../core/polls.js";
import {dhondt, nextSeatGap} from "../core/dhondt.js";
import {allocateTerritorialSeats, allocateCircSeats} from "../core/redistribucion.js";

export async function renderDashboard(state){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>Dashboard Ejecutivo</h2>
        <div class="kpis">
          <div class="kpi"><div class="label">Meta Presidencial</div><div class="value" id="kpi-pres">—</div><div class="sub">Editable por escenario</div></div>
          <div class="kpi"><div class="label">Meta Legislativa</div><div class="value" id="kpi-leg">≥96</div><div class="sub">Mayoría simple</div></div>
          <div class="kpi"><div class="label">Meta Alcaldías</div><div class="value" id="kpi-alc">—</div><div class="sub">Editable por escenario</div></div>
        </div>
        <hr/>
        <div class="row">
          <div class="pill warn">Base 2028 = 2024</div>
          <div class="pill">Modo territorial: <b>${state.modoTerritorial}</b></div>
        </div>
        <p class="small">Este dashboard resume el escenario activo. El cálculo fino (D'Hondt, alianzas por provincia, elasticidad y Monte Carlo) se configura desde <b>Simulador</b> y <b>Encuestas</b>.</p>
      </div>
      <div class="card">
        <h2>Estado de datos</h2>
        <div id="data-status" class="small">Cargando…</div>
      </div>
    </div>
  `;

  const status = document.getElementById("data-status");
  const polls = await loadPolls("./data/polls.json");
  const curules = await fetch("./data/curules_2024.json",{cache:"no-store"}).then(r=>r.json()).catch(()=>null);

  const lines = [];
  lines.push(curules ? `<div class="pill good">Curules 2024 cargadas: ${curules.meta.total_diputados} (178 territorial + 7 exterior + 5 nacionales)</div>` :
                       `<div class="pill bad">No se pudieron cargar curules_2024.json</div>`);
  lines.push(polls.ok ? `<div class="pill good">Encuestas cargadas: ${polls.polls.length}</div>` :
                        `<div class="pill warn">Encuestas: ${polls.error} (fallback: base 2024)</div>`);
  status.innerHTML = lines.join("<br/>");
}

export async function renderMapa(state, mapApi){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card">
      <h2>Mapa Interactivo</h2>
      <div class="row">
        <label>Modo</label>
        <select id="map-mode">
          <option value="prov" selected>Provincial</option>
          <option value="reg">Regional</option>
        </select>
        <span class="small">Click en una demarcación para ver detalles (placeholder).</span>
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
          <div id="map-panel" class="small">Selecciona una provincia/región en el mapa.</div>
        </div>
        <div>
          <h2 style="margin-top:0">Notas</h2>
          <div class="small">En la siguiente fase, este panel mostrará: % por partido, margen, categoría estratégica, abstención y recomendaciones. La selección usa IDs del SVG para evitar cruces por nombre.</div>
        </div>
      </div>
    </div>
  `;

  const modeSel = document.getElementById("map-mode");
  const panel = document.getElementById("map-panel");

  function loadMode(mode){
    const url = mode==="reg" ? "./assets/maps/regiones.svg" : "./assets/maps/provincias.svg";
    mapApi.load(url, (id)=>{
      panel.innerHTML = `<div class="pill">ID seleccionado: <b>${id}</b></div><br/><span class="small">Enlace a datos por provincia se activa cuando carguemos padrones y resultados por demarcación.</span>`;
    });
  }

  modeSel.addEventListener("change", ()=>loadMode(modeSel.value));
  loadMode("prov");
}

export async function renderEncuestas(state){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card">
      <h2>Encuestas (carga por archivo)</h2>
      <p class="small">
        Este módulo NO requiere codificar. Tú editas <b>data/encuestas_master.xlsx</b> y cada vez exportas a <b>data/polls.json</b> y lo subes al repo.
      </p>
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
  const res = await loadPolls("./data/polls.json");
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
        const keys = Object.keys(r).slice(0,8);
        const txt = keys.map(k=>`${k}:${r[k]}`).join(" | ") + (Object.keys(r).length>8?" …":"");
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
  const curules = await fetch("./data/curules_2024.json",{cache:"no-store"}).then(r=>r.json()).catch(()=>null);
  const territorial = curules?.territorial || [];
  const provList = [...new Set(territorial.map(x=>x.provincia))].sort((a,b)=>a.localeCompare(b));
  el.innerHTML = `
    <div class="card">
      <h2>Simulador (Diputados - D'Hondt)</h2>
      <p class="small">Esta versión ya corre D'Hondt por demarcación. La data de votos por partido (2024) se integrará en la siguiente entrega; por ahora puedes probar con votos manuales para validar curules/alianzas.</p>
      <div class="row">
        <label>Provincia</label>
        <select id="sim-prov">${provList.map(p=>`<option value="${p}">${p}</option>`).join("")}</select>
        <label>Circ</label>
        <select id="sim-circ"></select>
        <label>Escaños (k)</label>
        <input id="sim-seats" type="number" min="1" value="1" style="width:90px"/>
        <button id="sim-load" class="pill">Cargar k</button>
      </div>
      <hr/>
      <div class="split">
        <div>
          <h2 style="margin-top:0">Votos por partido</h2>
          <textarea id="sim-votes" rows="10" style="width:100%" placeholder="Ej:\nFP=100000\nPRM=120000\nPLD=30000\nBIS=8000"></textarea>
          <div class="row" style="margin-top:8px">
            <button id="sim-run" class="pill good">Ejecutar D'Hondt</button>
            <span class="small">Tip: pega líneas Partido=Votos.</span>
          </div>
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
  const seatsInput = document.getElementById("sim-seats");
  const btnLoad = document.getElementById("sim-load");

  function loadCircs(){
    const prov = provSel.value;
    const rows = territorial.filter(x=>x.provincia===prov).sort((a,b)=>a.circ-b.circ);
    circSel.innerHTML = rows.map(r=>`<option value="${r.circ}">Circ ${r.circ} (${r.seats})</option>`).join("");
    seatsInput.value = rows[0]?.seats || 1;
  }
  provSel.addEventListener("change", loadCircs);
  btnLoad.addEventListener("click", ()=>{
    const prov = provSel.value;
    const circ = Number(circSel.value);
    const row = territorial.find(x=>x.provincia===prov && x.circ===circ);
    seatsInput.value = row?.seats || seatsInput.value;
    toast("k cargado desde curules 2024");
  });
  loadCircs();

  document.getElementById("sim-run").addEventListener("click", ()=>{
    const k = Number(seatsInput.value)||1;
    const text = document.getElementById("sim-votes").value || "";
    const votes = {};
    text.split(/\n/).map(l=>l.trim()).filter(Boolean).forEach(line=>{
      const m = line.split("=");
      if(m.length>=2){
        const party = m[0].trim();
        const v = Number(m.slice(1).join("=").trim().replace(/,/g,""));
        if(party) votes[party] = isFinite(v)? v : 0;
      }
    });
    const parties = Object.keys(votes);
    if(parties.length<2){
      toast("Agrega al menos 2 partidos con votos.");
      return;
    }
    const r = dhondt(votes, k);
    const out = document.getElementById("sim-out");
    out.innerHTML = `<div class="pill good">D'Hondt ejecutado (k=${k})</div>`;
    const table = document.getElementById("sim-table");
    const seatRows = Object.entries(r.seatsByParty).sort((a,b)=>b[1]-a[1]);
    table.innerHTML = `
      <thead><tr><th>Partido</th><th>Curules</th><th>Votos</th></tr></thead>
      <tbody>
        ${seatRows.map(([p,s])=>`<tr><td>${p}</td><td><b>${s}</b></td><td>${votes[p].toLocaleString()}</td></tr>`).join("")}
      </tbody>`;
  });
}

export async function renderPlaceholder(title, text){
  const el = document.getElementById("view");
  el.innerHTML = `
    <div class="card">
      <h2>${title}</h2>
      <p class="small">${text}</p>
      <div class="pill warn">Pendiente de integración</div>
    </div>
  `;
}

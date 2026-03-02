/**
 * SIE 2028  ui/views.js
 * REGLA: cero backticks anidados. Toda interpolacin condicional usa funciones helper.
 */
import { toast }              from "./toast.js";
import { initMap }            from "./map.js";
import { getLevel, getInscritos } from "../core/data.js";
import { simular }            from "../core/simulacion.js";
import { generarEscenarios }  from "../core/objetivo.js";
import { calcPotencial }      from "../core/potencial.js";
import { runAuditoria }       from "../core/auditoria.js";
import { simBoleta }          from "../core/boleta.js";
import { exportarPDF }        from "../core/exportar.js";
import { fmtInt, fmtPct, rankVotes } from "../core/utils.js";

//  Constantes 
const NIVEL_LABEL = { pres:"Presidencial", sen:"Senadores", dip:"Diputados", mun:"Alcaldes", dm:"DM" };
const CORTE_LABEL = { mayo2024:"Mayo 2024", feb2024:"Feb 2024", proy2028:"Proy. 2028" };
const PARTY_COLORS = {
  PRM:"#7A52F4", PLD:"#9B1B30", FP:"#1B7BF4", PRD:"#E8B124",
  BIS:"#2EAE70", PRSC:"#5599FF", DXC:"#888", ALPAIS:"#E86A24",
};
const MOV_COEF = { pres:1.00, sen:0.85, dip:0.75, mun:0.70, dm:0.70 };

function clr(p) { return PARTY_COLORS[p] || "#555"; }
function view()  { return document.getElementById("view"); }
function el(id)  { return document.getElementById(id); }

//  Helpers UI (sin backticks anidados) 

function kpi(label, value, sub, accent) {
  var subHtml = sub ? "<div class=\"kpi-sub\">" + sub + "</div>" : "";
  var cls = accent ? "kpi-card kpi-accent" : "kpi-card";
  return "<div class=\"" + cls + "\"><div class=\"kpi-label\">" + label + "</div><div class=\"kpi-value\">" + value + "</div>" + subHtml + "</div>";
}

function dot(p) {
  return "<span class=\"dot\" style=\"background:" + clr(p) + "\"></span>";
}

function barRow(p, v, pct) {
  var w = Math.round(pct * 100);
  return "<div class=\"bar-row\">" +
    "<span class=\"bar-label\">" + p + "</span>" +
    "<div class=\"bar-track\"><div class=\"bar-fill\" style=\"width:" + w + "%;background:" + clr(p) + "\"></div></div>" +
    "<span class=\"bar-pct\">" + fmtPct(pct) + "</span>" +
    "<span class=\"bar-abs muted\">" + fmtInt(v) + "</span>" +
    "</div>";
}

function barChart(ranked, limit) {
  limit = limit || 6;
  var rows = ranked.slice(0, limit);
  if (!rows.length) return "<p class=\"muted\">Sin datos</p>";
  return rows.map(function(r) { return barRow(r.p, r.v, r.pct); }).join("");
}

function votesTr(p, v, pct, curul) {
  var curulTd = curul !== undefined ? "<td class=\"r\"><b>" + curul + "</b></td>" : "";
  return "<tr>" + dot(p) + p + "</td><td class=\"r\">" + fmtInt(v) + "</td><td class=\"r\">" + fmtPct(pct) + "</td>" + curulTd + "</tr>";
}

function votesTableHtml(ranked, curulesByParty) {
  if (!ranked.length) return "<p class=\"muted\">Sin datos</p>";
  var hasCurules = curulesByParty && Object.keys(curulesByParty).length;
  var curulTh = hasCurules ? "<th class=\"r\">Cur.</th>" : "";
  var rows = ranked.map(function(r) {
    var curul = hasCurules ? (curulesByParty[r.p] || 0) : undefined;
    return "<tr><td>" + dot(r.p) + r.p + "</td><td class=\"r\">" + fmtInt(r.v) + "</td><td class=\"r\">" + fmtPct(r.pct) + "</td>" +
      (hasCurules ? "<td class=\"r\"><b>" + curul + "</b></td>" : "") + "</tr>";
  });
  return "<table class=\"tbl\"><thead><tr><th>Partido</th><th class=\"r\">Votos</th><th class=\"r\">%</th>" + curulTh + "</tr></thead><tbody>" + rows.join("") + "</tbody></table>";
}

function curulesGrid(byParty) {
  var top = Object.entries(byParty).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  return "<div class=\"curul-grid\">" + top.map(function(kv) {
    return "<div class=\"curul-item\" style=\"border-left:3px solid " + clr(kv[0]) + "\"><b>" + kv[0] + "</b><span>" + kv[1] + "</span></div>";
  }).join("") + "</div>";
}

function catBadge(label, cls) {
  return "<span class=\"cat-badge " + cls + "\">" + label + "</span>";
}

function badge(txt, cls) {
  return "<span class=\"badge " + (cls||"") + "\">" + txt + "</span>";
}

function opt(value, label, selected) {
  return "<option value=\"" + value + "\"" + (selected ? " selected" : "") + ">" + label + "</option>";
}

function optionsList(parties, selectedVal) {
  return parties.map(function(p) { return opt(p, p, p === selectedVal); }).join("");
}

function statGrid(items) {
  var cells = items.map(function(it) {
    return "<div><span class=\"muted\">" + it[0] + "</span><br><b>" + it[1] + "</b></div>";
  }).join("");
  return "<div class=\"stat-grid\">" + cells + "</div>";
}

function sep() { return "<hr class=\"sep\">"; }

//  Global controls 
export function mountGlobalControls(state) {
  var slot = el("global-controls");
  if (!slot) return;
  var nOpts = Object.entries(NIVEL_LABEL).map(function(kv) { return opt(kv[0], kv[1], kv[0]===state.nivel); }).join("");
  var cOpts = Object.entries(CORTE_LABEL).map(function(kv) { return opt(kv[0], kv[1], kv[0]===state.corte); }).join("");
  slot.innerHTML = "<select id=\"g-nivel\" class=\"sel-sm\" title=\"Nivel\">" + nOpts + "</select>" +
    "<select id=\"g-corte\" class=\"sel-sm\" title=\"Corte\">" + cOpts + "</select>";
  el("g-nivel").addEventListener("change", function(e) { state.setNivel(e.target.value); state.recomputeAndRender(); });
  el("g-corte").addEventListener("change", function(e) { state.setCorte(e.target.value); state.recomputeAndRender(); });
}

//  1. DASHBOARD 
export function renderDashboard(state, ctx) {
  var nivel  = state.nivel;
  var lv     = getLevel(ctx, 2024, nivel);
  var nat    = lv.nacional;
  var ins    = nivel === "pres" ? (getInscritos(ctx, state.corte) || nat.inscritos || 0) : (nat.inscritos || 0);
  var em     = nat.emitidos || 0;
  var part   = ins ? em / ins : 0;
  var ranked = rankVotes(nat.votes, em);
  var top    = ranked[0];
  var margen = ranked.length > 1 ? ranked[0].pct - ranked[1].pct : (top ? top.pct : 0);

  var dipCurules = null;
  if (nivel === "dip") {
    var baseRes = simular(ctx, { nivel:"dip", year:2024, corte:state.corte });
    dipCurules = baseRes.curules ? baseRes.curules.totalByParty : {};
  }

  // Build exec list items
  var execItems = "";
  if (nivel === "pres") {
    var riskClass = top && top.pct < 0.5 ? "text-warn" : "text-ok";
    var riskLabel = top && top.pct < 0.5 ? "Si (lider <50%)" : "Bajo";
    execItems += "<li>Riesgo 2a vuelta: <b class=\"" + riskClass + "\">" + riskLabel + "</b></li>";
    execItems += "<li>Margen sobre 2: <b>" + fmtPct(margen) + "</b></li>";
  }
  if (nivel === "dip" && dipCurules && top) {
    var liderCur = dipCurules[top.p] || 0;
    var majClass = liderCur >= 96 ? "text-ok" : "text-warn";
    execItems += "<li>Curules " + top.p + ": <b>" + liderCur + " / 190</b></li>";
    execItems += "<li>Mayoria (96+): <b class=\"" + majClass + "\">" + (liderCur >= 96 ? "Si" : "No") + "</b></li>";
  }
  if (nivel === "sen") {
    execItems += "<li>32 senadores - mayoria: 17</li>";
  }
  execItems += "<li>Participacion 2024: <b>" + fmtPct(part) + "</b></li>";
  execItems += "<li>Abstencion: <b>" + fmtInt(Math.round(ins*(1-part))) + " votos</b></li>";

  // Dip curules section
  var dipSection = "";
  if (nivel === "dip" && dipCurules) {
    var dipRanked = ranked.filter(function(r) { return (dipCurules[r.p] || 0) > 0; });
    dipSection = sep() + "<h3 style=\"margin-top:12px;\">Curules 2024 (D'Hondt base)</h3>" + votesTableHtml(dipRanked, dipCurules);
  }

  var kpiTop = top ? kpi("Lider proyectado", top.p, fmtPct(top.pct), true) : "";

  view().innerHTML =
    "<div class=\"page-header\"><h2>Dashboard - " + NIVEL_LABEL[nivel] + "</h2>" + badge(CORTE_LABEL[state.corte]) + "</div>" +
    "<div class=\"kpi-grid\">" +
      kpi("Padron", fmtInt(ins), CORTE_LABEL[state.corte]) +
      kpi("Emitidos 2024", fmtInt(em)) +
      kpi("Participacion", fmtPct(part)) +
      kpi("Abstencion", fmtPct(1-part), fmtInt(Math.round(ins*(1-part)))+" votos") +
      kpiTop +
      kpi("Margen 1-2", margen > 0 ? fmtPct(margen) : "-") +
    "</div>" +
    "<div class=\"row-2col\" style=\"margin-top:16px;gap:16px;\">" +
      "<div class=\"card\"><h3>Distribucion - " + NIVEL_LABEL[nivel] + "</h3>" + barChart(ranked, 7) + dipSection + "</div>" +
      "<div class=\"card\"><h3>Resumen Ejecutivo</h3>" +
        "<ul class=\"exec-list\">" + execItems + "</ul>" +
        "<div style=\"margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;\">" +
          "<button class=\"btn\" onclick=\"location.hash='#simulador'\">Simulador</button>" +
          "<button class=\"btn-sm\" onclick=\"location.hash='#objetivo'\">Objetivo</button>" +
          "<button class=\"btn-sm\" onclick=\"location.hash='#auditoria'\">Auditoria</button>" +
        "</div>" +
      "</div>" +
    "</div>";
}

//  2. MAPA 
var _mapApi = null;

export function renderMapa(state, ctx) {
  var nivel  = state.nivel;
  var lv     = getLevel(ctx, 2024, nivel);
  var dipRes = nivel === "dip" ? simular(ctx, { nivel:"dip", year:2024 }) : null;

  view().innerHTML =
    "<div class=\"page-header\"><h2>Mapa - " + NIVEL_LABEL[nivel] + "</h2>" +
      "<div style=\"display:flex;gap:6px;flex-wrap:wrap;\">" +
        "<button class=\"btn-sm\" id=\"map-zi\">Zoom +</button>" +
        "<button class=\"btn-sm\" id=\"map-zo\">Zoom -</button>" +
        "<button class=\"btn-sm\" id=\"map-r\">Reset</button>" +
      "</div>" +
    "</div>" +
    "<div class=\"map-layout\">" +
      "<div class=\"map-wrap card\" id=\"map-container\" style=\"min-height:500px;padding:0!important;\"></div>" +
      "<div class=\"card\" id=\"map-panel\" style=\"overflow-y:auto;max-height:560px;\"><p class=\"muted\">Click en una provincia.</p></div>" +
    "</div>";

  el("map-zi").addEventListener("click", function() { if (_mapApi) _mapApi.zoomIn(); });
  el("map-zo").addEventListener("click", function() { if (_mapApi) _mapApi.zoomOut(); });
  el("map-r").addEventListener("click",  function() { if (_mapApi) _mapApi.reset(); });

  _mapApi = initMap({
    containerId: "map-container",
    svgUrl: "./assets/maps/provincias.svg",
    onSelect: function(provId) { showProvPanel(lv, provId, nivel, dipRes); },
    onReady: function() {
      if (nivel === "pres" || nivel === "sen" || nivel === "dip") {
        Object.keys(lv.prov).forEach(function(pid) {
          var prov = lv.prov[pid];
          var r = rankVotes(prov.votes, prov.emitidos);
          if (r[0]) {
            var shape = document.querySelector("[id=\"DO-" + pid + "\"]");
            if (shape) {
              shape.style.fill    = clr(r[0].p);
              shape.style.opacity = String(0.35 + r[0].pct * 0.65);
            }
          }
        });
      }
    },
  });
}

function showProvPanel(lv, provId, nivel, dipRes) {
  var panel = el("map-panel");
  if (!panel) return;
  var prov = lv.prov ? lv.prov[provId] : null;
  if (!prov) { panel.innerHTML = "<p class=\"muted\">Sin datos para provincia " + provId + ".</p>"; return; }

  var part   = prov.inscritos ? prov.emitidos / prov.inscritos : 0;
  var ranked = rankVotes(prov.votes, prov.validos || prov.emitidos);
  var margen = ranked.length >= 2 ? ranked[0].pct - ranked[1].pct : null;

  var curulesHtml = "";
  if (nivel === "dip" && dipRes && dipRes.curules) {
    var byCirc = dipRes.curules.byCirc || {};
    var provCircs = Object.keys(byCirc).filter(function(k) { return k === provId || k.indexOf(provId + "-") === 0; });
    if (provCircs.length) {
      var rows = provCircs.map(function(cid) {
        var c = byCirc[cid];
        var dist = Object.keys(c.byParty).filter(function(p) { return c.byParty[p] > 0; })
          .map(function(p) { return p + ":" + c.byParty[p]; }).join(", ");
        return "<tr><td>" + cid + "</td><td class=\"r\">" + c.seats + "</td><td>" + dist + "</td></tr>";
      }).join("");
      curulesHtml = "<h4 style=\"margin:12px 0 6px\">Curules</h4><table class=\"tbl\"><thead><tr><th>Circ.</th><th class=\"r\">Esc.</th><th>Dist.</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }
  }

  var margenStr = margen !== null ? fmtPct(margen) : "-";
  panel.innerHTML =
    "<h3 style=\"margin:0 0 10px\">" + (prov.nombre || "Provincia " + provId) + "</h3>" +
    statGrid([
      ["Inscritos", fmtInt(prov.inscritos)],
      ["Emitidos",  fmtInt(prov.emitidos)],
      ["Participacion", fmtPct(part)],
      ["Margen 1-2", margenStr],
    ]) +
    "<div style=\"margin-top:10px;\">" + barChart(ranked, 6) + "</div>" +
    "<div style=\"margin-top:8px;\">" + votesTableHtml(ranked.slice(0,8)) + "</div>" +
    curulesHtml;
}

//  3. SIMULADOR 
export function renderSimulador(state, ctx) {
  var nivel  = state.nivel;
  var lv     = getLevel(ctx, 2024, nivel);
  var nat    = lv.nacional;
  var ranked = rankVotes(nat.votes, nat.emitidos);
  var savedMov = localStorage.getItem("sie28-sim-mov") || "0";
  localStorage.removeItem("sie28-sim-mov");

  var tblRows = ranked.slice(0,15).map(function(r) {
    return "<tr data-p=\"" + r.p + "\"><td>" + dot(r.p) + r.p + "</td><td class=\"r\">" + fmtPct(r.pct) + "</td>" +
      "<td class=\"r\"><input class=\"inp-sm delta-in\" type=\"number\" step=\"0.1\" value=\"0\" style=\"width:70px;text-align:right;\" data-party=\"" + r.p + "\"></td></tr>";
  }).join("");

  var movBtns = [-5,-3,3,5,7].map(function(pp) {
    var cls = pp < 0 ? "btn-sm neg" : "btn-sm";
    var lbl = pp > 0 ? "+" + pp : String(pp);
    return "<button class=\"" + cls + "\" data-mov=\"" + pp + "\">" + lbl + "</button>";
  }).join("");

  var liderOpts = ranked.slice(0,10).map(function(r) { return opt(r.p, r.p, false); }).join("");

  var alidaosRows = ranked.slice(1,10).map(function(r) {
    return "<div class=\"alianza-row\" style=\"display:flex;gap:8px;align-items:center;margin-bottom:4px;\" data-p=\"" + r.p + "\">" +
      "<input type=\"checkbox\" class=\"alz-chk\" value=\"" + r.p + "\" id=\"alz-" + r.p + "\">" +
      "<label for=\"alz-" + r.p + "\" style=\"min-width:50px;\">" + r.p + "</label>" +
      "<label class=\"muted\">%:</label>" +
      "<input class=\"inp-sm alz-pct\" type=\"number\" min=\"0\" max=\"100\" step=\"5\" value=\"80\" style=\"width:60px;\" data-party=\"" + r.p + "\" disabled>" +
      "</div>";
  }).join("");

  var arrOpts = ranked.slice(0,5).map(function(r) { return opt(r.p, r.p, false); }).join("");
  var arrastreBlock = nivel !== "pres" ?
    "<div class=\"card\" style=\"margin-bottom:14px;\"><h3>Arrastre presidencial</h3>" +
      "<div style=\"display:flex;gap:8px;align-items:center;flex-wrap:wrap;\">" +
        "<label><input type=\"checkbox\" id=\"sim-arrastre\"> Activar</label>" +
        "<select id=\"sim-arr-lider\" class=\"sel-sm\">" + arrOpts + "</select>" +
        "<select id=\"sim-arr-k\" class=\"sel-sm\">" +
          "<option value=\"auto\">Auto</option>" +
          "<option value=\"0.60\">k=0.60</option>" +
          "<option value=\"0.40\">k=0.40</option>" +
          "<option value=\"0.25\">k=0.25</option>" +
        "</select>" +
      "</div></div>" : "";

  view().innerHTML =
    "<div class=\"page-header\"><h2>Simulador - " + NIVEL_LABEL[nivel] + "</h2></div>" +
    "<div class=\"sim-layout\">" +
      "<div>" +
        "<div class=\"card\" style=\"margin-bottom:14px;\">" +
          "<h3>Ajuste por partido (delta pp)</h3>" +
          "<p class=\"muted\" style=\"margin-bottom:8px;\">Variacion en puntos porcentuales. Se renormaliza.</p>" +
          "<div style=\"overflow:auto;max-height:300px;\"><table class=\"tbl\" id=\"sim-tbl\">" +
            "<thead><tr><th>Partido</th><th class=\"r\">% base</th><th class=\"r\">delta pp</th></tr></thead>" +
            "<tbody>" + tblRows + "</tbody></table></div>" +
        "</div>" +
        "<div class=\"card\" style=\"margin-bottom:14px;\">" +
          "<h3>Movilizacion</h3>" +
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;align-items:center;\">" + movBtns +
            "<input id=\"sim-mov\" class=\"inp-sm\" type=\"number\" step=\"0.1\" value=\"" + savedMov + "\" style=\"width:70px;\">" +
          "</div>" +
        "</div>" +
        "<div class=\"card\" style=\"margin-bottom:14px;\">" +
          "<h3>Alianzas</h3>" +
          "<div style=\"display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;\">" +
            "<label class=\"muted\">Lider:</label>" +
            "<select id=\"sim-lider\" class=\"sel-sm\">" + liderOpts + "</select>" +
          "</div>" +
          "<div id=\"sim-aliados\" style=\"max-height:180px;overflow-y:auto;\">" + alidaosRows + "</div>" +
        "</div>" +
        arrastreBlock +
        "<div style=\"display:flex;gap:10px;flex-wrap:wrap;\">" +
          "<button class=\"btn\" id=\"btn-sim\">Simular</button>" +
          "<button class=\"btn-sm\" id=\"btn-sim-reset\">Reset</button>" +
        "</div>" +
      "</div>" +
      "<div><div class=\"card\" id=\"sim-result\"><p class=\"muted\">Configura y presiona Simular.</p></div></div>" +
    "</div>";

  document.querySelectorAll(".alz-chk").forEach(function(chk) {
    chk.addEventListener("change", function() {
      var inp = document.querySelector(".alz-pct[data-party=\"" + chk.value + "\"]");
      if (inp) inp.disabled = !chk.checked;
    });
  });
  document.querySelectorAll("[data-mov]").forEach(function(b) {
    b.addEventListener("click", function() { el("sim-mov").value = b.dataset.mov; });
  });
  el("sim-lider").addEventListener("change", function() {
    var lider = el("sim-lider").value;
    document.querySelectorAll(".alianza-row").forEach(function(row) {
      row.style.display = row.dataset.p === lider ? "none" : "";
    });
  });
  el("btn-sim").addEventListener("click", function() { runSim(ctx, state, nivel, nat); });
  el("btn-sim-reset").addEventListener("click", function() {
    document.querySelectorAll(".delta-in").forEach(function(i) { i.value = "0"; });
    el("sim-mov").value = "0";
    document.querySelectorAll(".alz-chk").forEach(function(c) { c.checked = false; });
    document.querySelectorAll(".alz-pct").forEach(function(p) { p.disabled = true; });
    el("sim-result").innerHTML = "<p class=\"muted\">Reset.</p>";
  });
}

function runSim(ctx, state, nivel, nat) {
  var deltasPP = {};
  document.querySelectorAll(".delta-in").forEach(function(inp) {
    var v = Number(inp.value) || 0;
    if (v) deltasPP[inp.dataset.party] = v;
  });
  var movPP   = Number(el("sim-mov") ? el("sim-mov").value : 0) || 0;
  var lider   = el("sim-lider") ? el("sim-lider").value : "";
  var aliados = [];
  document.querySelectorAll(".alz-chk:checked").forEach(function(chk) {
    var pctEl = document.querySelector(".alz-pct[data-party=\"" + chk.value + "\"]");
    var pct = pctEl ? Number(pctEl.value) : 80;
    aliados.push({ partido: chk.value, transferPct: pct });
  });
  var alianzas = lider && aliados.length ? [{ lider:lider, aliados:aliados }] : [];
  var arrastre = el("sim-arrastre") ? el("sim-arrastre").checked : false;
  var arrastreLider = el("sim-arr-lider") ? el("sim-arr-lider").value : null;
  var kRaw    = el("sim-arr-k") ? el("sim-arr-k").value : "auto";
  var arrastreK = kRaw === "auto" ? null : Number(kRaw);

  var res = simular(ctx, { nivel:nivel, year:2024, corte:state.corte, deltasPP:deltasPP, alianzas:alianzas, movPP:movPP, arrastre:arrastre, arrastreLider:arrastreLider, arrastreK:arrastreK });
  renderSimResult(el("sim-result"), res, nivel, nat);
}

function renderSimResult(container, res, nivel, nat) {
  var emBase = nat.emitidos || 1;
  var deltaEm = res.emitidos - emBase;
  var deltaStr = (deltaEm >= 0 ? "+" : "") + fmtInt(deltaEm);

  var extraHtml = "";
  if (nivel === "dip" && res.curules) {
    var liderEntry = Object.entries(res.curules.totalByParty).sort(function(a,b){return b[1]-a[1];})[0];
    var liderCur = liderEntry ? liderEntry[1] : 0;
    var majBadge = liderCur >= 96 ? badge("Mayoria absoluta (" + liderCur + ")", "badge-good") : badge("Sin mayoria (" + liderCur + "/96)", "badge-warn");
    extraHtml = sep() + "<h4>Curules D'Hondt (" + res.curules.totalSeats + "/190)</h4>" + curulesGrid(res.curules.totalByParty) + "<div style=\"margin-top:8px;\">" + majBadge + "</div>";
  } else if (nivel === "sen" && res.senadores) {
    extraHtml = sep() + "<h4>Senadores (32)</h4>" + curulesGrid(res.senadores.totalByParty);
  } else if ((nivel === "mun" || nivel === "dm") && res.ganadores) {
    var tot = Object.keys(res.ganadores.byTerritory).length;
    extraHtml = sep() + "<h4>" + NIVEL_LABEL[nivel] + " - " + tot + " territorios</h4>" + curulesGrid(res.ganadores.totalByParty);
  }

  container.innerHTML =
    "<h3>Resultado simulado</h3>" +
    statGrid([["Emitidos sim", fmtInt(res.emitidos)], ["vs base", deltaStr], ["Participacion", fmtPct(res.participacion)]]) +
    "<div style=\"margin-top:10px;\">" + barChart(res.ranked, 8) + "</div>" +
    "<div style=\"margin-top:8px;\">" + votesTableHtml(res.ranked.slice(0,10), nivel==="dip" ? (res.curules ? res.curules.totalByParty : {}) : null) + "</div>" +
    extraHtml;
}

//  4. POTENCIAL 
export function renderPotencial(state, ctx) {
  var nivel  = state.nivel;
  var nat24  = getLevel(ctx, 2024, nivel).nacional;
  var lider  = rankVotes(nat24.votes, nat24.emitidos)[0];
  lider = lider ? lider.p : "PRM";
  var data   = calcPotencial(ctx, nivel, lider);
  var cats   = ["Fortaleza","Oportunidad","Disputa","Crecimiento","Adverso","Baja prioridad"];

  var kpiCats = cats.map(function(cat) {
    var count = data.filter(function(r) { return r.categoria.label === cat; }).length;
    return kpi(cat, String(count));
  }).join("");

  var rows = data.map(function(r, i) {
    var tendStr = r.pct20 !== null ? (r.tendencia > 0 ? "+" : "") + fmtPct(r.tendencia) : "-";
    var tendCls = r.tendencia > 0 ? "text-ok" : r.tendencia < 0 ? "text-warn" : "";
    return "<tr>" +
      "<td class=\"muted\">" + (i+1) + "</td>" +
      "<td><b>" + r.nombre + "</b></td>" +
      "<td class=\"r\"><b>" + r.score + "</b></td>" +
      "<td>" + catBadge(r.categoria.label, r.categoria.cls) + "</td>" +
      "<td class=\"r\">" + fmtPct(r.pct24) + "</td>" +
      "<td class=\"r " + tendCls + "\">" + tendStr + "</td>" +
      "<td class=\"r\">" + fmtPct(r.abst) + "</td>" +
      "<td class=\"r\">" + fmtPct(r.margen) + "</td>" +
      "<td class=\"r\">" + fmtInt(r.padron) + "</td>" +
      "</tr>";
  }).join("");

  view().innerHTML =
    "<div class=\"page-header\"><h2>Potencial - " + NIVEL_LABEL[nivel] + "</h2><span class=\"muted\">Ref: <b>" + lider + "</b> Score 0-100</span></div>" +
    "<div class=\"kpi-grid\" style=\"margin-bottom:14px;\">" + kpiCats + "</div>" +
    "<div class=\"card\" style=\"overflow:auto;max-height:65vh;\">" +
      "<table class=\"tbl\"><thead><tr>" +
        "<th>#</th><th>Territorio</th><th class=\"r\">Score</th><th>Categoria</th>" +
        "<th class=\"r\">% " + lider + " 24</th><th class=\"r\">Tend.</th>" +
        "<th class=\"r\">Abstencion</th><th class=\"r\">Margen</th><th class=\"r\">Inscritos</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table>" +
    "</div>";
}

//  5. MOVILIZACION 
export function renderMovilizacion(state, ctx) {
  var nivel  = state.nivel;
  var lv     = getLevel(ctx, 2024, nivel);
  var nat    = lv.nacional;
  var ins    = nivel === "pres" ? (getInscritos(ctx, state.corte) || nat.inscritos || 0) : (nat.inscritos || 0);
  var em     = nat.emitidos || 0;
  var abst   = ins - em;
  var cap    = Math.round(abst * 0.6);
  var k      = MOV_COEF[nivel] || 1;
  var lv20   = getLevel(ctx, 2020, nivel);
  var terr24 = nivel==="mun" ? lv.mun : nivel==="dm" ? lv.dm : lv.prov;
  var terr20 = nivel==="mun" ? lv20.mun : nivel==="dm" ? lv20.dm : lv20.prov;

  var rows = Object.keys(terr24).map(function(id) {
    var t = terr24[id];
    var t20 = terr20 ? terr20[id] : null;
    var a24 = t.inscritos ? 1 - (t.emitidos / t.inscritos) : 0;
    var a20 = t20 && t20.inscritos ? 1 - (t20.emitidos / t20.inscritos) : null;
    var delta = a20 !== null ? a24 - a20 : null;
    return { nombre: t.nombre || id, a24:a24, delta:delta, ins:t.inscritos||0 };
  }).sort(function(a,b){return b.a24-a.a24;}).slice(0,30).map(function(r) {
    var deltaStr = r.delta !== null ? (r.delta > 0 ? "+" : "") + fmtPct(r.delta) : "-";
    var deltaCls = r.delta !== null ? (r.delta > 0 ? "text-warn" : "text-ok") : "";
    return "<tr><td>" + r.nombre + "</td><td class=\"r\">" + fmtPct(r.a24) + "</td><td class=\"r " + deltaCls + "\">" + deltaStr + "</td><td class=\"r\">" + fmtInt(r.ins) + "</td></tr>";
  }).join("");

  var movBtns = [-5,-3,3,5,7].map(function(pp) {
    var cls = pp < 0 ? "btn-sm neg" : "btn-sm";
    var lbl = pp > 0 ? "+" + pp + " pp" : pp + " pp";
    return "<button class=\"" + cls + "\" data-pp=\"" + pp + "\">" + lbl + "</button>";
  }).join("");

  view().innerHTML =
    "<div class=\"page-header\"><h2>Movilizacion - " + NIVEL_LABEL[nivel] + "</h2></div>" +
    "<div class=\"row-2col\" style=\"gap:14px;\">" +
      "<div>" +
        "<div class=\"card\" style=\"margin-bottom:14px;\">" +
          "<div class=\"kpi-grid\" style=\"grid-template-columns:1fr 1fr;\">" +
            kpi("Inscritos", fmtInt(ins)) + kpi("Emitidos 2024", fmtInt(em)) +
            kpi("Abstencion", fmtInt(abst), fmtPct(ins?abst/ins:0)) +
            kpi("Techo (60%)", fmtInt(cap)) + kpi("Coef.", k.toFixed(2)) +
          "</div>" +
        "</div>" +
        "<div class=\"card\" style=\"margin-bottom:14px;\">" +
          "<h3>Escenarios</h3>" +
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;\">" + movBtns +
            "<input id=\"mov-pp\" class=\"inp-sm\" type=\"number\" step=\"0.1\" value=\"0\" style=\"width:72px;\">" +
            "<button class=\"btn\" id=\"mov-calc\">Calcular</button>" +
          "</div>" +
          "<div id=\"mov-result\" style=\"display:none;\">" +
            statGrid([["Votos brutos","<span id=\"mv-raw\">-</span>"],["Aplicados","<span id=\"mv-used\">-</span>"],["% padron","<span id=\"mv-pct\">-</span>"],["Nuevos emitidos","<span id=\"mv-em\">-</span>"]]) +
            "<button class=\"btn-sm\" id=\"mov-to-sim\" style=\"margin-top:10px;\">Aplicar al Simulador</button>" +
          "</div>" +
        "</div>" +
      "</div>" +
      "<div class=\"card\" style=\"overflow:auto;max-height:500px;\">" +
        "<h3>Top 30 por abstencion</h3>" +
        "<table class=\"tbl\"><thead><tr><th>Territorio</th><th class=\"r\">Abst. 24</th><th class=\"r\">Delta 24-20</th><th class=\"r\">Inscritos</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table>" +
      "</div>" +
    "</div>";

  function calc(pp) {
    var raw  = Math.round(ins * (pp/100) * k);
    var used = pp >= 0 ? Math.min(raw, cap) : Math.max(raw, -Math.round(em*0.05));
    el("mov-result").style.display = "";
    var rawEl = document.getElementById("mv-raw"); if (rawEl) rawEl.textContent = fmtInt(raw);
    var usedEl = document.getElementById("mv-used"); if (usedEl) usedEl.textContent = fmtInt(used);
    var pctEl = document.getElementById("mv-pct"); if (pctEl) pctEl.textContent = fmtPct(ins ? Math.abs(used)/ins : 0);
    var emEl = document.getElementById("mv-em"); if (emEl) emEl.textContent = fmtInt(em + used);
  }

  document.querySelectorAll("[data-pp]").forEach(function(b) {
    b.addEventListener("click", function() { el("mov-pp").value = b.dataset.pp; calc(Number(b.dataset.pp)); });
  });
  el("mov-calc").addEventListener("click", function() { calc(Number(el("mov-pp").value) || 0); });
  var toSimBtn = el("mov-to-sim");
  if (toSimBtn) toSimBtn.addEventListener("click", function() {
    var pp = Number(el("mov-pp").value) || 0;
    localStorage.setItem("sie28-sim-mov", String(pp));
    location.hash = "#simulador";
    toast("+" + pp + "pp cargado en Simulador");
  });
}

//  6. OBJETIVO 
export function renderObjetivo(state, ctx) {
  var nivel  = state.nivel;
  var nat    = getLevel(ctx, 2024, nivel).nacional;
  var ranked = rankVotes(nat.votes, nat.emitidos);
  var pOpts  = ranked.map(function(r) { return opt(r.p, r.p, false); }).join("");
  var defVal = nivel === "dip" ? "96" : "51";
  var defStep = nivel === "dip" ? "1" : "0.1";
  var defLabel = nivel === "dip" ? "Curules objetivo (de 190)" : "% votos objetivo";
  var arrCheck = nivel !== "pres" ? "<label style=\"display:flex;align-items:center;gap:8px;\"><input type=\"checkbox\" id=\"obj-arrastre\"> Incluir arrastre presidencial</label>" : "";

  view().innerHTML =
    "<div class=\"page-header\"><h2>Objetivo - " + NIVEL_LABEL[nivel] + "</h2></div>" +
    "<div class=\"row-2col\" style=\"gap:14px;\">" +
      "<div class=\"card\"><h3>Configurar meta</h3>" +
        "<div style=\"display:flex;flex-direction:column;gap:12px;\">" +
          "<div><label class=\"muted\">Partido objetivo</label><select id=\"obj-partido\" class=\"sel-sm\" style=\"width:100%;margin-top:4px;\">" + pOpts + "</select></div>" +
          "<div><label class=\"muted\">" + defLabel + "</label><input id=\"obj-meta\" class=\"inp-sm\" type=\"number\" step=\"" + defStep + "\" value=\"" + defVal + "\" style=\"width:100%;margin-top:4px;\"></div>" +
          "<div><label class=\"muted\">Delta pp movilizacion</label><input id=\"obj-mov\" class=\"inp-sm\" type=\"number\" step=\"0.1\" value=\"0\" style=\"width:100%;margin-top:4px;\"></div>" +
          arrCheck +
          "<button class=\"btn\" id=\"obj-calc\">Calcular escenarios</button>" +
        "</div>" +
      "</div>" +
      "<div id=\"obj-result\"><div class=\"card\"><p class=\"muted\">Configura y presiona Calcular.</p></div></div>" +
    "</div>";

  el("obj-calc").addEventListener("click", function() {
    var lider    = el("obj-partido").value;
    var meta     = Number(el("obj-meta").value) || (nivel==="dip" ? 96 : 51);
    var movPP    = Number(el("obj-mov").value) || 0;
    var arrastre = el("obj-arrastre") ? el("obj-arrastre").checked : false;
    el("obj-result").innerHTML = "<div class=\"card\"><p class=\"muted\">Calculando...</p></div>";
    setTimeout(function() {
      try {
        var esc = generarEscenarios(ctx, { lider:lider, nivel:nivel, metaValor:meta, arrastre:arrastre, movPP:movPP, year:2024 });
        renderObjResult(el("obj-result"), esc, nivel, lider);
      } catch(e) {
        el("obj-result").innerHTML = "<div class=\"card\"><p class=\"muted\">Error: " + e.message + "</p></div>";
      }
    }, 10);
  });
}

function renderObjResult(container, esc, nivel, lider) {
  var labels = {
    conservador: { label:"Conservador", cls:"cat-blue",   desc:"90% meta" },
    razonable:   { label:"Razonable",   cls:"cat-green",  desc:"100% meta" },
    optimizado:  { label:"Optimizado",  cls:"cat-yellow", desc:"105% meta" },
    agresivo:    { label:"Agresivo",    cls:"cat-orange", desc:"112% meta" },
  };
  var narrs = {
    conservador: "Escenario minimo viable.",
    razonable:   "Objetivo central.",
    optimizado:  "Alta eficiencia. Posible con alianzas.",
    agresivo:    "Maximo posible. Requiere coalicion amplia.",
  };

  var cards = Object.keys(esc).map(function(key) {
    var e = esc[key];
    var info = labels[key];
    if (e.imposible) {
      var maxStr = nivel==="dip" ? Math.round(e.maximo) + " curules" : (e.maximo*100).toFixed(1)+"%";
      return "<div class=\"card\">" + catBadge(info.label,"cat-red") + "<p style=\"margin-top:8px;\" class=\"muted\">Imposible. Maximo: <b>" + maxStr + "</b></p></div>";
    }
    var res   = e.resultado;
    var found = res && res.ranked ? res.ranked.filter(function(r){return r.p===lider;})[0] : null;
    var valor = nivel==="dip"
      ? (res && res.curules ? (res.curules.totalByParty[lider]||0) + " curules" : "-")
      : (found ? fmtPct(found.pct) : "-");
    var delta = e.deltaPP !== null && e.deltaPP !== undefined ? (e.deltaPP>=0?"+":"") + e.deltaPP.toFixed(1) + " pp" : "-";
    return "<div class=\"card\">" +
      "<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:8px;\">" + catBadge(info.label, info.cls) + "<span class=\"muted\">" + info.desc + "</span></div>" +
      statGrid([["Delta pp",delta],["Resultado "+lider,valor],["Participacion",fmtPct(res?res.participacion:0)]]) +
      "<p class=\"muted\" style=\"margin-top:8px;\">" + narrs[key] + "</p>" +
      "</div>";
  }).join("");

  container.innerHTML = "<div style=\"display:flex;flex-direction:column;gap:12px;\">" + cards + "</div>";
}

//  7. BOLETA UNICA 
export function renderBoleta(state, ctx) {
  var lv     = getLevel(ctx, 2024, "dip");
  var ranked = rankVotes(lv.nacional.votes, lv.nacional.emitidos);
  var parties = ranked.slice(0,12).map(function(r){return r.p;});

  var tblRows = parties.map(function(p) {
    return "<tr data-p=\"" + p + "\">" +
      "<td>" + dot(p) + p + "</td>" +
      "<td><input type=\"checkbox\" class=\"bl-chk\" value=\"" + p + "\"></td>" +
      "<td><input type=\"radio\" name=\"bl-lider\" class=\"bl-lid\" value=\"" + p + "\"></td>" +
      "<td class=\"r\"><input class=\"inp-sm bl-pct\" type=\"number\" min=\"0\" max=\"100\" step=\"5\" value=\"85\" style=\"width:60px;\" data-party=\"" + p + "\" disabled></td>" +
      "</tr>";
  }).join("");

  view().innerHTML =
    "<div class=\"page-header\"><h2>Boleta Unica Opositora</h2></div>" +
    "<div class=\"row-2col\" style=\"gap:14px;\">" +
      "<div class=\"card\">" +
        "<h3>Configurar coalicion</h3>" +
        "<p class=\"muted\" style=\"margin-bottom:10px;\">Selecciona partidos, quien encabeza y % de transferencia.</p>" +
        "<table class=\"tbl\" id=\"boleta-tbl\"><thead><tr><th>Partido</th><th>Incluir</th><th>Encabeza</th><th class=\"r\">Transf. %</th></tr></thead>" +
        "<tbody>" + tblRows + "</tbody></table>" +
        "<div style=\"margin-top:12px;\"><button class=\"btn\" id=\"btn-boleta\">Simular boleta</button></div>" +
      "</div>" +
      "<div id=\"boleta-result\"><div class=\"card\"><p class=\"muted\">Selecciona partidos y presiona Simular.</p></div></div>" +
    "</div>";

  document.querySelectorAll(".bl-chk").forEach(function(chk) {
    chk.addEventListener("change", function() {
      var pct = document.querySelector(".bl-pct[data-party=\"" + chk.value + "\"]");
      if (pct) pct.disabled = !chk.checked;
    });
  });

  el("btn-boleta").addEventListener("click", function() {
    var liderEl = document.querySelector(".bl-lid:checked");
    if (!liderEl) { toast("Selecciona quien encabeza"); return; }
    var lider = liderEl.value;
    var partidos = parties.map(function(p) {
      var chkEl = document.querySelector(".bl-chk[value=\"" + p + "\"]");
      var pctEl = document.querySelector(".bl-pct[data-party=\"" + p + "\"]");
      return {
        partido:    p,
        incluir:    p === lider || (chkEl ? chkEl.checked : false),
        encabeza:   p === lider,
        transferPct: pctEl ? Number(pctEl.value) : 85,
      };
    });
    var res = simBoleta(ctx, { partidos:partidos, year:2024 });
    if (!res) { toast("Error al simular boleta"); return; }
    renderBoletaResult(el("boleta-result"), res);
  });
}

function renderBoletaResult(container, res) {
  var lider    = res.lider;
  var baseL    = res.baseTotal[lider]   || 0;
  var boletaL  = res.boletaTotal[lider] || 0;
  var delta    = boletaL - baseL;
  var deltaStr = (delta >= 0 ? "+" : "") + delta;
  var deltaCls = delta > 0 ? "text-ok" : delta < 0 ? "text-warn" : "";
  var majBadge = boletaL >= 96
    ? badge("Mayoria absoluta con boleta", "badge-good")
    : badge("Sin mayoria (" + boletaL + "/96)", "badge-warn");

  var ganRows = res.ganados.map(function(t) {
    var circ = t.circ > 0 ? " C" + t.circ : "";
    return "<tr><td>" + t.provincia + circ + "</td><td class=\"r\">" + t.seats + "</td><td class=\"muted\">" + t.baseDistrib + "</td><td>" + t.boletaDistrib + "</td><td class=\"r text-ok\">+" + t.delta + "</td></tr>";
  }).join("");

  var perRows = res.perdidos.map(function(t) {
    var circ = t.circ > 0 ? " C" + t.circ : "";
    return "<tr><td>" + t.provincia + circ + "</td><td class=\"r\">" + t.seats + "</td><td class=\"muted\">" + t.baseDistrib + "</td><td>" + t.boletaDistrib + "</td><td class=\"r text-warn\">" + t.delta + "</td></tr>";
  }).join("");

  var ganSection = res.ganados.length ? "<div class=\"card\" style=\"margin-bottom:12px;\"><h3 style=\"color:var(--green)\">Donde gana curules (" + res.ganados.length + ")</h3><table class=\"tbl\"><thead><tr><th>Demarcacion</th><th class=\"r\">Esc.</th><th>Base</th><th>Con boleta</th><th class=\"r\">Delta</th></tr></thead><tbody>" + ganRows + "</tbody></table></div>" : "";
  var perSection = res.perdidos.length ? "<div class=\"card\"><h3 style=\"color:var(--yellow)\">Donde pierde curules (" + res.perdidos.length + ")</h3><table class=\"tbl\"><thead><tr><th>Demarcacion</th><th class=\"r\">Esc.</th><th>Base</th><th>Con boleta</th><th class=\"r\">Delta</th></tr></thead><tbody>" + perRows + "</tbody></table></div>" : "";

  container.innerHTML =
    "<div class=\"card\" style=\"margin-bottom:12px;\">" +
      "<h3>Impacto en " + lider + "</h3>" +
      statGrid([["Curules base", String(baseL)], ["Curules boleta", String(boletaL)], ["Diferencia", "<span class=\"" + deltaCls + "\">" + deltaStr + "</span>"]]) +
      "<div style=\"margin-top:8px;\">" + majBadge + "</div>" +
    "</div>" +
    ganSection + perSection;
}

//  8. AUDITORIA 
export function renderAuditoria(state, ctx) {
  var audit = runAuditoria(ctx);
  var issueRows = audit.issues.map(function(i) { return "<li>" + i.msg + "</li>"; }).join("");
  var okRows    = audit.ok.map(function(i) { return "<li>" + i.msg + "</li>"; }).join("");
  var noIssues  = audit.issues.length === 0 ? "<p class=\"muted\">Sin alertas. Datos integros.</p>" : "";

  view().innerHTML =
    "<div class=\"page-header\"><h2>Auditoria de Datos</h2>" +
      badge("Alertas: " + audit.resumen.errores, "badge-err") + " " +
      badge("OK: " + audit.resumen.correctos, "badge-good") +
    "</div>" +
    "<div class=\"row-2col\" style=\"gap:14px;\">" +
      "<div class=\"card\"><h3 style=\"color:var(--red)\">Alertas (" + audit.issues.length + ")</h3>" + noIssues + (audit.issues.length ? "<ul class=\"audit-list err\">" + issueRows + "</ul>" : "") + "</div>" +
      "<div class=\"card\"><h3 style=\"color:var(--green)\">Validaciones OK (" + audit.ok.length + ")</h3><ul class=\"audit-list good\">" + okRows + "</ul></div>" +
    "</div>";
}

export { exportarPDF };

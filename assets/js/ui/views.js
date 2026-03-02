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
  slot.innerHTML =
    "<div class=\"ctrl-group\">" +
      "<label class=\"ctrl-label\" title=\"Afecta todos los modulos: Dashboard, Mapa, Simulador, Potencial y Movilizacion\">Nivel de Eleccion Activo</label>" +
      "<select id=\"g-nivel\" class=\"sel-sm\" title=\"Afecta todos los modulos\">" + nOpts + "</select>" +
    "</div>" +
    "<div class=\"ctrl-group\">" +
      "<label class=\"ctrl-label\" title=\"Determina el padron base para calcular participacion y abstencion proyectada\">Corte (Padron y Participacion)</label>" +
      "<select id=\"g-corte\" class=\"sel-sm\" title=\"Afecta padron, participacion y proyeccion base\">" + cOpts + "</select>" +
    "</div>";
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
      // Validar match SVG <-> datos en consola
      if (_mapApi && _mapApi.validate) {
        _mapApi.validate(Object.keys(lv.prov));
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

  // Partidos: usar ctx.partidos si existe, si no usar ranked (todos sin filtro de %)
  var allParties = (ctx.partidos && ctx.partidos.length)
    ? ctx.partidos.map(function(p) { return p.codigo; })
    : ranked.map(function(r) { return r.p; });

  // Enriquecer con votos actuales
  var partyData = allParties.map(function(p) {
    var entry = ranked.filter(function(r) { return r.p === p; })[0];
    return { p: p, pct: entry ? entry.pct : 0, v: entry ? entry.v : 0 };
  });

  var tblRowsBasic = partyData.slice(0, 8).map(function(r) {
    return "<tr data-p=\"" + r.p + "\"><td>" + dot(r.p) + r.p + "</td><td class=\"r\">" + fmtPct(r.pct) + "</td>" +
      "<td class=\"r\"><input class=\"inp-sm delta-in\" type=\"number\" step=\"0.1\" value=\"0\" style=\"width:68px;text-align:right;\" data-party=\"" + r.p + "\"></td></tr>";
  }).join("");

  var tblRowsAll = partyData.map(function(r) {
    return "<tr data-p=\"" + r.p + "\"><td>" + dot(r.p) + r.p + "</td><td class=\"r\">" + fmtPct(r.pct) + "</td>" +
      "<td class=\"r\"><input class=\"inp-sm delta-in\" type=\"number\" step=\"0.1\" value=\"0\" style=\"width:68px;text-align:right;\" data-party=\"" + r.p + "\"></td></tr>";
  }).join("");

  var movBtns = [-5,-3,3,5,7].map(function(pp) {
    var cls = pp < 0 ? "btn-sm neg" : "btn-sm";
    return "<button class=\"" + cls + "\" data-mov=\"" + pp + "\">" + (pp > 0 ? "+" : "") + pp + "</button>";
  }).join("");

  var liderOpts  = partyData.map(function(r) { return opt(r.p, r.p, false); }).join("");
  var aliadoRows = partyData.slice(1).map(function(r) {
    return "<div class=\"alianza-row\" style=\"display:flex;gap:8px;align-items:center;margin-bottom:4px;\" data-p=\"" + r.p + "\">" +
      "<input type=\"checkbox\" class=\"alz-chk\" value=\"" + r.p + "\" id=\"alz-" + r.p + "\">" +
      "<label for=\"alz-" + r.p + "\" style=\"min-width:50px;\">" + r.p + "</label>" +
      "<input class=\"inp-sm alz-pct\" type=\"number\" min=\"0\" max=\"100\" step=\"5\" value=\"80\" style=\"width:60px;\" data-party=\"" + r.p + "\" disabled>" +
    "</div>";
  }).join("");

  var arrOpts = partyData.slice(0, 8).map(function(r) { return opt(r.p, r.p, false); }).join("");
  var arrastreBlock = nivel !== "pres"
    ? "<div class=\"card\" style=\"margin-bottom:12px;\">" +
        "<h3>Arrastre presidencial</h3>" +
        "<div style=\"display:flex;gap:8px;align-items:center;flex-wrap:wrap;\">" +
          "<label><input type=\"checkbox\" id=\"sim-arrastre\"> Activar</label>" +
          "<select id=\"sim-arr-lider\" class=\"sel-sm\">" + arrOpts + "</select>" +
          "<select id=\"sim-arr-k\" class=\"sel-sm\">" +
            "<option value=\"auto\">Auto</option>" +
            "<option value=\"0.60\">k=0.60 (>10pp)</option>" +
            "<option value=\"0.40\">k=0.40 (5-10pp)</option>" +
            "<option value=\"0.25\">k=0.25 (<5pp)</option>" +
          "</select>" +
        "</div>" +
      "</div>"
    : "";

  view().innerHTML =
    "<div class=\"page-header\"><h2>Simulador - " + NIVEL_LABEL[nivel] + "</h2></div>" +
    "<div class=\"sim-layout\">" +
      "<div>" +
        // MODO BASICO (visible por defecto)
        "<div class=\"card\" style=\"margin-bottom:12px;\">" +
          "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;\">" +
            "<h3>Ajuste por partido (delta pp)</h3>" +
            "<button class=\"btn-sm\" id=\"btn-show-all\" title=\"Mostrar todos los partidos\">+ Todos</button>" +
          "</div>" +
          "<p class=\"muted\" style=\"font-size:12px;margin-bottom:8px;\">Variacion en puntos porcentuales. Se renormaliza automaticamente.</p>" +
          "<div style=\"overflow:auto;max-height:280px;\">" +
            "<table class=\"tbl\" id=\"sim-tbl\">" +
              "<thead><tr><th>Partido</th><th class=\"r\">% base</th><th class=\"r\">delta pp</th></tr></thead>" +
              "<tbody id=\"sim-tbody\">" + tblRowsBasic + "</tbody>" +
            "</table>" +
          "</div>" +
        "</div>" +
        "<div class=\"card\" style=\"margin-bottom:12px;\">" +
          "<h3>Movilizacion</h3>" +
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;align-items:center;\">" + movBtns +
            "<input id=\"sim-mov\" class=\"inp-sm\" type=\"number\" step=\"0.1\" value=\"" + savedMov + "\" style=\"width:68px;\">" +
          "</div>" +
        "</div>" +
        // PANEL AVANZADO (colapsado por defecto)
        "<details class=\"card\" style=\"margin-bottom:12px;\">" +
          "<summary style=\"cursor:pointer;font-weight:600;padding:2px 0;\">Avanzado: Alianzas y Arrastre</summary>" +
          "<div style=\"margin-top:12px;\">" +
            "<h4 style=\"margin-bottom:8px;\">Alianzas</h4>" +
            "<div style=\"display:flex;gap:8px;align-items:center;margin-bottom:8px;\">" +
              "<label class=\"muted\">Lider:</label>" +
              "<select id=\"sim-lider\" class=\"sel-sm\">" + liderOpts + "</select>" +
            "</div>" +
            "<div id=\"sim-aliados\" style=\"max-height:180px;overflow-y:auto;font-size:13px;\">" + aliadoRows + "</div>" +
          "</div>" +
          "<div style=\"margin-top:12px;\">" + arrastreBlock + "</div>" +
        "</details>" +
        "<div style=\"display:flex;gap:10px;flex-wrap:wrap;\">" +
          "<button class=\"btn\" id=\"btn-sim\">Simular</button>" +
          "<button class=\"btn-sm\" id=\"btn-sim-reset\">Reset</button>" +
        "</div>" +
      "</div>" +
      "<div><div class=\"card\" id=\"sim-result\"><p class=\"muted\">Configura y presiona Simular.</p></div></div>" +
    "</div>";

  // Wire: show all parties toggle
  el("btn-show-all").addEventListener("click", function() {
    var tbody = el("sim-tbody");
    if (!tbody) return;
    var btn = el("btn-show-all");
    var showing = btn.textContent === "- Menos";
    tbody.innerHTML = showing ? tblRowsBasic : tblRowsAll;
    btn.textContent = showing ? "+ Todos" : "- Menos";
  });

  document.querySelectorAll(".alz-chk").forEach(function(chk) {
    chk.addEventListener("change", function() {
      var inp = document.querySelector(".alz-pct[data-party=\"" + chk.value + "\"]");
      if (inp) inp.disabled = !chk.checked;
    });
  });
  document.querySelectorAll("[data-mov]").forEach(function(b) {
    b.addEventListener("click", function() { var m = el("sim-mov"); if(m) m.value = b.dataset.mov; });
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
    var m = el("sim-mov"); if(m) m.value = "0";
    document.querySelectorAll(".alz-chk").forEach(function(c) { c.checked = false; });
    document.querySelectorAll(".alz-pct").forEach(function(p) { p.disabled = true; });
    var res = el("sim-result"); if(res) res.innerHTML = "<p class=\"muted\">Reset.</p>";
  });
}

export function renderPotencial(state, ctx) {
  var nivel  = state.nivel;
  var nat24  = getLevel(ctx, 2024, nivel).nacional;
  var ranked = rankVotes(nat24.votes, nat24.emitidos);
  // Partido inicial: el lider del nivel activo
  var liderDefault = ranked[0] ? ranked[0].p : "PRM";

  // Opciones de partido
  var pOpts = ranked.map(function(r) {
    return opt(r.p, r.p + " (" + fmtPct(r.pct) + ")", r.p === liderDefault);
  }).join("");

  view().innerHTML =
    "<div class=\"page-header\">" +
      "<h2>Potencial - " + NIVEL_LABEL[nivel] + "</h2>" +
      "<div style=\"display:flex;gap:8px;align-items:center;\">" +
        "<label class=\"muted\">Partido:</label>" +
        "<select id=\"pot-partido\" class=\"sel-sm\">" + pOpts + "</select>" +
        "<button class=\"btn-sm\" id=\"btn-pot-met\">Ver metodologia</button>" +
      "</div>" +
    "</div>" +
    "<div id=\"pot-met\" style=\"display:none;\" class=\"card\" style=\"margin-bottom:12px;\">" +
    "</div>" +
    "<div id=\"pot-body\"><p class=\"muted\">Calculando...</p></div>";

  function renderPotTable(lider) {
    var data = calcPotencial(ctx, nivel, lider);
    var cats = ["Fortaleza","Oportunidad","Disputa","Crecimiento","Adverso","Baja prioridad"];

    var kpiCats = cats.map(function(cat) {
      var count = data.filter(function(r) { return r.categoria.label === cat; }).length;
      return kpi(cat, String(count));
    }).join("");

    var rows = data.map(function(r, i) {
      var tendStr = (r.pct20 !== null && r.pct20 !== undefined)
        ? (r.tendencia > 0 ? "+" : "") + fmtPct(r.tendencia) : "-";
      var tendCls = r.tendencia > 0 ? "text-ok" : r.tendencia < 0 ? "text-warn" : "";
      var margenStr = r.margen >= 0
        ? "<span class=\"text-ok\">" + fmtPct(r.margen) + "</span>"
        : "<span class=\"text-warn\">" + fmtPct(r.margen) + "</span>";
      return "<tr>" +
        "<td class=\"muted\">" + (i+1) + "</td>" +
        "<td><b>" + r.nombre + "</b></td>" +
        "<td class=\"r\"><b>" + r.score + "</b></td>" +
        "<td>" + catBadge(r.categoria.label, r.categoria.cls) + "</td>" +
        "<td class=\"r\">" + fmtPct(r.pct24) + "</td>" +
        "<td class=\"r " + tendCls + "\">" + tendStr + "</td>" +
        "<td class=\"r\">" + margenStr + "</td>" +
        "<td class=\"r\">" + fmtPct(r.abst) + "</td>" +
        "<td class=\"r\">" + fmtInt(r.padron) + "</td>" +
        "</tr>";
    }).join("");

    el("pot-body").innerHTML =
      "<div class=\"kpi-grid\" style=\"margin-bottom:14px;\">" + kpiCats + "</div>" +
      "<div class=\"card\" style=\"overflow:auto;max-height:60vh;\">" +
        "<table class=\"tbl\"><thead><tr>" +
          "<th>#</th><th>Territorio</th><th class=\"r\">Score</th><th>Categoria</th>" +
          "<th class=\"r\">% " + lider + " 24</th><th class=\"r\">Tend.</th>" +
          "<th class=\"r\">Margen</th><th class=\"r\">Abstencion</th><th class=\"r\">Inscritos</th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table>" +
      "</div>";
  }

  renderPotTable(liderDefault);

  el("pot-partido").addEventListener("change", function(e) {
    renderPotTable(e.target.value);
  });

  el("btn-pot-met").addEventListener("click", function() {
    var div = el("pot-met");
    if (div.style.display === "none") {
      div.style.display = "";
      div.innerHTML =
        "<h4 style=\"margin-bottom:8px;\">Metodologia de Score (0-100)</h4>" +
        "<table class=\"tbl\">" +
          "<thead><tr><th>Factor</th><th class=\"r\">Peso</th><th>Descripcion</th><th>Rango</th></tr></thead>" +
          "<tbody>" +
            "<tr><td>Tendencia</td><td class=\"r\">25</td><td>Cambio pp lider 2020 -> 2024. Positivo = sube.</td><td>clamp(0.5 + tend*3, 0, 1)</td></tr>" +
            "<tr><td>Margen</td><td class=\"r\">20</td><td>Margen del lider (directo). Mayor margen = mas fortaleza.</td><td>clamp(0.5 + margen*2, 0, 1)</td></tr>" +
            "<tr><td>Abstencion</td><td class=\"r\">15</td><td>Alta abstencion = potencial de movilizacion.</td><td>abst / 0.6</td></tr>" +
            "<tr><td>Padron</td><td class=\"r\">15</td><td>Tamano relativo del padron vs maximo.</td><td>ins / max(ins)</td></tr>" +
            "<tr><td>Elasticidad</td><td class=\"r\">15</td><td>Volatilidad historica del territorio.</td><td>min(|tend|*2, 1)</td></tr>" +
            "<tr><td>Estabilidad</td><td class=\"r\">10</td><td>Consistencia historica (inverso volatilidad).</td><td>1 - min(|tend|*3, 1)</td></tr>" +
          "</tbody>" +
        "</table>" +
        "<h4 style=\"margin:10px 0 6px;\">Categorias</h4>" +
        "<table class=\"tbl\">" +
          "<thead><tr><th>Categoria</th><th class=\"r\">Score min</th><th>Interpretacion</th></tr></thead>" +
          "<tbody>" +
            "<tr><td>" + catBadge("Fortaleza","cat-green") + "</td><td class=\"r\">70</td><td>Lider domina, margen amplio.</td></tr>" +
            "<tr><td>" + catBadge("Oportunidad","cat-lgreen") + "</td><td class=\"r\">55</td><td>Lider adelante con espacio de crecimiento.</td></tr>" +
            "<tr><td>" + catBadge("Disputa","cat-yellow") + "</td><td class=\"r\">45</td><td>Zona competida, resultado incierto.</td></tr>" +
            "<tr><td>" + catBadge("Crecimiento","cat-blue") + "</td><td class=\"r\">35</td><td>Lider debil pero tendencia positiva.</td></tr>" +
            "<tr><td>" + catBadge("Adverso","cat-red") + "</td><td class=\"r\">20</td><td>Lider atras, territorio dificil.</td></tr>" +
            "<tr><td>" + catBadge("Baja prioridad","cat-gray") + "</td><td class=\"r\">0</td><td>Sin perspectiva razonable.</td></tr>" +
          "</tbody>" +
        "</table>";
      el("btn-pot-met").textContent = "Ocultar metodologia";
    } else {
      div.style.display = "none";
      el("btn-pot-met").textContent = "Ver metodologia";
    }
  });
}

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
  var parties = ranked.map(function(r) { return r.p; });
  var provs   = Object.keys(lv.prov);
  var provOpts = provs.map(function(id) {
    return opt(id, (lv.prov[id].nombre || id), false);
  }).join("");
  var partyOpts = parties.map(function(p) { return opt(p, p, false); }).join("");

  view().innerHTML =
    "<div class=\"page-header\"><h2>Boleta Unica Opositora</h2></div>" +
    // Tabs modo A / modo B
    "<div style=\"display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--border);\">" +
      "<button class=\"tab-btn active\" id=\"tab-a\">Modo A: Territorio primero</button>" +
      "<button class=\"tab-btn\" id=\"tab-b\">Modo B: Partido primero</button>" +
    "</div>" +
    "<div id=\"modo-a\">" + buildModoA(parties, provs, lv, partyOpts, provOpts) + "</div>" +
    "<div id=\"modo-b\" style=\"display:none;\">" + buildModoB(parties, lv, partyOpts) + "</div>";

  // Tab switching
  el("tab-a").addEventListener("click", function() {
    el("modo-a").style.display = "";
    el("modo-b").style.display = "none";
    el("tab-a").classList.add("active");
    el("tab-b").classList.remove("active");
  });
  el("tab-b").addEventListener("click", function() {
    el("modo-a").style.display = "none";
    el("modo-b").style.display = "";
    el("tab-b").classList.add("active");
    el("tab-a").classList.remove("active");
  });

  // Modo A: seleccionar provincia -> ver partidos -> alianzas -> D'Hondt live
  var modoASelect = el("modoA-prov");
  var modoARes    = el("modoA-result");
  if (modoASelect) {
    modoASelect.addEventListener("change", function() {
      recalcModoA(ctx, parties, lv);
    });
  }
  document.querySelectorAll(".mA-chk").forEach(function(chk) {
    chk.addEventListener("change", function() {
      var pct = document.querySelector(".mA-pct[data-party=\"" + chk.value + "\"]");
      if (pct) pct.disabled = !chk.checked;
      recalcModoA(ctx, parties, lv);
    });
  });
  document.querySelectorAll(".mA-pct").forEach(function(inp) {
    inp.addEventListener("change", function() { recalcModoA(ctx, parties, lv); });
  });

  // Modo B: seleccionar partido base -> territorios -> aliados -> progresivo
  var modoBSelect = el("modoB-partido");
  if (modoBSelect) {
    modoBSelect.addEventListener("change", function() { recalcModoB(ctx, parties, lv); });
  }
  document.querySelectorAll(".mB-chk").forEach(function(chk) {
    chk.addEventListener("change", function() { recalcModoB(ctx, parties, lv); });
  });
}

function buildModoA(parties, provs, lv, partyOpts, provOpts) {
  return "<div class=\"row-2col\" style=\"gap:14px;\">" +
    "<div class=\"card\">" +
      "<h3>Seleccionar provincia</h3>" +
      "<select id=\"modoA-prov\" class=\"sel-sm\" style=\"width:100%;margin-bottom:12px;\">" + provOpts + "</select>" +
      "<h4 style=\"margin-bottom:8px;\">Alianzas para esta provincia</h4>" +
      "<div id=\"modoA-parties\">" +
        parties.map(function(p) {
          return "<div style=\"display:flex;gap:8px;align-items:center;margin-bottom:4px;\">" +
            "<input type=\"checkbox\" class=\"mA-chk\" value=\"" + p + "" id=\"mA-" + p + "\">" +
            "<label for=\"mA-" + p + "\" style=\"min-width:55px;\">" + dot(p) + p + "</label>" +
            "<input class=\"inp-sm mA-pct\" type=\"number\" min=\"0\" max=\"100\" step=\"5\" value=\"80\" style=\"width:58px;\" data-party=\"" + p + "\" disabled>" +
            "<span class=\"muted\" style=\"font-size:11px;\">% transf.</span>" +
            "</div>";
        }).join("") +
      "</div>" +
    "</div>" +
    "<div class=\"card\" id=\"modoA-result\"><p class=\"muted\">Selecciona una provincia para ver el efecto.</p></div>" +
  "</div>";
}

function buildModoB(parties, lv, partyOpts) {
  return "<div class=\"row-2col\" style=\"gap:14px;\">" +
    "<div class=\"card\">" +
      "<h3>Partido base</h3>" +
      "<select id=\"modoB-partido\" class=\"sel-sm\" style=\"width:100%;margin-bottom:12px;\">" + partyOpts + "</select>" +
      "<h4 style=\"margin-bottom:8px;\">Aliados a incluir</h4>" +
      "<div id=\"modoB-aliados\">" +
        parties.slice(1).map(function(p) {
          return "<div style=\"display:flex;gap:8px;align-items:center;margin-bottom:4px;\">" +
            "<input type=\"checkbox\" class=\"mB-chk\" value=\"" + p + "" id=\"mB-" + p + "\">" +
            "<label for=\"mB-" + p + "\">" + dot(p) + p + "</label>" +
          "</div>";
        }).join("") +
      "</div>" +
    "</div>" +
    "<div class=\"card\" id=\"modoB-result\"><p class=\"muted\">Selecciona partido base para ver territorios de impacto.</p></div>" +
  "</div>";
}

function recalcModoA(ctx, parties, lv) {
  var provId  = el("modoA-prov") ? el("modoA-prov").value : null;
  var resDiv  = el("modoA-result");
  if (!provId || !resDiv) return;

  var prov = lv.prov[provId];
  if (!prov) { resDiv.innerHTML = "<p class=\"muted\">Sin datos para esta provincia.</p>"; return; }

  // Buscar circ de esta provincia en curules (puede ser multi-circ)
  var cur = ctx.curules;
  var circs = (cur.territorial || []).filter(function(c) {
    return String(c.provincia_id).padStart(2,"0") === provId;
  });
  if (!circs.length) { resDiv.innerHTML = "<p class=\"muted\">Sin circunscripciones para provincia " + provId + ".</p>"; return; }

  // Obtener alianzas seleccionadas
  var liderEl = document.querySelector(".mA-chk:checked");
  var lider   = liderEl ? null : null; // sin lider obligatorio en modo A
  var aliados = [];
  document.querySelectorAll(".mA-chk:checked").forEach(function(chk) {
    var pct = document.querySelector(".mA-pct[data-party=\"" + chk.value + "\"]");
    aliados.push({ partido: chk.value, transferPct: pct ? Number(pct.value) : 80 });
  });

  // D'Hondt por circ, base vs boleta
  var html = "<h3>" + (prov.nombre || provId) + " - " + circs.length + " circunscripcion(es)</h3>";
  var lv24  = ctx.r[2024];
  circs.forEach(function(c) {
    var key = c.circ > 0 ? provId + "-" + c.circ : provId;
    var circData = c.circ > 0
      ? (lv24.dip.circ ? lv24.dip.circ[key] : null)
      : lv24.dip.prov[provId];
    if (!circData) return;

    // Calcular boleta aplicando transferencias
    var baseVotes  = Object.assign({}, circData.votes || {});
    var boletaVotes = Object.assign({}, baseVotes);
    if (aliados.length >= 2) {
      // El primero en la lista es el lider de la alianza
      var liderId = aliados[0].partido;
      for (var i = 1; i < aliados.length; i++) {
        var al = aliados[i];
        var moved = Math.round((boletaVotes[al.partido] || 0) * (al.transferPct / 100));
        boletaVotes[al.partido] = (boletaVotes[al.partido] || 0) - moved;
        boletaVotes[liderId]    = (boletaVotes[liderId]    || 0) + moved;
      }
    }

    // D'Hondt simple
    function dhondtLocal(votes, seats) {
      var q = [];
      Object.keys(votes).forEach(function(p) {
        var v = votes[p] || 0;
        if (v > 0) {
          for (var d = 1; d <= seats; d++) q.push({ p: p, q: v/d });
        }
      });
      q.sort(function(a,b){return b.q-a.q;});
      var bp = {};
      q.slice(0,seats).forEach(function(x) { bp[x.p] = (bp[x.p]||0)+1; });
      return bp;
    }

    var baseRes   = dhondtLocal(baseVotes,   c.seats);
    var boletaRes = aliados.length >= 2 ? dhondtLocal(boletaVotes, c.seats) : baseRes;

    var baseDist   = Object.keys(baseRes).filter(function(p){return baseRes[p]>0;}).map(function(p){return p+":"+baseRes[p];}).join(", ");
    var boletaDist = Object.keys(boletaRes).filter(function(p){return boletaRes[p]>0;}).map(function(p){return p+":"+boletaRes[p];}).join(", ");

    html += "<div style=\"margin-top:12px;padding:10px;background:var(--bg3);border-radius:6px;\">" +
      "<b>Circ " + key + " (" + c.seats + " escanos)</b><br>" +
      "<span class=\"muted\">Base: </span>" + baseDist + "<br>" +
      (aliados.length >= 2 ? "<span class=\"muted\">Con alianza: </span><b>" + boletaDist + "</b>" : "<span class=\"muted\">(Selecciona 2+ partidos para ver efecto)</span>") +
    "</div>";
  });

  resDiv.innerHTML = html;
}

function recalcModoB(ctx, parties, lv) {
  var partido = el("modoB-partido") ? el("modoB-partido").value : null;
  var resDiv  = el("modoB-result");
  if (!partido || !resDiv) return;

  var aliados = [];
  document.querySelectorAll(".mB-chk:checked").forEach(function(chk) {
    aliados.push({ partido: chk.value, transferPct: 85 });
  });

  // Usar simBoleta para calcular impacto global
  var partidos = parties.map(function(p) {
    return {
      partido:    p,
      incluir:    p === partido || aliados.some(function(a){ return a.partido === p; }),
      encabeza:   p === partido,
      transferPct: 85,
    };
  });

  var res = simBoleta(ctx, { partidos: partidos, year: 2024 });
  if (!res) { resDiv.innerHTML = "<p class=\"muted\">Error al calcular.</p>"; return; }

  var delta = res.deltaLider;
  var base  = res.baseTotal[partido] || 0;
  var con   = res.boletaTotal[partido] || 0;

  var topImpact = res.territorios.slice(0, 10).map(function(t) {
    var circ = t.circ > 0 ? " C" + t.circ : "";
    var cls  = t.delta > 0 ? "text-ok" : "text-warn";
    return "<tr><td>" + t.provincia + circ + "</td><td class=\"r\">" + t.seats +
      "</td><td class=\"r " + cls + "\">" + (t.delta > 0 ? "+" : "") + t.delta + "</td></tr>";
  }).join("");

  resDiv.innerHTML =
    "<h3>Impacto de coalicion para " + partido + "</h3>" +
    statGrid([
      ["Aliados activos", String(aliados.length)],
      ["Curules base", String(base)],
      ["Curules con boleta", String(con)],
      ["Delta", (delta >= 0 ? "+" : "") + delta],
    ]) +
    (res.territorios.length
      ? "<h4 style=\"margin:12px 0 6px;\">Top territorios de impacto</h4>" +
        "<table class=\"tbl\"><thead><tr><th>Territorio</th><th class=\"r\">Esc.</th><th class=\"r\">Delta</th></tr></thead><tbody>" + topImpact + "</tbody></table>"
      : "<p class=\"muted\" style=\"margin-top:10px;\">Sin impacto con aliados actuales.</p>"
    );
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

export function renderEncuestas(state, ctx) {
  var polls = ctx.polls || [];

  view().innerHTML =
    "<div class=\"page-header\"><h2>Encuestas</h2>" +
      "<button class=\"btn-sm\" id=\"btn-enc-upload\">Cargar archivo</button>" +
      "<input type=\"file\" id=\"enc-file\" accept=\".json\" style=\"display:none;\">" +
    "</div>" +

    // Toggle aplicar a simulador
    "<div class=\"card\" style=\"margin-bottom:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;\">" +
      "<label style=\"display:flex;align-items:center;gap:8px;font-weight:600;\">" +
        "<input type=\"checkbox\" id=\"enc-apply\"> Aplicar encuesta activa al Simulador como delta inicial" +
      "</label>" +
      "<select id=\"enc-activa\" class=\"sel-sm\">" +
        (polls.length
          ? polls.map(function(p, i) {
              return opt(String(i), p.fecha + " - " + p.encuestadora + " (" + p.nivel + ")", i === 0);
            }).join("")
          : "<option>Sin encuestas</option>"
        ) +
      "</select>" +
    "</div>" +

    // Tabla historica
    "<div class=\"card\" style=\"margin-bottom:14px;\">" +
      "<h3>Historico de encuestas (" + polls.length + ")</h3>" +
      (polls.length
        ? "<div style=\"overflow:auto;\">" +
            "<table class=\"tbl\">" +
              "<thead><tr>" +
                "<th>Fecha</th><th>Encuestadora</th><th>Nivel</th>" +
                "<th class=\"r\">Muestra</th><th class=\"r\">Margen error</th>" +
                "<th>Principales resultados</th>" +
              "</tr></thead>" +
              "<tbody>" + polls.map(function(p) {
                var topRes = Object.entries(p.resultados || {})
                  .sort(function(a,b){return b[1]-a[1];})
                  .slice(0,5)
                  .map(function(kv) { return kv[0] + ":" + kv[1] + "%"; })
                  .join(" | ");
                return "<tr>" +
                  "<td>" + (p.fecha || "-") + "</td>" +
                  "<td>" + (p.encuestadora || "-") + "</td>" +
                  "<td>" + (p.nivel || "-") + "</td>" +
                  "<td class=\"r\">" + (p.muestra ? fmtInt(p.muestra) : "-") + "</td>" +
                  "<td class=\"r\">+/-" + (p.margen_error || "-") + "%</td>" +
                  "<td style=\"font-size:12px;\">" + topRes + "</td>" +
                "</tr>";
              }).join("") +
              "</tbody>" +
            "</table>" +
          "</div>"
        : "<p class=\"muted\">Sin encuestas cargadas. Usa el boton \"Cargar archivo\" para importar un polls.json.</p>"
      ) +
    "</div>" +

    // Grafico comparativo (si hay datos)
    (polls.length
      ? "<div class=\"card\">" +
          "<h3>Comparativo - Encuesta mas reciente</h3>" +
          renderEncuestaChart(polls[polls.length-1]) +
        "</div>"
      : ""
    );

  // Upload handler
  el("btn-enc-upload").addEventListener("click", function() {
    var fi = el("enc-file");
    if (fi) fi.click();
  });
  var fileInp = el("enc-file");
  if (fileInp) {
    fileInp.addEventListener("change", function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = JSON.parse(ev.target.result);
          var arr  = Array.isArray(data) ? data : [data];
          ctx.polls = (ctx.polls || []).concat(arr);
          toast("Encuesta cargada: " + arr.length + " registro(s)");
          renderEncuestas(state, ctx);
        } catch(err) {
          toast("Error: JSON invalido");
        }
      };
      reader.readAsText(file);
    });
  }

  // Aplicar al simulador
  var applyChk = el("enc-apply");
  if (applyChk) {
    applyChk.addEventListener("change", function() {
      if (!applyChk.checked) return;
      var idx   = el("enc-activa") ? Number(el("enc-activa").value) : 0;
      var encuesta = polls[idx];
      if (!encuesta || !encuesta.resultados) {
        toast("Sin datos de resultados en la encuesta");
        return;
      }
      // Calcular deltas vs 2024
      var nivel = state.nivel === "pres" ? "pres" : state.nivel;
      var lv    = getLevel(ctx, 2024, nivel);
      var nat   = lv.nacional;
      var totalEm = nat.emitidos || 1;
      var deltaStore = {};
      Object.entries(encuesta.resultados).forEach(function(kv) {
        var p = kv[0]; var pctEnc = kv[1] / 100;
        var pctBase = (nat.votes[p] || 0) / totalEm;
        var delta = Math.round((pctEnc - pctBase) * 100 * 10) / 10;
        if (Math.abs(delta) > 0.1) deltaStore[p] = delta;
      });
      localStorage.setItem("sie28-sim-deltas", JSON.stringify(deltaStore));
      toast("Deltas guardados. Ve al Simulador para aplicarlos.");
    });
  }
}

function renderEncuestaChart(encuesta) {
  if (!encuesta || !encuesta.resultados) return "<p class=\"muted\">Sin datos.</p>";
  var sorted = Object.entries(encuesta.resultados)
    .sort(function(a,b){return b[1]-a[1];})
    .slice(0, 8);
  var max = sorted[0] ? sorted[0][1] : 1;
  return "<div style=\"margin-top:8px;\">" +
    sorted.map(function(kv) {
      var p = kv[0]; var pct = kv[1];
      var w = Math.round((pct/max)*100);
      return "<div class=\"bar-row\">" +
        "<span class=\"bar-label\">" + p + "</span>" +
        "<div class=\"bar-track\">" +
          "<div class=\"bar-fill\" style=\"width:" + w + "%;background:" + clr(p) + "\"></div>" +
        "</div>" +
        "<span class=\"bar-pct\">" + pct + "%</span>" +
        "</div>";
    }).join("") +
    "<p class=\"muted\" style=\"margin-top:8px;font-size:11px;\">" +
      encuesta.encuestadora + " | " + encuesta.fecha +
      (encuesta.muestra ? " | n=" + fmtInt(encuesta.muestra) : "") +
      (encuesta.margen_error ? " | +/-" + encuesta.margen_error + "%" : "") +
    "</p>" +
  "</div>";
}

export { exportarPDF };

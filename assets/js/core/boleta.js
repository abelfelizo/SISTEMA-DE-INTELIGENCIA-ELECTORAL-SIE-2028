/**
 * SIE 2028  core/boleta.js  (H3)
 * Motor de optimizacin legislativa: boleta nica opositora.
 * Simula qu sucede si partidos de oposicin van en coalicin
 * en cada demarcacin para maximizar curules.
 */
import { dhondt }         from "./dhondt.js";
import { getLevel }       from "./data.js";
import { rankVotes }      from "./utils.js";

/**
 * Calcula el escenario de boleta nica.
 * params:
 *   partidos: [{ partido, incluir: bool, transferPct: 0-100, encabeza: bool }]
 *   year: 2024
 * Devuelve:
 *   { base, boleta, ganados, perdidos, territorios }
 */
export function simBoleta(ctx, params) {
  var { partidos = [], year = 2024 } = params;
  var cur = ctx.curules;
  if (!(cur && cur.territorial)) return null;

  var lv  = getLevel(ctx, year, "dip");
  var nat = (lv.nacional && lv.nacional.votes) || {};

  // Determinar lder (partido que encabeza)
  var _lidList = partidos.filter(function(p){return p.encabeza && p.incluir;});
  if (!_lidList.length) _lidList = partidos.filter(function(p){return p.incluir;});
  var lider = _lidList.length ? _lidList[0].partido : null;
  if (!lider) return null;

  var incluidos = partidos.filter(p => p.incluir && p.partido !== lider);

  // Funcin para obtener votos de una circ con y sin boleta
  function getVotes(key, c) {
    var isMulti = c.circ > 0;
    var data    = isMulti
      ? (lv.circ && lv.circ[key] ? lv.circ[key] : null)
      : (lv.prov && lv.prov[key] ? lv.prov[key] : null);
    return (data && data.votes) || {};
  }

  function applyBoleta(votes) {
    var out = { ...votes };
    // Transferir votos de aliados al lder
    for (var { partido, transferPct } of incluidos) {
      var v     = out[partido] || 0;
      var moved = Math.round(v * (transferPct / 100));
      out[partido]  = v - moved;
      out[lider]    = (out[lider] || 0) + moved;
    }
    return out;
  }

  var baseTotal   = {};
  var boletaTotal = {};
  var territorios = [];

  for (var c of cur.territorial) {
    var pid = String(c.provincia_id).padStart(2, "0");
    var key = c.circ > 0 ? `${pid}-${c.circ}` : pid;

    var baseVotes   = getVotes(key, c);
    var boletaVotes = applyBoleta(baseVotes);
    if (!Object.keys(baseVotes).length) continue;

    var baseRes   = dhondt(baseVotes,   c.seats);
    var boletaRes = dhondt(boletaVotes, c.seats);

    for (var [p, s] of Object.entries(baseRes.byParty)) {
      baseTotal[p] = (baseTotal[p] || 0) + s;
    }
    for (var [p, s] of Object.entries(boletaRes.byParty)) {
      boletaTotal[p] = (boletaTotal[p] || 0) + s;
    }

    var liderBase   = baseRes.byParty[lider]   || 0;
    var liderBoleta = boletaRes.byParty[lider]  || 0;
    var delta       = liderBoleta - liderBase;

    if (delta !== 0) {
      territorios.push({
        key,
        provincia: c.provincia,
        circ: c.circ,
        seats: c.seats,
        liderBase,
        liderBoleta,
        delta,
        baseDistrib:   Object.entries(baseRes.byParty).filter(([,s])=>s>0).map(([p,s])=>`${p}:${s}`).join(", "),
        boletaDistrib: Object.entries(boletaRes.byParty).filter(([,s])=>s>0).map(([p,s])=>`${p}:${s}`).join(", "),
      });
    }
  }

  var ganados  = territorios.filter(t => t.delta > 0);
  var perdidos = territorios.filter(t => t.delta < 0);

  return {
    lider,
    base:         boletaTotal,   // alias para consistencia
    baseTotal,
    boletaTotal,
    ganados,
    perdidos,
    territorios,
    deltaLider: (boletaTotal[lider] || 0) - (baseTotal[lider] || 0),
  };
}

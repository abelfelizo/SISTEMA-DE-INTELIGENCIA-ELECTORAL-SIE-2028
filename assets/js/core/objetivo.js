/**
 * SIE 2028 -- core/objetivo.js  (H5)
 *
 * H5 additions:
 *   - calcularProvinciasCriticas(): para sen/dip, identifica top 5 provincias
 *     donde el lider esta mas cerca de voltear un escano
 *   - Backsolve muestra: delta_pp, votos_adicionales, provincias_clave
 */

import { simular }   from "./simulacion.js";
import { rankVotes } from "./utils.js";
import { getLevel }  from "./data.js";

export function calcularDeltaParaMeta(ctx, params) {
  var lider    = params.lider;
  var metaPct  = params.metaPct;
  var nivel    = params.nivel || "pres";
  var maxDelta = params.maxDelta || 30;

  var lo = -10, hi = maxDelta, best = null;

  for (var iter = 0; iter < 40; iter++) {
    var mid = (lo + hi) / 2;
    var dpp = Object.assign({}, params.deltasPP || {});
    dpp[lider] = mid;
    var res   = simular(ctx, Object.assign({}, params, { nivel:nivel, deltasPP:dpp }));
    var found = res.ranked.filter(function(r){ return r.p===lider; })[0];
    var pct   = found ? found.pct : 0;

    if (Math.abs(pct - metaPct) < 0.0001) { best = { deltaPP:mid, resultado:res }; break; }
    if (pct < metaPct) lo = mid; else hi = mid;
    best = { deltaPP:mid, resultado:res };
  }

  var dppMax = Object.assign({}, params.deltasPP || {}); dppMax[lider] = maxDelta;
  var resMax   = simular(ctx, Object.assign({}, params, { nivel:nivel, deltasPP:dppMax }));
  var mxFound  = resMax.ranked.filter(function(r){ return r.p===lider; })[0];
  var maxPct   = mxFound ? mxFound.pct : 0;

  if (maxPct < metaPct) return { imposible:true, maximo:maxPct, resultado:resMax };
  return Object.assign({ imposible:false }, best);
}

export function calcularDipMeta(ctx, params) {
  var lider      = params.lider;
  var metaCurules = params.metaCurules;
  var maxDelta   = params.maxDelta || 25;
  var lo = 0, hi = maxDelta, bestDelta = 0, bestRes = null;

  for (var iter = 0; iter < 40; iter++) {
    var mid = (lo + hi) / 2;
    var dpp = Object.assign({}, params.deltasPP || {}); dpp[lider] = mid;
    var res = simular(ctx, Object.assign({}, params, { nivel:"dip", deltasPP:dpp }));
    var curules = (res && res.curules && res.curules.totalByParty && res.curules.totalByParty[lider]) || 0;
    if (curules >= metaCurules) { hi = mid; bestDelta = mid; bestRes = res; }
    else lo = mid;
    if (hi - lo < 0.01) break;
  }

  var dppMax = Object.assign({}, params.deltasPP || {}); dppMax[lider] = maxDelta;
  var resMax     = simular(ctx, Object.assign({}, params, { nivel:"dip", deltasPP:dppMax }));
  var maxCurules = (resMax && resMax.curules && resMax.curules.totalByParty && resMax.curules.totalByParty[lider]) || 0;

  if (maxCurules < metaCurules) return { imposible:true, maximo:maxCurules, resultado:resMax };
  return { imposible:false, deltaPP:bestDelta, resultado:bestRes };
}

/**
 * H5: Identifica las provincias/territorios mas cercanos a voltear un escano.
 * Solo para sen y dip. Devuelve top N territorios con menor delta_pp para voltear.
 */
export function calcularProvinciasCriticas(ctx, params, n) {
  n = n || 5;
  var nivel  = params.nivel;
  var lider  = params.lider;
  if (nivel !== "sen" && nivel !== "dip") return [];

  var lv   = getLevel(ctx, 2024, nivel);
  var provs = Object.keys(lv.prov || {});
  var results = [];

  for (var pi = 0; pi < provs.length; pi++) {
    var provId = provs[pi];
    var prov   = lv.prov[provId];
    if (!prov || !prov.emitidos) continue;

    var ranked = rankVotes(prov.votes || {}, prov.emitidos);
    var lEntry = ranked.filter(function(r){ return r.p === lider; })[0];
    var lPct   = lEntry ? lEntry.pct : 0;

    // Para senadores: el lider necesita ser primero (one-seat per province)
    // Para diputados: calculamos si hay un escano ganablecon un pequenio delta
    if (nivel === "sen") {
      var top = ranked[0];
      if (!top) continue;
      var gap = top.p === lider ? 0 : top.pct - lPct; // gap negativo = lider ya gana
      var tieneGap = gap > 0 && gap < 0.15; // solo si esta a menos de 15pp
      if (top.p === lider || tieneGap) {
        results.push({
          id:       provId,
          nombre:   prov.nombre || provId,
          lPct:     lPct,
          rival:    top.p === lider ? (ranked[1] ? ranked[1].p : "-") : top.p,
          gap:      gap,
          ganando:  top.p === lider,
          tipo:     top.p === lider ? "consolidar" : "voltear",
        });
      }
    } else {
      // dip: simplificado - provincias donde lider tiene voto fuerte pero no maximos escanos
      var ins = prov.inscritos || prov.emitidos || 1;
      results.push({
        id:      provId,
        nombre:  prov.nombre || provId,
        lPct:    lPct,
        rival:   ranked[0] && ranked[0].p !== lider ? ranked[0].p : (ranked[1] ? ranked[1].p : "-"),
        gap:     ranked[0] && ranked[0].p !== lider ? ranked[0].pct - lPct : 0,
        ganando: ranked[0] ? ranked[0].p === lider : false,
        tipo:    lPct > 0.40 ? "consolidar" : lPct > 0.25 ? "crecer" : "movilizar",
        inscritos: ins,
      });
    }
  }

  // Ordenar: primero los "voltear" mas cercanos, luego "consolidar"
  results.sort(function(a, b) {
    if (a.tipo === "voltear" && b.tipo !== "voltear") return -1;
    if (b.tipo === "voltear" && a.tipo !== "voltear") return  1;
    return a.gap - b.gap;
  });

  return results.slice(0, n);
}

export function generarEscenarios(ctx, params) {
  var nivel      = params.nivel;
  var metaValor  = params.metaValor;

  var metas = {
    conservador: metaValor * 0.90,
    razonable:   metaValor,
    optimizado:  metaValor * 1.05,
    agresivo:    metaValor * 1.12,
  };

  function calc(meta) {
    return nivel === "dip"
      ? calcularDipMeta(ctx, Object.assign({}, params, { metaCurules: Math.round(meta) }))
      : calcularDeltaParaMeta(ctx, Object.assign({}, params, { metaPct: meta / 100 }));
  }

  return {
    conservador: calc(metas.conservador),
    razonable:   calc(metas.razonable),
    optimizado:  calc(metas.optimizado),
    agresivo:    calc(metas.agresivo),
  };
}

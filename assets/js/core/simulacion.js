/**
 * SIE 2028  core/simulacion.js
 * Motor central de simulacin.
 * Recibe parmetros y devuelve resultado completo por nivel.
 *
 * Params estndar:
 *   { nivel, year, deltasPP, alianzas, movilizacion, arrastre, corte }
 *
 * Output:
 *   { votes, emitidos, inscritos, ranked, curules?, senadores?, ganadores? }
 */

import { dhondt }                   from "./dhondt.js";
import { getLevel, getInscritos }   from "./data.js";
import { clamp, rankVotes, deepCopy } from "./utils.js";

//  Coeficientes de cascada de movilizacin 
var MOVILIZACION_COEF = {
  pres: 1.00,
  sen:  0.85,
  dip:  0.75,
  mun:  0.70,
  dm:   0.70,
};

//  Arrastre presidencial: k segn margen 
function arrastreK(margenPres) {
  if (margenPres > 0.10) return 0.60;
  if (margenPres > 0.05) return 0.40;
  return 0.25;
}

/**
 * Aplica pp y renormaliza votos.
 * deltasPP: { partido: _pp }  (puede ser fraccin decimal)
 * baseVotes: { partido: votos }
 * baseEmitidos: nmero base de emitidos
 */
export function applyDeltas(baseVotes, deltasPP, baseEmitidos) {
  var total = baseEmitidos || Object.values(baseVotes).reduce((a, v) => a + v, 0) || 1;
  var shares = {};

  for (var [p, v] of Object.entries(baseVotes)) {
    var delta = (deltasPP[p] || 0) / 100;
    shares[p] = clamp((v / total) + delta, 0, 1);
  }

  // Renormalizar
  var norm = Object.values(shares).reduce((a, v) => a + v, 0) || 1;
  var votes = {};
  for (var [p, s] of Object.entries(shares)) {
    votes[p] = Math.round((s / norm) * total);
  }
  return votes;
}

/**
 * Aplica alianzas: transfiere votos de aliados al lder.
 * alianzas: [ { lider, aliados: [{partido, transferPct}] } ]
 * transferPct: 0100 (% de votos del aliado que van al lder)
 */
export function applyAlianzas(votes, alianzas) {
  var out = { ...votes };
  for (var { lider, aliados } of alianzas) {
    for (var { partido, transferPct } of aliados) {
      var v = out[partido] || 0;
      if (v <= 0) continue;
      var moved = Math.round(v * clamp(transferPct / 100, 0, 1));
      out[partido] = v - moved;
      out[lider]   = (out[lider] || 0) + moved;
    }
  }
  return out;
}

/**
 * Aplica movilizacin: agrega votos al pool total.
 * pp: puntos porcentuales adicionales
 * inscritos: padrn
 * emitidos: base
 * nivel: para aplicar coeficiente
 * Devuelve { extraVotos, nuevoEmitidos }
 */
export function applyMovilizacion(inscritos, emitidos, pp, nivel, distribucion = null) {
  var k      = MOVILIZACION_COEF[nivel] || 1;
  var abst   = inscritos - emitidos;
  var cap    = Math.round(abst * 0.6);
  var raw    = Math.round(inscritos * (pp / 100) * k);
  var extra  = Math.min(Math.max(raw, Math.round(inscritos * (pp / 100) * k * -1 * (pp < 0 ? 1 : 0))), cap);
  var used   = pp >= 0 ? Math.min(raw, cap) : Math.max(raw, -emitidos * 0.05);
  return { extraVotos: used, nuevoEmitidos: emitidos + used, cap };
}

/**
 * Aplica arrastre presidencial a otro nivel.
 * presResult: { ranked } del nivel presidencial ya simulado
 * votes: votos del nivel a afectar
 * lider: partido que recibe el arrastre
 * k: coeficiente (auto si null)
 */
export function applyArrastre(votes, presResult, lider, k = null) {
  if (!presResult || !lider) return votes;
  var presTop   = presResult.ranked[0];
  if (!presTop || presTop.p !== lider) return votes;

  var margen = presResult.ranked.length > 1
    ? presTop.pct - presResult.ranked[1].pct
    : presTop.pct;
  var kUsed  = k != null ? k : arrastreK(margen);
  var boost  = Math.round((votes[lider] || 0) * kUsed * margen);

  var out = { ...votes };
  out[lider] = (out[lider] || 0) + boost;
  return out;
}

/**
 * Corre D'Hondt para todos los diputados (territorial + exterior).
 * Devuelve { totalByParty, byCirc, totalSeats }
 */
export function simDip(ctx, simVotesByCirc) {
  var cur = ctx.curules;
  if (!(cur && cur.territorial)) return { totalByParty: {}, byCirc: {}, totalSeats: 0 };

  var totalByParty = {};
  var byCirc = {};

  // Territoriales
  for (var c of cur.territorial) {
    var pid  = String(c.provincia_id).padStart(2, "0");
    var key  = c.circ > 0 ? `${pid}-${c.circ}` : pid;
    var base = simVotesByCirc[key] || {};
    if (!Object.keys(base).length) continue;

    var res = dhondt(base, c.seats);
    byCirc[key] = { ...res, seats: c.seats, key };
    for (var [p, s] of Object.entries(res.byParty)) {
      totalByParty[p] = (totalByParty[p] || 0) + s;
    }
  }

  // Exterior  si no hay votos por circunscripcin, usar distribucin nacional dip como proxy
  var lv     = getLevel(ctx, 2024, "dip");
  var natDip = lv?.nacional?.votes || {};
  for (var ext of (cur.exterior || [])) {
    var ckey = `C${ext.circ_exterior}`;
    var base = lv.extDip && lv.extDip[ckey] && lv.extDip[ckey].votes || {};
    // Fallback: si no hay data propia, usar votos nacionales (mejor aproximacin disponible)
    var votes = Object.keys(base).length ? base : natDip;
    if (!Object.keys(votes).length) continue;
    var res = dhondt(votes, ext.seats);
    byCirc[ckey] = { ...res, seats: ext.seats, key: ckey, noData: !Object.keys(base).length };
    for (var [p, s] of Object.entries(res.byParty)) {
      totalByParty[p] = (totalByParty[p] || 0) + s;
    }
  }

  // Nacionales (proporcional al total territorial)
  var nacSeats = (cur.nacionales && cur.nacionales.seats) || 0;
  if (nacSeats > 0) {
    var nacRes = dhondt(totalByParty, nacSeats);
    byCirc["_nacionales"] = { ...nacRes, seats: nacSeats, key: "_nacionales" };
    for (var [p, s] of Object.entries(nacRes.byParty)) {
      totalByParty[p] = (totalByParty[p] || 0) + s;
    }
  }

  var totalSeats = Object.values(totalByParty).reduce((a, v) => a + v, 0);
  return { totalByParty, byCirc, totalSeats };
}

/**
 * Simulacin de senadores: ganador por mayora simple en cada provincia.
 * Devuelve { byProv: {provId: partido}, totalByParty }
 */
export function simSen(provVotes) {
  var byProv = {};
  var totalByParty = {};
  for (var [id, votes] of Object.entries(provVotes)) {
    var ranked = rankVotes(votes, null);
    if (!ranked.length) continue;
    var winner = ranked[0].p;
    byProv[id]   = winner;
    totalByParty[winner] = (totalByParty[winner] || 0) + 1;
  }
  return { byProv, totalByParty };
}

/**
 * Simulacin de alcaldes/DM: ganador por mayora simple en cada municipio/DM.
 */
export function simGanadores(territorioVotes) {
  var byTerritory = {};
  var totalByParty = {};
  for (var [id, votes] of Object.entries(territorioVotes)) {
    var ranked = rankVotes(votes, null);
    if (!ranked.length) continue;
    var winner = ranked[0].p;
    byTerritory[id] = winner;
    totalByParty[winner] = (totalByParty[winner] || 0) + 1;
  }
  return { byTerritory, totalByParty };
}

/**
 * Simulacin principal. Devuelve resultado completo para el nivel dado.
 */
export function simular(ctx, params) {
  var {
    nivel       = "dip",
    year        = 2024,
    deltasPP    = {},   // { partido: deltapp }
    alianzas    = [],   // [ { lider, aliados: [{partido, transferPct}] } ]
    movPP       = 0,    // puntos porcentuales de movilizacion
    movDir      = null, // { partido: pctDireccion } -- null = proporcional
    arrastre    = false,
    arrastreLider = null,
    arrastreK   = null,
    presResult  = null, // resultado presidencial ya simulado (para arrastre)
    corte       = "mayo2024",
  } = params;

  var lv  = getLevel(ctx, year, nivel);
  var nat = lv.nacional;

  var inscritos = nivel === "pres"
    ? (getInscritos(ctx, corte) || nat.inscritos || 0)
    : (nat.inscritos || 0);

  var emitidosBase = nat.emitidos || 0;

  // 1. Movilizacin nacional
  var { extraVotos, nuevoEmitidos } = applyMovilizacion(
    inscritos, emitidosBase, movPP, nivel
  );

  // 2. Votos base + movilizacin
  var votes = { ...nat.votes };
  if (extraVotos !== 0 && Object.keys(votes).length) {
    // Distribuir votos extra proporcional o dirigido
    var total = Object.values(votes).reduce((a, v) => a + v, 0) || 1;
    if (movDir && Object.keys(movDir).length) {
      var dirTotal = Object.values(movDir).reduce((a, v) => a + v, 0) || 1;
      for (var [p, pct] of Object.entries(movDir)) {
        votes[p] = (votes[p] || 0) + Math.round(extraVotos * (pct / dirTotal));
      }
    } else {
      for (var p of Object.keys(votes)) {
        votes[p] += Math.round(extraVotos * (votes[p] / total));
      }
    }
  }

  // 3. pp
  votes = applyDeltas(votes, deltasPP, nuevoEmitidos);

  // 4. Alianzas
  votes = applyAlianzas(votes, alianzas);

  // 5. Arrastre presidencial
  if (arrastre && presResult && arrastreLider) {
    votes = applyArrastre(votes, presResult, arrastreLider, arrastreK);
  }

  // 6. Resultado nacional
  var emitidosSim = Math.max(nuevoEmitidos, Object.values(votes).reduce((a, v) => a + v, 0));
  var ranked = rankVotes(votes, emitidosSim);
  var part   = inscritos ? emitidosSim / inscritos : 0;

  var result = {
    nivel,
    votes,
    emitidos:  emitidosSim,
    inscritos,
    participacion: part,
    ranked,
    margenTop: ranked.length >= 2 ? ranked[0].pct - ranked[1].pct : (ranked[0] && ranked[0].pct || 0),
  };

  // 7. Legislativo D'Hondt (dip)
  if (nivel === "dip") {
    // Distribuir el swing nacional a cada circ proporcionalmente
    var simVotesByCirc = buildCircVotes(ctx, votes, nat.votes, year);
    var dipRes = simDip(ctx, simVotesByCirc);
    result.curules = dipRes;
  }

  // 8. Senadores
  if (nivel === "sen") {
    var provVotesSim = buildProvVotes(ctx, votes, nat.votes, year, "sen");
    result.senadores = simSen(provVotesSim);
  }

  // 9. Alcaldes / DM
  if (nivel === "mun" || nivel === "dm") {
    var terrVotes = buildTerrVotes(ctx, votes, nat.votes, year, nivel);
    result.ganadores = simGanadores(terrVotes);
  }

  return result;
}

//  Helpers de distribucin territorial 

/**
 * Construye votos simulados por circunscripcin/provincia para D'Hondt.
 * Aplica el swing nacional proporcionalmente a cada demarcacin.
 */
function buildCircVotes(ctx, simVotesNat, baseVotesNat, year, nivel = "dip") {
  var lv     = getLevel(ctx, year, nivel);
  var baseTot = Object.values(baseVotesNat).reduce((a, v) => a + v, 0) || 1;
  var simTot  = Object.values(simVotesNat).reduce((a, v) => a + v, 0) || 1;

  var out = {};

  // Circunscripciones (para provincias multi-circ)
  for (var [cid, circ] of Object.entries(lv.circ)) {
    out[cid] = scaleVotes(circ.votes, baseVotesNat, simVotesNat, baseTot, simTot);
  }

  // Provincias de circunscripcin nica
  for (var [pid, prov] of Object.entries(lv.prov)) {
    if (!out[pid]) { // solo si no fue cubierta por circ
      out[pid] = scaleVotes(prov.votes, baseVotesNat, simVotesNat, baseTot, simTot);
    }
  }

  return out;
}

function buildProvVotes(ctx, simVotesNat, baseVotesNat, year, nivel) {
  var lv     = getLevel(ctx, year, nivel);
  var baseTot = Object.values(baseVotesNat).reduce((a, v) => a + v, 0) || 1;
  var simTot  = Object.values(simVotesNat).reduce((a, v) => a + v, 0) || 1;
  var out = {};
  for (var [pid, prov] of Object.entries(lv.prov)) {
    out[pid] = scaleVotes(prov.votes, baseVotesNat, simVotesNat, baseTot, simTot);
  }
  return out;
}

function buildTerrVotes(ctx, simVotesNat, baseVotesNat, year, nivel) {
  var lv     = getLevel(ctx, year, nivel);
  var terr   = nivel === "dm" ? lv.dm : lv.mun;
  var baseTot = Object.values(baseVotesNat).reduce((a, v) => a + v, 0) || 1;
  var simTot  = Object.values(simVotesNat).reduce((a, v) => a + v, 0) || 1;
  var out = {};
  for (var [id, t] of Object.entries(terr)) {
    out[id] = scaleVotes(t.votes, baseVotesNat, simVotesNat, baseTot, simTot);
  }
  return out;
}

/**
 * Escala votos locales segn el swing relativo nacional.
 * Si PRM subi 5pp nacionalmente, sube 5pp en cada territorio.
 */
function scaleVotes(localVotes, baseNat, simNat, baseTot, simTot) {
  var out = {};
  var localTot = Object.values(localVotes).reduce((a, v) => a + v, 0) || 1;

  for (var [p, lv] of Object.entries(localVotes)) {
    var baseShare = baseTot > 0 ? (baseNat[p] || 0) / baseTot : 0;
    var simShare  = simTot  > 0 ? (simNat[p]  || 0) / simTot  : 0;
    var ratio     = baseShare > 0 ? simShare / baseShare : 1;
    out[p] = Math.max(0, Math.round(lv * ratio));
  }

  // Incluir partidos en sim que no estn en local (alianzas nuevas)
  for (var [p, sv] of Object.entries(simNat)) {
    if (!(p in localVotes)) {
      var simShare = simTot > 0 ? sv / simTot : 0;
      out[p] = Math.round(localTot * simShare * 0.5); // 50% del share nacional
    }
  }

  return out;
}

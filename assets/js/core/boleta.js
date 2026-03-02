/**
 * SIE 2028 — core/boleta.js  (H3)
 * Motor de optimización legislativa: boleta única opositora.
 * Simula qué sucede si partidos de oposición van en coalición
 * en cada demarcación para maximizar curules.
 */
import { dhondt }         from "./dhondt.js";
import { getLevel }       from "./data.js";
import { rankVotes }      from "./utils.js";

/**
 * Calcula el escenario de boleta única.
 * params:
 *   partidos: [{ partido, incluir: bool, transferPct: 0-100, encabeza: bool }]
 *   year: 2024
 * Devuelve:
 *   { base, boleta, ganados, perdidos, territorios }
 */
export function simBoleta(ctx, params) {
  const { partidos = [], year = 2024 } = params;
  const cur = ctx.curules;
  if (!cur?.territorial) return null;

  const lv  = getLevel(ctx, year, "dip");
  const nat = lv.nacional?.votes || {};

  // Determinar líder (partido que encabeza)
  const lider = partidos.find(p => p.encabeza && p.incluir)?.partido
    || partidos.find(p => p.incluir)?.partido;
  if (!lider) return null;

  const incluidos = partidos.filter(p => p.incluir && p.partido !== lider);

  // Función para obtener votos de una circ con y sin boleta
  function getVotes(key, c) {
    const isMulti = c.circ > 0;
    const data    = isMulti
      ? lv.circ?.[key]
      : lv.prov?.[key];
    return data?.votes || {};
  }

  function applyBoleta(votes) {
    const out = { ...votes };
    // Transferir votos de aliados al líder
    for (const { partido, transferPct } of incluidos) {
      const v     = out[partido] || 0;
      const moved = Math.round(v * (transferPct / 100));
      out[partido]  = v - moved;
      out[lider]    = (out[lider] || 0) + moved;
    }
    return out;
  }

  const baseTotal   = {};
  const boletaTotal = {};
  const territorios = [];

  for (const c of cur.territorial) {
    const pid = String(c.provincia_id).padStart(2, "0");
    const key = c.circ > 0 ? `${pid}-${c.circ}` : pid;

    const baseVotes   = getVotes(key, c);
    const boletaVotes = applyBoleta(baseVotes);
    if (!Object.keys(baseVotes).length) continue;

    const baseRes   = dhondt(baseVotes,   c.seats);
    const boletaRes = dhondt(boletaVotes, c.seats);

    for (const [p, s] of Object.entries(baseRes.byParty)) {
      baseTotal[p] = (baseTotal[p] || 0) + s;
    }
    for (const [p, s] of Object.entries(boletaRes.byParty)) {
      boletaTotal[p] = (boletaTotal[p] || 0) + s;
    }

    const liderBase   = baseRes.byParty[lider]   || 0;
    const liderBoleta = boletaRes.byParty[lider]  || 0;
    const delta       = liderBoleta - liderBase;

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

  const ganados  = territorios.filter(t => t.delta > 0);
  const perdidos = territorios.filter(t => t.delta < 0);

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

/**
 * SIE 2028 — core/objetivo.js
 * Motor de simulación inversa.
 * Dado un objetivo (% pres, # curules, # senadores, # alcaldes),
 * calcula el escenario mínimo requerido.
 */

import { simular }           from "./simulacion.js";
import { rankVotes }         from "./utils.js";

/**
 * Busca el Δpp necesario para que el partido `lider` alcance `metaPct` en `nivel`.
 * Usa búsqueda binaria sobre el Δpp del líder.
 * Devuelve { deltaPP, resultado } o { imposible: true, maximo }
 */
export function calcularDeltaParaMeta(ctx, params) {
  const { lider, metaPct, nivel = "pres", maxDelta = 30 } = params;

  let lo = -10, hi = maxDelta, best = null;

  for (let iter = 0; iter < 40; iter++) {
    const mid = (lo + hi) / 2;
    const res = simular(ctx, {
      ...params,
      nivel,
      deltasPP: { ...(params.deltasPP || {}), [lider]: mid },
    });
    const found = res.ranked.find(r => r.p === lider);
    const pct   = found ? found.pct : 0;

    if (Math.abs(pct - metaPct) < 0.0001) {
      best = { deltaPP: mid, resultado: res };
      break;
    }
    if (pct < metaPct) lo = mid;
    else              hi = mid;
    best = { deltaPP: mid, resultado: res };
  }

  const res = simular(ctx, {
    ...params,
    nivel,
    deltasPP: { ...(params.deltasPP || {}), [lider]: maxDelta },
  });
  const maxFound = res.ranked.find(r => r.p === lider);
  const maxPct   = maxFound ? maxFound.pct : 0;

  if (maxPct < metaPct) {
    return { imposible: true, maximo: maxPct, resultado: res };
  }

  return { imposible: false, ...best };
}

/**
 * Calcula votos necesarios para obtener `metaCurules` diputados.
 * Estrategia: incrementa Δpp del lider hasta alcanzar meta o máximo.
 */
export function calcularDipMeta(ctx, params) {
  const { lider, metaCurules, maxDelta = 25 } = params;
  let lo = 0, hi = maxDelta, bestDelta = 0, bestRes = null;

  for (let iter = 0; iter < 40; iter++) {
    const mid = (lo + hi) / 2;
    const res = simular(ctx, {
      ...params,
      nivel: "dip",
      deltasPP: { ...(params.deltasPP || {}), [lider]: mid },
    });
    const curules = res.curules?.totalByParty?.[lider] || 0;

    if (curules >= metaCurules) {
      hi = mid;
      bestDelta = mid;
      bestRes   = res;
    } else {
      lo = mid;
    }

    if (hi - lo < 0.01) break;
  }

  const resMax = simular(ctx, {
    ...params,
    nivel: "dip",
    deltasPP: { ...(params.deltasPP || {}), [lider]: maxDelta },
  });
  const maxCurules = resMax.curules?.totalByParty?.[lider] || 0;

  if (maxCurules < metaCurules) {
    return { imposible: true, maximo: maxCurules, resultado: resMax };
  }

  return { imposible: false, deltaPP: bestDelta, resultado: bestRes };
}

/**
 * Genera los 4 escenarios de objetivo.
 * Devuelve { conservador, razonable, optimizado, agresivo }
 */
export function generarEscenarios(ctx, params) {
  const { lider, nivel, metaValor } = params;

  const niveles = {
    conservador: metaValor * 0.90,
    razonable:   metaValor,
    optimizado:  metaValor * 1.05,
    agresivo:    metaValor * 1.12,
  };

  const calc = nivel === "dip"
    ? (meta) => calcularDipMeta(ctx, { ...params, metaCurules: Math.round(meta) })
    : (meta) => calcularDeltaParaMeta(ctx, { ...params, metaPct: meta / 100 });

  return {
    conservador: calc(niveles.conservador),
    razonable:   calc(niveles.razonable),
    optimizado:  calc(niveles.optimizado),
    agresivo:    calc(niveles.agresivo),
  };
}

/**
 * SIE 2028  core/potencial.js
 * Motor de score de potencial electoral 0100.
 *
 * Pesos (configurables):
 *   tendencia   25   cambio pp 20202024
 *   margen      20   margen top1-top2 (invertido: menor margen = ms potencial)
 *   abstencion  15   % abstencin (ms abstencin = ms potencial)
 *   padron      15   tamao relativo del padrn
 *   elasticidad 15   sensibilidad al swing nacional
 *   estabilidad 10   inverso de desviacin histrica
 */

import { rankVotes } from "./utils.js";

const DEFAULT_WEIGHTS = {
  tendencia:   25,
  margen:      20,
  abstencion:  15,
  padron:      15,
  elasticidad: 15,
  estabilidad: 10,
};

const CATEGORIAS = [
  { min: 75, label: "Fortaleza",    cls: "cat-green"  },
  { min: 60, label: "Oportunidad",  cls: "cat-blue"   },
  { min: 50, label: "Disputa",      cls: "cat-yellow" },
  { min: 40, label: "Crecimiento",  cls: "cat-orange" },
  { min: 25, label: "Adverso",      cls: "cat-red"    },
  { min:  0, label: "Baja prioridad", cls: "cat-gray" },
];

export function getCategoria(score) {
  return CATEGORIAS.find(c => score >= c.min) || CATEGORIAS[CATEGORIAS.length - 1];
}

/**
 * Calcula score para un territorio dado datos de 2024 y 2020.
 */
function scoreTerritory({ t24, t20, lider, maxPadron, weights = DEFAULT_WEIGHTS }) {
  const ins24  = t24.inscritos || 0;
  const em24   = t24.emitidos  || 0;
  const ins20  = t20?.inscritos || 0;
  const em20   = t20?.emitidos  || 0;
  const votes24 = t24.votes   || {};
  const votes20 = t20?.votes  || {};

  // Abstencin 2024
  const abst24 = ins24 > 0 ? 1 - (em24 / ins24) : 0;

  // Tendencia lider: pp24 - pp20
  const ranked24 = rankVotes(votes24, em24 || 1);
  const ranked20 = rankVotes(votes20, em20 || 1);
  const pct24    = ranked24.find(r => r.p === lider)?.pct || 0;
  const pct20    = ranked20.find(r => r.p === lider)?.pct || 0;
  const tend     = ins20 > 0 ? pct24 - pct20 : 0; // positivo = sube

  // Margen: inverso del margen top1-top2 (margen pequeo = zona disputada = ms potencial para ganar)
  const margen = ranked24.length >= 2 ? ranked24[0].pct - ranked24[1].pct : 1;
  const margenScore = Math.max(0, 1 - Math.min(margen * 5, 1)); // margen 0 -> score 1, margen 0.2 -> score 0

  // Padrn relativo
  const padronScore = maxPadron > 0 ? ins24 / maxPadron : 0;

  // Elasticidad: cunto vari el partido lider entre 2020 y 2024 relativo a la media
  const elasticidad = Math.abs(tend) * 2; // normalizado 0-1 aprox

  // Estabilidad: inverso de variacin (alta variacin = baja estabilidad pero alta elasticidad)
  const estabilidad = 1 - Math.min(Math.abs(tend) * 3, 1);

  // Abstencin normalizada (00.6  01)
  const abstScore = Math.min(abst24 / 0.6, 1);

  // Tendencia normalizada: tend positivo (gana)  score alto
  const tendScore = clampN(0.5 + tend * 3, 0, 1);

  const raw =
    tendScore    * weights.tendencia  +
    margenScore  * weights.margen     +
    abstScore    * weights.abstencion +
    padronScore  * weights.padron     +
    Math.min(elasticidad, 1) * weights.elasticidad +
    estabilidad  * weights.estabilidad;

  const maxRaw = Object.values(weights).reduce((a, v) => a + v, 0);
  const score  = Math.round((raw / maxRaw) * 100);

  return {
    score:       clampN(score, 0, 100),
    tendencia:   tend,
    abst:        abst24,
    margen,
    padron:      ins24,
    pct24,
    pct20:       ins20 > 0 ? pct20 : null,
    categoria:   getCategoria(clampN(score, 0, 100)),
  };
}

function clampN(x, a, b) { return Math.max(a, Math.min(b, x)); }

/**
 * Genera ranking completo de territorios para un nivel.
 * lider: partido de referencia (para calcular tendencia/margen)
 * nivel: pres|sen|dip|mun|dm
 */
export function calcPotencial(ctx, nivel, lider, weights) {
  const lv24   = ctx.r[2024]?.[nivel] || {};
  const lv20   = ctx.r[2020]?.[nivel] || {};
  const terr24 = nivel === "mun" ? lv24.mun : nivel === "dm" ? lv24.dm : lv24.prov;
  const terr20 = nivel === "mun" ? lv20.mun : nivel === "dm" ? lv20.dm : lv20.prov;

  if (!terr24) return [];

  const maxPadron = Math.max(...Object.values(terr24).map(t => t.inscritos || 0), 1);

  return Object.entries(terr24)
    .map(([id, t24]) => {
      const s = scoreTerritory({
        t24,
        t20: terr20?.[id] || null,
        lider,
        maxPadron,
        weights: weights || DEFAULT_WEIGHTS,
      });
      return { id, nombre: t24.nombre || id, ...s };
    })
    .sort((a, b) => b.score - a.score);
}

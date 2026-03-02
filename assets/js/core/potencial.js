/**
 * SIE 2028 -- core/potencial.js  (H4)
 * Score 0-100 por territorio.
 * FIXES H4:
 *   - Formula corregida: round(raw/maxRaw*100) no round(raw/100)
 *   - Margen DIRECTO: alto margen del lider = alta fortaleza
 *   - Inscritos pres usa sen como proxy (pres.prov no tiene INSCRITOS)
 *   - Dropdown de partido dinamico en UI
 */
import { rankVotes } from "./utils.js";

// H5: margen aumentado (indicador mas directo de posicion actual)
//     abstencion aumentado (potencial de movilizacion)
//     tendencia reducido (2020 es outlier para partidos nuevos como FP)
//     estabilidad eliminado (penaliza territorios recuperables)
export var WEIGHTS_DEFAULT = {
  tendencia:   20,
  margen:      30,
  abstencion:  20,
  padron:      15,
  elasticidad: 15,
  estabilidad: 0,
};

export var CATEGORIAS = [
  { min: 70, label: "Fortaleza",      cls: "cat-green"  },
  { min: 55, label: "Oportunidad",    cls: "cat-lgreen" },
  { min: 45, label: "Disputa",        cls: "cat-yellow" },
  { min: 35, label: "Crecimiento",    cls: "cat-blue"   },
  { min: 20, label: "Adverso",        cls: "cat-red"    },
  { min:  0, label: "Baja prioridad", cls: "cat-gray"   },
];

export function getCategoria(score) {
  for (var i = 0; i < CATEGORIAS.length; i++) {
    if (score >= CATEGORIAS[i].min) return CATEGORIAS[i];
  }
  return CATEGORIAS[CATEGORIAS.length - 1];
}

function clampN(x, a, b) { return Math.max(a, Math.min(b, x)); }

function scoreOne(t24, t20, lider, maxPadron, weights) {
  var ins24  = t24.inscritos || 0;
  var em24   = t24.emitidos  || 0;
  var votes24 = t24.votes    || {};
  var votes20 = t20 ? (t20.votes    || {}) : {};
  var em20    = t20 ? (t20.emitidos || 0)  : 0;
  var ins20   = t20 ? (t20.inscritos|| 0)  : 0;

  var ranked24 = rankVotes(votes24, em24 || 1);
  var ranked20 = rankVotes(votes20, em20 || 1);
  var e24  = ranked24.filter(function(r) { return r.p === lider; })[0];
  var e20  = ranked20.filter(function(r) { return r.p === lider; })[0];
  var pct24 = e24 ? e24.pct : 0;
  var pct20 = (e20 && ins20 > 0) ? e20.pct : null;

  var tend = (pct20 !== null) ? pct24 - pct20 : 0;

  // Margen directo del lider (positivo si gana, negativo si pierde)
  var margen = 0;
  if (ranked24.length >= 2) {
    var lEntry = ranked24.filter(function(r){ return r.p === lider; })[0];
    var top1   = ranked24[0];
    if (lEntry) {
      var opponentPct = (lider === top1.p) ? ranked24[1].pct : top1.pct;
      margen = lEntry.pct - opponentPct;
    } else {
      margen = -top1.pct;
    }
  } else if (ranked24.length === 1) {
    margen = ranked24[0].p === lider ? 1 : -1;
  }

  var abst24 = ins24 > 0 ? 1 - em24 / ins24 : 0;

  // Factor scores (0-1)
  var tendScore   = clampN(0.5 + tend * 3,      0, 1);
  var margenScore = clampN(0.5 + margen * 2,    0, 1); // directo
  var abstScore   = clampN(abst24 / 0.6,        0, 1);
  var padronScore = maxPadron > 0 ? ins24 / maxPadron : 0;
  var elastScore  = clampN(Math.abs(tend) * 2,  0, 1);
  var establScore = clampN(1 - Math.abs(tend)*3,0, 1);

  var w      = weights || WEIGHTS_DEFAULT;
  var maxRaw = w.tendencia + w.margen + w.abstencion + w.padron + w.elasticidad + w.estabilidad;
  var raw = tendScore  * w.tendencia   +
            margenScore* w.margen      +
            abstScore  * w.abstencion  +
            padronScore* w.padron      +
            elastScore * w.elasticidad +
            establScore* w.estabilidad;

  var score = Math.round((raw / maxRaw) * 100);
  score = clampN(score, 0, 100);

  // Segundo partido para comparacion
  var segundo = ranked24[0] && ranked24[0].p === lider
    ? (ranked24[1] ? ranked24[1] : null)
    : (ranked24[0] ? ranked24[0] : null);

  return {
    score:     score,
    tendencia: tend,
    abst:      abst24,
    margen:    margen,
    padron:    ins24,
    pct24:     pct24,
    pct20:     pct20,
    segundo:   segundo ? segundo.p   : null,
    pctSegundo: segundo ? segundo.pct : 0,
    categoria: getCategoria(score),
  };
}

export function calcPotencial(ctx, nivel, lider, weights) {
  var lv24 = (ctx.r[2024] && ctx.r[2024][nivel]) ? ctx.r[2024][nivel] : {};
  var lv20 = (ctx.r[2020] && ctx.r[2020][nivel]) ? ctx.r[2020][nivel] : {};

  var terr24, terr20;
  if (nivel === "mun") {
    terr24 = lv24.mun || {};
    terr20 = lv20.mun || {};
  } else if (nivel === "dm") {
    terr24 = lv24.dm  || {};
    terr20 = lv20.dm  || {};
  } else {
    terr24 = lv24.prov || {};
    terr20 = lv20.prov || {};
    // pres.prov no tiene inscritos -- usar sen como proxy de padron
    if (nivel === "pres") {
      var sen24prov = (ctx.r[2024] && ctx.r[2024].sen) ? (ctx.r[2024].sen.prov || {}) : {};
      var enriched  = {};
      Object.keys(terr24).forEach(function(id) {
        var t = Object.assign({}, terr24[id]);
        if (!t.inscritos && sen24prov[id]) t.inscritos = sen24prov[id].inscritos;
        enriched[id] = t;
      });
      terr24 = enriched;
    }
  }

  if (!Object.keys(terr24).length) return [];

  var maxPadron = Math.max.apply(null,
    Object.values(terr24).map(function(t){ return t.inscritos || 0; }).concat([1])
  );

  return Object.keys(terr24).map(function(id) {
    var t24 = terr24[id];
    var t20 = terr20 ? terr20[id] : null;
    var s   = scoreOne(t24, t20, lider, maxPadron, weights);
    return Object.assign({ id: id, nombre: t24.nombre || id }, s);
  }).sort(function(a, b) { return b.score - a.score; });
}

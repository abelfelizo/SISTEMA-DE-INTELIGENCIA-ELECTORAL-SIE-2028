/**
 * SIE 2028  core/utils.js
 */

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sum   = arr => arr.reduce((a, v) => a + v, 0);

export function fmtInt(n) {
  return (Math.round(Number(n) || 0)).toLocaleString("en-US");
}

export function fmtPct(x, decimals = 1) {
  return (Number(x) * 100).toFixed(decimals) + "%";
}

/** Ordena {partido:votos} y devuelve array [{p, v, pct}] */
export function rankVotes(votes, emitidos) {
  const total = emitidos || Object.values(votes).reduce((a, v) => a + v, 0) || 1;
  return Object.entries(votes)
    .filter(([, v]) => v > 0)
    .map(([p, v]) => ({ p, v, pct: v / total }))
    .sort((a, b) => b.v - a.v);
}

/** Top N partidos */
export function topN(votes, n = 5, emitidos) {
  return rankVotes(votes, emitidos).slice(0, n);
}

/** deepCopy seguro */
export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

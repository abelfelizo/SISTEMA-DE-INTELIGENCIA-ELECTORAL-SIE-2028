/**
 * SIE 2028  core/state.js
 * Estado global nico. recomputeAndRender() se inyecta desde app.js al boot.
 *
 * Niveles: pres | sen | dip | mun | dm
 * Cortes:  mayo2024 | feb2024 | proy2028
 */

const LS = {
  nivel:  "sie28-nivel",
  corte:  "sie28-corte",
};

function lsGet(key, def) {
  try { const v = localStorage.getItem(key); return v != null ? v : def; }
  catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, String(val)); } catch {}
}

export const state = {
  nivel:  lsGet(LS.nivel, "dip"),   // nivel activo global
  corte:  lsGet(LS.corte, "mayo2024"), // corte activo global

  setNivel(n) { this.nivel = n; lsSet(LS.nivel, n); },
  setCorte(c) { this.corte = c; lsSet(LS.corte, c); },

  /** Inyectado por app.js en boot */
  recomputeAndRender() {},
};

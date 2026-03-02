/**
 * SIE 2028 -- core/state.js  (H4)
 */

var _LS = { nivel: "sie28-nivel", corte: "sie28-corte" };

function _lsGet(key, def) {
  try { var v = localStorage.getItem(key); return v != null ? v : def; } catch(e) { return def; }
}
function _lsSet(key, val) {
  try { localStorage.setItem(key, String(val)); } catch(e) {}
}

export var state = {
  nivel: _lsGet(_LS.nivel, "dip"),
  corte: _lsGet(_LS.corte, "mayo2024"),

  setNivel: function(n) { this.nivel = n; _lsSet(_LS.nivel, n); },
  setCorte: function(c) { this.corte = c; _lsSet(_LS.corte, c); },
  recomputeAndRender: function() {},
};

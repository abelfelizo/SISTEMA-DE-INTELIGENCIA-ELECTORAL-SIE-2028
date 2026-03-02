/**
 * SIE 2028  core/data.js
 * Contrato de datos (congelado H1):
 *   data/results_2024.json   pres/sen/dip/mun/dm
 *   data/results_2020.json   misma estructura
 *   data/padron.json         mayo2024.nacional.inscritos, feb2024.nacional.inscritos
 *   data/padron_2024_meta.json
 *   data/curules_2024.json
 *   data/geography.json
 *   data/polls.json          array de encuestas
 *
 * Esquemas raw:
 *   pres.nacional           flat {EMITIDOS,VALIDOS,NULOS,...partidos}
 *   pres.provincias[id]     {nombre, data:{EMITIDOS,...}}
 *   sen/dip/mun/dm niveles  {nombre, meta:{inscritos,emitidos,validos,nulos}, votes:{...}}
 *   2020 igual que 2024 salvo pres.nacional usa tot_inscritos en vez de INSCRITOS
 *
 * Salida normalizada para todos los niveles y aos:
 *   ctx.r[year][nivel] = {
 *     nacional: { inscritos, emitidos, validos, nulos, votes:{partido:n} },
 *     prov:     { [provId]: { nombre, inscritos, emitidos, validos, nulos, votes } },
 *     mun:      { [munId]:  { nombre, inscritos, emitidos, validos, nulos, votes } },
 *     dm:       { [dmId]:   { nombre, inscritos, emitidos, validos, nulos, votes } },
 *     circ:     { [circId]: { nombre, inscritos, emitidos, validos, nulos, votes } }, // dip only
 *     extDip:   { [cId]:    { nombre, inscritos, emitidos, validos, nulos, votes } }, // dip only
 *   }
 *   ctx.padron  = padron.json raw
 *   ctx.meta    = padron_2024_meta.json raw
 *   ctx.curules = curules_2024.json raw
 *   ctx.geo     = geography.json raw
 *   ctx.polls   = polls.json raw (array)
 *
 * Provincias interiores: cdigos "01""32"
 * Exterior pres: "33" (penitenciario), "61""72" (pases)  se separan en prov.special
 */

//  Constantes 
const DATA = {
  r2024:   "./data/results_2024.json",
  r2020:   "./data/results_2020.json",
  padron:  "./data/padron.json",
  meta:    "./data/padron_2024_meta.json",
  curules: "./data/curules_2024.json",
  geo:     "./data/geography.json",
  polls:   "./data/polls.json",
  partidos: "./data/partidos.json",
};

const INTERIOR_MAX_PROV = 32; // codigos 01-32 son interior

//  Fetch helper 
async function fetchJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status + ": " + url);
    return await r.json();
  } catch (e) {
    console.error("[SIE data] Error cargando", url, e.message);
    return null;
  }
}

//  Normalizadores atmicos 

/** Extrae {inscritos, emitidos, validos, nulos, votes} de cualquier formato raw */
function normUnit(raw) {
  if (!raw || typeof raw !== "object") return empty();

  // Formato A: pres provincial {nombre, data:{EMITIDOS,...}}
  if (raw.data) {
    const d = raw.data;
    return {
      inscritos: intOrNull(d.INSCRITOS || d.inscritos),
      emitidos:  int(d.EMITIDOS  || d.emitidos),
      validos:   int(d.VALIDOS   || d.validos),
      nulos:     int(d.NULOS     || d.nulos),
      votes:     extractVotes(d, ["INSCRITOS","EMITIDOS","VALIDOS","NULOS"]),
    };
  }

  // Formato B: {meta:{...}, votes:{...}}
  if (raw.meta && raw.votes) {
    const m = raw.meta;
    return {
      inscritos: intOrNull(m.inscritos),
      emitidos:  int(m.emitidos),
      validos:   int(m.validos),
      nulos:     int(m.nulos),
      votes:     extractVotes(raw.votes, []),
    };
  }

  // Formato C: plano {EMITIDOS,...}  pres nacional 2024 / 2020
  if ("EMITIDOS" in raw || "emitidos" in raw || "tot_inscritos" in raw) {
    return {
      inscritos: intOrNull(raw.INSCRITOS || raw.inscritos || raw.tot_inscritos),
      emitidos:  int(raw.EMITIDOS  || raw.emitidos),
      validos:   int(raw.VALIDOS   || raw.validos),
      nulos:     int(raw.NULOS     || raw.nulos),
      votes:     extractVotes(raw, ["INSCRITOS","EMITIDOS","VALIDOS","NULOS",
                                    "tot_inscritos","inscritos","emitidos","validos","nulos"]),
    };
  }

  return empty();
}

function empty() {
  return { inscritos: null, emitidos: 0, validos: 0, nulos: 0, votes: {} };
}

function int(v)       { return Math.round(Number(v) || 0); }
function intOrNull(v) { return v != null ? int(v) : null; }

function extractVotes(obj, skip) {
  const out = {};
  const skipSet = new Set(skip.map(k => k.toUpperCase()));
  for (const [k, v] of Object.entries(obj)) {
    if (!skipSet.has(k.toUpperCase())) out[k] = int(v);
  }
  return out;
}

//  Normalizador de nivel completo 

function normLevel(raw, nivel) {
  const out = { nacional: empty(), prov: {}, mun: {}, dm: {}, circ: {}, extDip: {} };
  if (!raw) return out;

  // Nacional
  out.nacional = normUnit(raw.nacional);

  // Provincias (pres + sen + dip)
  for (const [id, obj] of Object.entries(raw.provincias || {})) {
    const n = int(id);
    const unit = normUnit(obj);
    unit.nombre = (obj && obj.nombre) || id;
    if (n >= 1 && n <= INTERIOR_MAX_PROV) {
      out.prov[id.padStart(2, "0")] = unit;
    }
    // exterior/penitenciario: ignorado en prov (no aparece en mapa)
  }

  // Municipios
  for (const [id, obj] of Object.entries(raw.municipios || {})) {
    const unit = normUnit(obj);
    unit.nombre = (obj && obj.nombre) || id;
    out.mun[id] = unit;
  }

  // DM  keys pueden ser "0028-141" (correcto) o "0.0" (bug legacy ignorado aqu)
  for (const [id, obj] of Object.entries(raw.dm || {})) {
    if (!/^\d{4}-\d{3}$/.test(id)) continue; // ignora float-keys
    const unit = normUnit(obj);
    unit.nombre = (obj && obj.nombre) || id;
    out.dm[id] = unit;
  }

  // Circunscripciones (dip)
  for (const [id, obj] of Object.entries(raw.circunscripciones || {})) {
    const unit = normUnit(obj);
    unit.nombre = (obj && obj.nombre) || id;
    out.circ[id] = unit;
  }

  // Exterior diputados (C1, C2, C3)
  for (const [id, obj] of Object.entries(raw.exterior || {})) {
    const unit = normUnit(obj);
    unit.nombre = (obj && obj.nombre) || id;
    out.extDip[id] = unit;
  }

  return out;
}

function normYear(raw) {
  if (!raw) return {};
  return {
    pres: normLevel(raw.pres, "pres"),
    sen:  normLevel(raw.sen,  "sen"),
    dip:  normLevel(raw.dip,  "dip"),
    mun:  normLevel(raw.mun,  "mun"),
    dm:   normLevel(raw.dm,   "dm"),
  };
}

//  Cache 
let _ctx = null;

export async function loadCTX() {
  if (_ctx) return _ctx;

  const [r2024, r2020, padron, meta, curules, geo, polls, partidos] = await Promise.all([
    fetchJSON(DATA.r2024),
    fetchJSON(DATA.r2020),
    fetchJSON(DATA.padron),
    fetchJSON(DATA.meta),
    fetchJSON(DATA.curules),
    fetchJSON(DATA.geo),
    fetchJSON(DATA.polls),
    fetchJSON(DATA.partidos),
  ]);

  _ctx = {
    r: {
      2024: normYear(r2024),
      2020: normYear(r2020),
    },
    padron:  padron  || {},
    meta:    meta    || {},
    curules: curules || {},
    geo:     geo     || {},
    polls:   Array.isArray(polls) ? polls : [],
    partidos: Array.isArray(partidos) ? partidos : (partidos && partidos.partidos ? partidos.partidos : []),
  };

  return _ctx;
}

/** Devuelve el nivel normalizado para un ao y nivel dados */
export function getLevel(ctx, year, nivel) {
  return (ctx && ctx.r && ctx.r[year] && ctx.r[year][nivel]) || { nacional: empty(), prov: {}, mun: {}, dm: {}, circ: {}, extDip: {} };
}

/** Inscritos nacionales segn corte */
export function getInscritos(ctx, corte) {
  const key = corte === "feb2024" ? "feb2024" : "mayo2024";
  return int((ctx && ctx.padron && ctx.padron[key] && ctx.padron[key].nacional && ctx.padron[key].nacional.inscritos)) || 0;
}

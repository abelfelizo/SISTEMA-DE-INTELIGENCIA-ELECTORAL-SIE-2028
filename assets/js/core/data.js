import {safeJsonParse} from "./utils.js";

const PATHS = {
  results2024: "./data/results_2024.json",
  results2020: "./data/results_2020.json",
  padron:      "./data/padron.json",
  geography:   "./data/geography.json",
  curules2024: "./data/curules_2024.json",
  polls:       "./data/polls.json",
  padronMeta:  "./data/padron_2024_meta.json"
};

async function loadJson(path){
  const res = await fetch(path, {cache:"no-store"});
  if(!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  const text = await res.text();
  const p = safeJsonParse(text);
  if(!p.ok) throw new Error(`${path} inválido: ${p.error.message}`);
  return p.value;
}

// simple cache
const CACHE = {};
async function cached(key, loader){
  if(CACHE[key]) return CACHE[key];
  const v = await loader();
  CACHE[key] = v;
  return v;
}

export async function loadResults2024(){ return cached("r2024", ()=>loadJson(PATHS.results2024)); }
export async function loadResults2020(){ return cached("r2020", ()=>loadJson(PATHS.results2020)); }
export async function loadPadron(){      return cached("padron", ()=>loadJson(PATHS.padron)); }
export async function loadGeography(){   return cached("geo", ()=>loadJson(PATHS.geography)); }

export async function loadCurules2024(){ return cached("curules", ()=>loadJson(PATHS.curules2024)); }
export async function loadPolls(){       return cached("polls", ()=>loadJson(PATHS.polls)); }
export async function loadPadron2024Meta(){ return cached("padMeta", ()=>loadJson(PATHS.padronMeta)); }

// --- Compatibility loaders (no duplicated files) ---
export async function loadDiputados2024(){
  const r = await loadResults2024();
  // We embedded the legacy diputados object under r.dip
  return r.dip;
}

export async function loadPres2024VotosProv(){
  const r = await loadResults2024();
  const provs = r?.pres?.provincias || {};
  // Build legacy structure expected by UI: {meta, party_cols, rows}
  // party columns from first province "data"
  const first = Object.values(provs)[0];
  const dataKeys = first?.data ? Object.keys(first.data) : [];
  const party_cols = dataKeys.filter(k => !["EMITIDOS","VALIDOS","NULOS"].includes(k));
  const rows = Object.entries(provs).map(([provincia_id, obj])=>{
    const d = obj.data || {};
    const row = {
      provincia_id,
      provincia: obj.nombre || "",
      emitidos: d.EMITIDOS ?? 0,
      validos:  d.VALIDOS ?? 0,
      nulos:    d.NULOS ?? 0
    };
    party_cols.forEach(p=> row[p] = d[p] ?? 0);
    return row;
  });
  return {
    meta: {level:"pres", year:2024, source:"results_2024.json"},
    party_cols,
    rows
  };
}

export async function loadPadron2024Provincial(){
  const p = await loadPadron();
  const r = await loadResults2024();
  const provs = p?.mayo2024?.provincias || {};
  const presProvs = r?.pres?.provincias || {};
  const rows = Object.entries(provs).map(([provincia_id, obj])=>{
    const inscritos = obj.inscritos ?? 0;
    const emitidos = presProvs?.[provincia_id]?.data?.EMITIDOS ?? 0;
    const participacion = inscritos ? (emitidos/inscritos) : 0;
    return {
      provincia_id,
      provincia: obj.nombre || "",
      inscritos,
      emitidos_pres: emitidos,
      participacion_pres: participacion,
      abstencion_pres: 1 - participacion
    };
  });
  const tot_ins = rows.reduce((a,r)=>a+(r.inscritos||0),0);
  const tot_em = rows.reduce((a,r)=>a+(r.emitidos_pres||0),0);
  return {
    meta:{level:"padron", year:2024, corte:"mayo2024", source:"padron.json + results_2024.json"},
    rows,
    totales:{
      inscritos: tot_ins,
      emitidos_pres: tot_em,
      participacion_pres: tot_ins ? tot_em/tot_ins : 0,
      abstencion_pres: tot_ins ? 1-(tot_em/tot_ins) : 0
    }
  };
}

export async function loadPadron2024Exterior(){
  const p = await loadPadron();
  // Keep legacy padron exterior structure as-is (from old file embedded into padron.json)
  return p?.mayo2024?.exterior || {meta:{}, rows:[], totales:{}};
}

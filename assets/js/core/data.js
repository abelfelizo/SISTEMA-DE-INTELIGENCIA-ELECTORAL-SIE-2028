
// === SIE 2028 Unified Data Paths (auto-generated) ===
const UNIFIED_RESULTS_2024_PATH = 'data/results_2024.json';
const UNIFIED_PADRON_2024_PATH  = 'data/padron_2024_unificado.json';

async function safeFetchJSON(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    console.warn('[DATA] Failed to load', path, e);
    return null;
  }
}
// === /Unified Data Paths ===


import {safeJsonParse} from "./utils.js";

async function loadJson(url){
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  const text = await res.text();
  const p = safeJsonParse(text);
  if(!p.ok) throw new Error(`${url} inválido: ${p.error.message}`);
  return p.value;
}

// === Unified loaders (prefer /data, fallback to legacy) ===
async function loadResults2024Unified(){
  const p1 = new URL("../../../data/results_2024.json", import.meta.url);
  let u = await loadJson(p1).catch(()=>null);
  if(u) return u;
  const p2 = new URL("../../../data/templates/data/results_2024.json", import.meta.url);
  return await loadJson(p2);
}

async function loadPadron2024Unified(){
  const p1 = new URL("../../../data/padron_2024_unificado.json", import.meta.url);
  let u = await loadJson(p1).catch(()=>null);
  if(u) return u;
  const p2 = new URL("../../../data/templates/data/padron_2024.json", import.meta.url);
  return await loadJson(p2);
}
// === /Unified loaders ===


export async function loadDiputados2024(){
  // Prefer legacy file for maximum compatibility; fallback to unified container if present.
  const legacy = await loadJson(new URL("../../../data/diputados_2024_votos.json", import.meta.url)).catch(()=>null);
  if(legacy && legacy.meta && legacy.districts) return legacy;

  const u = await loadResults2024Unified().catch(()=>null);
  const dip = (u && u.dip) ? u.dip : null;

  if(dip && dip.meta && dip.districts) return dip;

  // Last resort: throw with clear message
  throw new Error("Diputados 2024: datos no disponibles o estructura inválida (faltan meta/districts).");
}

export async function loadCurules2024(){
  return await loadJson(new URL("../../../data/curules_2024.json", import.meta.url));
}


export async function loadPadron2024Provincial(){
  // Prefer legacy file; fallback to unified.
  const legacy = await loadJson(new URL("../../../data/padron_2024_provincial.json", import.meta.url)).catch(()=>null);
  if(legacy) return legacy;

  const u = await loadPadron2024Unified().catch(()=>null);
  if(u && u.mayo2024 && u.mayo2024.provincial) return u.mayo2024.provincial;

  throw new Error("Padrón 2024 provincial: datos no disponibles.");
}

export async function loadPadron2024Exterior(){
  // Prefer legacy file; fallback to unified.
  const legacy = await loadJson(new URL("../../../data/padron_2024_exterior.json", import.meta.url)).catch(()=>null);
  if(legacy) return legacy;

  const u = await loadPadron2024Unified().catch(()=>null);
  if(u && u.mayo2024 && u.mayo2024.exterior) return u.mayo2024.exterior;

  throw new Error("Padrón 2024 exterior: datos no disponibles.");
}

export async function loadPadron2024Meta(){
  return await loadJson(new URL("../../../data/padron_2024_meta.json", import.meta.url));
}

export async function loadPres2024VotosProv(){
  // Prefer legacy file for compatibility; fallback to unified container.
  const legacy = await loadJson(new URL("../../../data/pres_2024_votos_prov.json", import.meta.url)).catch(()=>null);
  if(legacy) return legacy;

  const u = await loadResults2024Unified().catch(()=>null);
  const pres = (u && u.pres) ? u.pres : null;
  if(pres) return pres;

  throw new Error("Presidencial 2024: datos no disponibles.");
}


// === Unified compatibility layer ===
function unwrapUnifiedResults(maybeUnified, key) {
  if (!maybeUnified || typeof maybeUnified !== 'object') return maybeUnified;
  // If it looks like unified container with keys pres/dip/sen/dm...
  if ('pres' in maybeUnified || 'dip' in maybeUnified || 'sen' in maybeUnified || 'dm' in maybeUnified) {
    return maybeUnified[key] ?? null;
  }
  return maybeUnified;
}
function unwrapUnifiedPadron(maybeUnified, key) {
  if (!maybeUnified || typeof maybeUnified !== 'object') return maybeUnified;
  if ('mayo2024' in maybeUnified || 'feb2024' in maybeUnified) {
    return maybeUnified[key] ?? null;
  }
  return maybeUnified;
}
// === /Unified compatibility layer ===


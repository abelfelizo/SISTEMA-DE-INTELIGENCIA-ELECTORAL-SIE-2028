
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

export async function loadDiputados2024(){
  return await loadJson(new URL("../../../data/templates/data/results_2024.json", import.meta.url));
}

export async function loadCurules2024(){
  return await loadJson(new URL("../../../data/curules_2024.json", import.meta.url));
}


export async function loadPadron2024Provincial(){
  return await loadJson(new URL("../../../data/templates/data/padron_2024.json", import.meta.url));
}

export async function loadPadron2024Exterior(){
  return await loadJson(new URL("../../../data/templates/data/padron_2024.json", import.meta.url));
}

export async function loadPadron2024Meta(){
  return await loadJson(new URL("../../../data/padron_2024_meta.json", import.meta.url));
}

export async function loadPres2024VotosProv(){
  return await loadJson(new URL("../../../data/templates/data/results_2024.json", import.meta.url));
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



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


import {sum} from "./utils.js";

/**
 * Distribución de escaños territoriales por provincia replicando la lógica 2024:
 * - piso mínimo (default 2)
 * - el resto se reparte proporcional al padrón (Hamilton / mayores residuos)
 */
export function allocateTerritorialSeats({padronByProv, totalTerritorial, minPerProv=2}){
  const provs = Object.keys(padronByProv);
  const baseTotal = provs.length * minPerProv;
  if(baseTotal > totalTerritorial){
    throw new Error("El piso mínimo excede el total territorial.");
  }
  const remaining = totalTerritorial - baseTotal;
  const padTotal = sum(provs.map(k=>padronByProv[k]));
  const quotas = provs.map(k=>({k, quota: remaining * (padronByProv[k]/padTotal)}));
  const floors = quotas.map(q=>({k:q.k, n: Math.floor(q.quota), r: q.quota - Math.floor(q.quota)}));
  let assigned = sum(floors.map(x=>x.n));
  let left = remaining - assigned;
  floors.sort((a,b)=>b.r-a.r);
  for(let i=0; i<left; i++){
    floors[i].n += 1;
  }
  const out = {};
  for(const f of floors){
    out[f.k] = minPerProv + f.n;
  }
  return out; // {provKey: seats}
}

/**
 * Distribuye escaños de provincia entre circ según pesos 2024, con Hamilton.
 * weights: {circ: weight} típicamente escaños 2024 por circ.
 */
export function allocateCircSeats({provTotalSeats, weightsByCirc}){
  const circs = Object.keys(weightsByCirc);
  const wTotal = sum(circs.map(c=>weightsByCirc[c]));
  const quotas = circs.map(c=>({c, quota: provTotalSeats*(weightsByCirc[c]/wTotal)}));
  const floors = quotas.map(q=>({c:q.c, n: Math.floor(q.quota), r: q.quota - Math.floor(q.quota)}));
  let assigned = sum(floors.map(x=>x.n));
  let left = provTotalSeats - assigned;
  floors.sort((a,b)=>b.r-a.r);
  for(let i=0; i<left; i++){
    floors[i].n += 1;
  }
  const out = {};
  for(const f of floors) out[f.c] = f.n;
  return out;
}

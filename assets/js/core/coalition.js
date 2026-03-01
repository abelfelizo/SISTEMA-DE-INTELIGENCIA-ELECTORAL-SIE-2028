
import {deepCopy, sum} from "./utils.js";

/**
 * Apply alliance transfers for a single district votes dict.
 * rules: {lead, allies:[siglas], transfer:{default:{toLead, abst}}, byProv:{[provId]:{toLead,abst}}, byLevel:{...}}
 * For now (v1): only toLead + abst. Remaining stays with ally (compite solo).
 */
export function applyAlliance(votes, {lead, allies, toLead=0, abst=0}){
  const out = deepCopy(votes);
  for(const a of allies){
    const v = out[a] || 0;
    if(v<=0) continue;
    const moved = Math.round(v * (toLead/100));
    const lost  = Math.round(v * (abst/100));
    out[a] = Math.max(0, v - moved - lost);
    out[lead] = (out[lead]||0) + moved;
    // lost disappears
  }
  return out;
}

/** Merge votes into lead list (boleta única total). */
export function mergeCoalition(votes, {lead, allies}){
  const out = deepCopy(votes);
  let merged = 0;
  for(const a of allies){
    merged += out[a] || 0;
    delete out[a];
  }
  out[lead] = (out[lead]||0) + merged;
  return out;
}

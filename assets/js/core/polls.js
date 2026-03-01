
import {safeJsonParse} from "./utils.js";

export async function loadPolls(url="./data/polls.json"){
  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error("No se pudo cargar polls.json ("+res.status+")");
    const text = await res.text();
    const parsed = safeJsonParse(text);
    if(!parsed.ok) throw new Error("polls.json inválido: " + parsed.error.message);
    const polls = parsed.value;
    if(!Array.isArray(polls)) throw new Error("polls.json debe ser un arreglo [] de encuestas.");
    // Basic normalization
    for(const p of polls){
      if(!p.fecha || !p.encuestadora || !p.nivel || !p.resultados) throw new Error("Encuesta incompleta. Se requieren: fecha, encuestadora, nivel, resultados.");
    }
    return {ok:true, polls};
  }catch(err){
    return {ok:false, error: err.message};
  }
}

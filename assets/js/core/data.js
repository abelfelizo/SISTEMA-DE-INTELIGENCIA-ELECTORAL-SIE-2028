
// ===== BLINDAJE CORE STAGE 1 =====

let CTX_CACHE = null;

async function fetchJSON(path){
  try{
    const r = await fetch(path);
    if(!r.ok) return {};
    return await r.json();
  }catch(e){
    return {};
  }
}

function buildMetaVotes(obj){
  if(!obj) return { meta:{}, votes:{} };

  // presidencial plano (data)
  if(obj.data){
    const d = obj.data;
    const meta = {
      inscritos: d.INSCRITOS || null,
      emitidos: d.EMITIDOS || 0,
      validos: d.VALIDOS || 0,
      nulos: d.NULOS || 0
    };
    const votes = {};
    Object.keys(d).forEach(k=>{
      if(["INSCRITOS","EMITIDOS","VALIDOS","NULOS"].includes(k)) return;
      votes[k] = Number(d[k]||0);
    });
    return { meta, votes };
  }

  // ya normalizado
  if(obj.meta && obj.votes){
    return {
      meta: obj.meta || {},
      votes: obj.votes || {}
    };
  }

  return { meta:{}, votes:{} };
}

function normalizeLevel(levelRaw){
  if(!levelRaw) return { nacional:{meta:{},votes:{}}, territorios:{} };

  const nacional = buildMetaVotes(levelRaw.nacional);

  const territorios = {};
  Object.keys(levelRaw).forEach(k=>{
    if(k === "nacional") return;
    const item = levelRaw[k];
    if(typeof item !== "object") return;

    // provincias / municipios / dm
    Object.keys(item).forEach(id=>{
      const val = item[id];
      if(!val) return;
      const built = buildMetaVotes(val);
      territorios[id] = {
        nombre: val.nombre || id,
        meta: built.meta,
        votes: built.votes
      };
    });
  });

  return { nacional, territorios };
}

function normalizeResults(raw){
  return {
    pres: normalizeLevel(raw.pres),
    sen:  normalizeLevel(raw.sen),
    dip:  normalizeLevel(raw.dip),
    mun:  normalizeLevel(raw.mun),
    dm:   normalizeLevel(raw.dm)
  };
}

export async function buildCTX(){
  if(CTX_CACHE) return CTX_CACHE;

  const [r24, r20, pad, geo, polls] = await Promise.all([
    fetchJSON("./data/results_2024.json"),
    fetchJSON("./data/results_2020.json"),
    fetchJSON("./data/padron.json"),
    fetchJSON("./data/geography.json"),
    fetchJSON("./data/polls.json")
  ]);

  CTX_CACHE = {
    normalized: {
      2024: normalizeResults(r24),
      2020: normalizeResults(r20)
    },
    padron: pad || {},
    geography: geo || {},
    polls: polls || {}
  };

  return CTX_CACHE;
}

export async function getCTX(){
  return buildCTX();
}

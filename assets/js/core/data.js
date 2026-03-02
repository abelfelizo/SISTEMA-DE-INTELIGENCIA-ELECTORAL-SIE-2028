let CTX_CACHE = null;
async function fetchJSON(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return await r.json();
}
function isPlainResults(obj){
  return obj && typeof obj === "object" && ("EMITIDOS" in obj || "VALIDOS" in obj || "NULOS" in obj) && !obj.data && !obj.meta;
}
function buildMetaVotes(obj){
  if(!obj || typeof obj !== "object") return { meta:{}, votes:{} };
  if(obj.data && typeof obj.data === "object"){
    const d = obj.data;
    const meta = { inscritos: d.INSCRITOS ?? null, emitidos:+(d.EMITIDOS||0), validos:+(d.VALIDOS||0), nulos:+(d.NULOS||0) };
    const votes = {};
    for(const k of Object.keys(d)){
      if(["INSCRITOS","EMITIDOS","VALIDOS","NULOS"].includes(k)) continue;
      votes[k] = +(d[k]||0);
    }
    return { meta, votes };
  }
  if(obj.meta && obj.votes) return { meta: obj.meta||{}, votes: obj.votes||{} };
  if(isPlainResults(obj)){
    const meta = { inscritos: obj.INSCRITOS ?? null, emitidos:+(obj.EMITIDOS||0), validos:+(obj.VALIDOS||0), nulos:+(obj.NULOS||0) };
    const votes = {};
    for(const k of Object.keys(obj)){
      if(["INSCRITOS","EMITIDOS","VALIDOS","NULOS"].includes(k)) continue;
      votes[k] = +(obj[k]||0);
    }
    return { meta, votes };
  }
  return { meta:{}, votes:{} };
}
function buildGeoIndex(geo){
  const idx = { provSet:new Set(), provName:{}, munSet:new Set(), munName:{}, dmSet:new Set(), dmName:{}, dmList:[] };
  const provs = geo?.territorio?.interior?.provincias || {};
  for(const pc of Object.keys(provs)){
    const n = parseInt(pc,10);
    const pv = provs[pc];
    if(!pv) continue;
    if(Number.isFinite(n) && n>=1 && n<=32){
      idx.provSet.add(pc);
      idx.provName[pc] = pv.nombre || pc;
      const mun = pv.municipios || {};
      for(const mc of Object.keys(mun)){
        const m = mun[mc];
        if(!m) continue;
        idx.munSet.add(mc);
        idx.munName[mc] = m.nombre || mc;
        const dms = m.distritos_municipales || {};
        for(const dc of Object.keys(dms)){
          const dmo = dms[dc];
          const did = `${mc}-${dc}`;
          idx.dmSet.add(did);
          idx.dmName[did] = dmo?.nombre || did;
        }
      }
    }
  }
  idx.dmList = Array.from(idx.dmSet).sort();
  return idx;
}
function normalizePres(raw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, territoriosMun:{}, territoriosDM:{}, special:{ exterior:{}, penitenciario:{}, otros:{} } };
  if(!raw) return out;
  out.nacional = buildMetaVotes(raw.nacional);
  const provs = raw.provincias || {};
  for(const pid of Object.keys(provs)){
    const item = provs[pid];
    const mv = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.provName[pid] || pid;
    if(geoIdx.provSet.has(pid) || (/^\d{2}$/.test(pid) && parseInt(pid,10)>=1 && parseInt(pid,10)<=32)){
      out.territoriosProv[pid] = { nombre, meta: mv.meta, votes: mv.votes };
    }else{
      out.special.exterior[pid] = { nombre, meta: mv.meta, votes: mv.votes };
    }
  }
  const mun = raw.municipios || {};
  for(const mid of Object.keys(mun)){
    const item = mun[mid];
    const mv = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.munName[mid] || mid;
    if(geoIdx.munSet.has(mid) || /^\d{4}$/.test(mid)){
      out.territoriosMun[mid] = { nombre, meta: mv.meta, votes: mv.votes };
    }else{
      out.special.otros[mid] = { nombre, meta: mv.meta, votes: mv.votes };
    }
  }
  const dm = raw.dm || {};
  for(const k of Object.keys(dm)){
    const item = dm[k];
    const mv = buildMetaVotes(item);
    let id = k;
    if(!/^\d{4}-\d{3}$/.test(id)){
      const m = String(k).match(/^(\d+)\.0$/);
      if(m){
        const idx = parseInt(m[1],10);
        if(Number.isFinite(idx) && idx>=0 && idx<geoIdx.dmList.length) id = geoIdx.dmList[idx];
      }
    }
    const nombre = item?.nombre || geoIdx.dmName[id] || id;
    if(geoIdx.dmSet.has(id) || /^\d{4}-\d{3}$/.test(id)){
      out.territoriosDM[id] = { nombre, meta: mv.meta, votes: mv.votes };
    }else{
      out.special.otros[id] = { nombre, meta: mv.meta, votes: mv.votes };
    }
  }
  out.territorios = out.territoriosProv;
  return out;
}
function normalizeProvOnly(raw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{} };
  if(!raw) return out;
  out.nacional = buildMetaVotes(raw.nacional);
  const provs = raw.provincias || {};
  for(const pid of Object.keys(provs)){
    const item = provs[pid];
    const mv = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.provName[pid] || pid;
    out.territoriosProv[pid] = { nombre, meta: mv.meta, votes: mv.votes };
  }
  out.territorios = out.territoriosProv;
  return out;
}
function normalizeDip(raw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, circunscripciones:{}, exteriorDip:{} };
  if(!raw) return out;
  out.nacional = buildMetaVotes(raw.nacional);
  const provs = raw.provincias || {};
  for(const pid of Object.keys(provs)){
    const item = provs[pid];
    const mv = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.provName[pid] || pid;
    out.territoriosProv[pid] = { nombre, meta: mv.meta, votes: mv.votes };
  }
  const circs = raw.circunscripciones || {};
  for(const cid of Object.keys(circs)){
    const item = circs[cid];
    const mv = buildMetaVotes(item);
    out.circunscripciones[cid] = { nombre: item?.nombre || cid, meta: mv.meta, votes: mv.votes };
  }
  const ext = raw.exterior || {};
  for(const eid of Object.keys(ext)){
    const item = ext[eid];
    const mv = buildMetaVotes(item);
    out.exteriorDip[eid] = { nombre: item?.nombre || eid, meta: mv.meta, votes: mv.votes };
  }
  out.territorios = out.territoriosProv;
  return out;
}
function normalizeMun(raw){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosMun:{} };
  if(!raw) return out;
  out.nacional = buildMetaVotes(raw.nacional);
  const mun = raw.municipios || {};
  for(const mid of Object.keys(mun)){
    const item = mun[mid];
    const mv = buildMetaVotes(item);
    out.territoriosMun[mid] = { nombre: item?.nombre || mid, meta: mv.meta, votes: mv.votes };
  }
  out.territorios = out.territoriosMun;
  return out;
}
function normalizeDM(raw){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosDM:{} };
  if(!raw) return out;
  out.nacional = buildMetaVotes(raw.nacional);
  const dm = raw.dm || {};
  for(const did of Object.keys(dm)){
    const item = dm[did];
    const mv = buildMetaVotes(item);
    out.territoriosDM[did] = { nombre: item?.nombre || did, meta: mv.meta, votes: mv.votes };
  }
  out.territorios = out.territoriosDM;
  return out;
}
function normalizeResults(raw, geoIdx){
  return {
    pres: normalizePres(raw.pres, geoIdx),
    sen:  normalizeProvOnly(raw.sen, geoIdx),
    dip:  normalizeDip(raw.dip, geoIdx),
    mun:  normalizeMun(raw.mun),
    dm:   normalizeDM(raw.dm)
  };
}
async function fetchMaybe(path, fallback){
  try{ return await fetchJSON(path); }catch(e){ return fallback; }
}

export async function getCTX(){
  if(CTX_CACHE) return CTX_CACHE;
  const [r24, r20, pad, geo, polls, curules] = await Promise.all([
    fetchJSON("./data/results_2024.json"),
    fetchJSON("./data/results_2020.json"),
    fetchJSON("./data/padron.json"),
    fetchJSON("./data/geography.json"),
    fetchJSON("./data/polls.json").catch(()=>({series:[]})),
    fetchMaybe("./data/curules_2024.json", {})
  ]);
  const geoIdx = buildGeoIndex(geo||{});
  CTX_CACHE = { normalized:{ 2024: normalizeResults(r24||{}, geoIdx), 2020: normalizeResults(r20||{}, geoIdx) }, padron: pad||{}, geography: geo||{}, polls: polls||{},
    curules2024: curules||{} };
  return CTX_CACHE;
}

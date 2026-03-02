// ===== BLINDAJE CORE STAGE 3 (Normalizador definitivo) =====
// Contrato interno (por año y nivel):
// ctx.normalized[YYYY][nivel] = {
//   nacional: { meta, votes },
//   territorios: { id: { nombre, meta, votes } },   // alias según nivel (prov/mun/dm)
//   territoriosProv: {...}, territoriosMun: {...}, territoriosDM: {...},
//   special: { exterior: {...}, penitenciario: {...}, otros: {...} }
// }

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

function isPlainResults(obj){
  // obj con EMITIDOS/VALIDOS/NULOS en root (pres nacional o similar)
  return obj && typeof obj === "object" && ("EMITIDOS" in obj || "VALIDOS" in obj || "NULOS" in obj) && !obj.data && !obj.meta;
}

function buildMetaVotes(obj){
  if(!obj || typeof obj !== "object") return { meta:{}, votes:{} };

  // Caso A: {nombre, data:{...}}
  if(obj.data && typeof obj.data === "object"){
    const d = obj.data;
    const meta = {
      inscritos: d.INSCRITOS ?? null,
      emitidos: Number(d.EMITIDOS||0),
      validos: Number(d.VALIDOS||0),
      nulos: Number(d.NULOS||0)
    };
    const votes = {};
    Object.keys(d).forEach(k=>{
      if(["INSCRITOS","EMITIDOS","VALIDOS","NULOS"].includes(k)) return;
      votes[k] = Number(d[k]||0);
    });
    return { meta, votes };
  }

  // Caso B: {meta:{}, votes:{}}
  if(obj.meta && obj.votes){
    return { meta: obj.meta || {}, votes: obj.votes || {} };
  }

  // Caso C: plano {EMITIDOS, VALIDOS, NULOS, PARTIDOS...}
  if(isPlainResults(obj)){
    const meta = {
      inscritos: obj.INSCRITOS ?? null,
      emitidos: Number(obj.EMITIDOS||0),
      validos: Number(obj.VALIDOS||0),
      nulos: Number(obj.NULOS||0)
    };
    const votes = {};
    Object.keys(obj).forEach(k=>{
      if(["INSCRITOS","EMITIDOS","VALIDOS","NULOS"].includes(k)) return;
      votes[k] = Number(obj[k]||0);
    });
    return { meta, votes };
  }

  return { meta:{}, votes:{} };
}

function buildGeoIndex(geo){
  const idx = {
    provSet: new Set(),
    provName: {},
    munSet: new Set(),
    munName: {},
    dmSet: new Set(),
    dmName: {},
    dmList: [],   // orden estable para mapear índices 0.0 -> municipio-dm
  };

  const territorio = (geo && geo.territorio) ? geo.territorio : {};
  const interior = territorio.interior || {};
  const provs = (interior && interior.provincias) ? interior.provincias : {};

  // Provincias "interior" reales: asumimos 01-32
  Object.keys(provs).forEach(pc=>{
    const n = parseInt(pc,10);
    const pv = provs[pc];
    if(!pv) return;

    if(Number.isFinite(n) && n>=1 && n<=32){
      idx.provSet.add(pc);
      idx.provName[pc] = pv.nombre || pv.name || pc;

      const municipios = pv.municipios || {};
      Object.keys(municipios).forEach(mc=>{
        const m = municipios[mc];
        if(!m) return;
        idx.munSet.add(mc);
        idx.munName[mc] = m.nombre || mc;

        const dms = m.distritos_municipales || {};
        Object.keys(dms).forEach(dc=>{
          const dmo = dms[dc];
          const did = `${mc}-${dc}`; // formato DM estándar del proyecto
          idx.dmSet.add(did);
          idx.dmName[did] = (dmo && (dmo.nombre || dmo.name)) ? (dmo.nombre || dmo.name) : did;
        });
      });
    }else{
      // códigos fuera de 01-32: suelen ser "exterior por colegio" (países) colados en provs
      // no los agregamos a interior para mapa provincial
    }
  });

  // dmList estable (orden por municipio luego dm)
  idx.dmList = Array.from(idx.dmSet).sort((a,b)=>{
    const [am,ad] = a.split("-");
    const [bm,bd] = b.split("-");
    if(am!==bm) return am.localeCompare(bm);
    return ad.localeCompare(bd);
  });

  return idx;
}

function normalizePres(levelRaw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, territoriosMun:{}, territoriosDM:{}, special:{ exterior:{}, penitenciario:{}, otros:{} } };
  if(!levelRaw) return out;

  out.nacional = buildMetaVotes(levelRaw.nacional);

  // provincias
  const provs = levelRaw.provincias || {};
  Object.keys(provs).forEach(pid=>{
    const item = provs[pid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.provName[pid] || pid;

    if(geoIdx.provSet.has(pid)){
      out.territoriosProv[pid] = { nombre, meta: built.meta, votes: built.votes };
    }else{
      // fuera de interior (países/exterior) o raro: va a special
      out.special.exterior[pid] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  // municipios (códigos 4 dígitos únicos)
  const mun = levelRaw.municipios || {};
  Object.keys(mun).forEach(mid=>{
    const item = mun[mid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.munName[mid] || mid;

    if(geoIdx.munSet.has(mid)){
      out.territoriosMun[mid] = { nombre, meta: built.meta, votes: built.votes };
    }else{
      out.special.otros[mid] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  // distritos municipales (bug: keys tipo "0.0")
  const dm = levelRaw.dm || {};
  Object.keys(dm).forEach(k=>{
    const item = dm[k];
    const built = buildMetaVotes(item);

    let id = k;
    // si ya está en formato municipio-dm, perfecto
    if(!/^\d{4}-\d{3}$/.test(id)){
      // intentar mapear índices tipo "12.0"
      const m = String(k).match(/^(\d+)\.0$/);
      if(m){
        const idx = parseInt(m[1],10);
        if(Number.isFinite(idx) && idx>=0 && idx<geoIdx.dmList.length){
          id = geoIdx.dmList[idx];
        }
      }
    }

    const nombre = item?.nombre || geoIdx.dmName[id] || id;

    if(geoIdx.dmSet.has(id)){
      out.territoriosDM[id] = { nombre, meta: built.meta, votes: built.votes };
    }else{
      out.special.otros[id] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  // alias usado por views actuales: para pres el mapa provincial usa territoriosProv por defecto
  out.territorios = out.territoriosProv;

  return out;
}

function normalizeSen(levelRaw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, territoriosMun:{}, territoriosDM:{}, special:{ exterior:{}, penitenciario:{}, otros:{} } };
  if(!levelRaw) return out;

  out.nacional = buildMetaVotes(levelRaw.nacional);

  const provs = levelRaw.provincias || {};
  Object.keys(provs).forEach(pid=>{
    const item = provs[pid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.provName[pid] || pid;
    if(geoIdx.provSet.has(pid)){
      out.territoriosProv[pid] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  out.territorios = out.territoriosProv;
  return out;
}

function normalizeDip(levelRaw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, territoriosMun:{}, territoriosDM:{}, special:{ exterior:{}, penitenciario:{}, otros:{} }, circunscripciones:{}, exteriorDip:{} };
  if(!levelRaw) return out;

  out.nacional = buildMetaVotes(levelRaw.nacional);

  // provincias
  const provs = levelRaw.provincias || {};
  Object.keys(provs).forEach(pid=>{
    const item = provs[pid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.provName[pid] || pid;
    if(geoIdx.provSet.has(pid)){
      out.territoriosProv[pid] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  // circunscripciones (prov-circ)
  const circs = levelRaw.circunscripciones || {};
  Object.keys(circs).forEach(cid=>{
    const item = circs[cid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || cid;
    out.circunscripciones[cid] = { nombre, meta: built.meta, votes: built.votes };
  });

  // exterior diputados C1-C3
  const ext = levelRaw.exterior || {};
  Object.keys(ext).forEach(eid=>{
    const item = ext[eid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || eid;
    out.exteriorDip[eid] = { nombre, meta: built.meta, votes: built.votes };
  });

  out.territorios = out.territoriosProv;
  return out;
}

function normalizeMun(levelRaw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, territoriosMun:{}, territoriosDM:{}, special:{ exterior:{}, penitenciario:{}, otros:{} } };
  if(!levelRaw) return out;

  out.nacional = buildMetaVotes(levelRaw.nacional);

  const mun = levelRaw.municipios || {};
  Object.keys(mun).forEach(mid=>{
    const item = mun[mid];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.munName[mid] || mid;
    if(geoIdx.munSet.has(mid)){
      out.territoriosMun[mid] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  out.territorios = out.territoriosMun;
  return out;
}

function normalizeDM(levelRaw, geoIdx){
  const out = { nacional:{meta:{},votes:{}}, territorios:{}, territoriosProv:{}, territoriosMun:{}, territoriosDM:{}, special:{ exterior:{}, penitenciario:{}, otros:{} } };
  if(!levelRaw) return out;

  out.nacional = buildMetaVotes(levelRaw.nacional);

  const dm = levelRaw.dm || {};
  Object.keys(dm).forEach(did=>{
    const item = dm[did];
    const built = buildMetaVotes(item);
    const nombre = item?.nombre || geoIdx.dmName[did] || did;
    if(geoIdx.dmSet.has(did)){
      out.territoriosDM[did] = { nombre, meta: built.meta, votes: built.votes };
    }
  });

  out.territorios = out.territoriosDM;
  return out;
}

function normalizeResults(raw, geoIdx){
  return {
    pres: normalizePres(raw.pres, geoIdx),
    sen:  normalizeSen(raw.sen,  geoIdx),
    dip:  normalizeDip(raw.dip,  geoIdx),
    mun:  normalizeMun(raw.mun,  geoIdx),
    dm:   normalizeDM(raw.dm,    geoIdx)
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

  const geoIdx = buildGeoIndex(geo || {});

  CTX_CACHE = {
    normalized: {
      2024: normalizeResults(r24 || {}, geoIdx),
      2020: normalizeResults(r20 || {}, geoIdx)
    },
    padron: pad || {},
    geography: geo || {},
    _geoIndex: geoIdx,
    polls: polls || {}
  };

  return CTX_CACHE;
}

export async function getCTX(){
  return buildCTX();
}

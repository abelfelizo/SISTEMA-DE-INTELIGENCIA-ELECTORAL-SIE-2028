// core/engine.js
// Motores electorales por nivel (H2)

function sumVotes(votes){
  let t = 0;
  for(const k in votes) t += Number(votes[k]||0);
  return t;
}
function topN(votes, n=3){
  return Object.entries(votes||{})
    .filter(([k,v])=>k && Number(v||0)>0)
    .sort((a,b)=>Number(b[1]||0)-Number(a[1]||0))
    .slice(0,n);
}
function winner(votes){
  const arr = topN(votes, 2);
  const w = arr[0]?.[0] || null;
  const wv = Number(arr[0]?.[1]||0);
  const rv = Number(arr[1]?.[1]||0);
  return {party:w, votes:wv, runnerVotes:rv};
}
function pct(x){ return (x*100).toFixed(2)+"%"; }

export function computePresRisk(nationalVotes){
  const tot = sumVotes(nationalVotes);
  const arr = topN(nationalVotes, 2);
  const topShare = tot ? Number(arr[0]?.[1]||0)/tot : 0;
  const margin = tot ? (Number(arr[0]?.[1]||0)-Number(arr[1]?.[1]||0))/tot : 0;
  const riesgo2v = topShare < 0.5 ? "Alto" : "Bajo";
  const riesgoMargen = margin < 0.05 ? "Alto" : (margin < 0.10 ? "Medio" : "Bajo");
  return {topShare, margin, riesgo2v, riesgoMargen};
}

export function computeWinnersByTerritory(territorios){
  const out = {};
  for(const id of Object.keys(territorios||{})){
    const t = territorios[id];
    const v = t?.votes || {};
    out[id] = winner(v);
  }
  return out;
}

// D'Hondt allocation per demarcation
export function dhondtAllocate(votes, seats){
  const parties = Object.keys(votes||{}).filter(p=>Number(votes[p]||0)>0);
  const quotients = [];
  for(const p of parties){
    const v = Number(votes[p]||0);
    for(let d=1; d<=seats; d++){
      quotients.push({p, q: v/d});
    }
  }
  quotients.sort((a,b)=>b.q-a.q);
  const alloc = {};
  for(let i=0;i<seats && i<quotients.length;i++){
    const p = quotients[i].p;
    alloc[p] = (alloc[p]||0)+1;
  }
  return alloc;
}

export function computeDiputadosCurules(dipLevel, curulesMap){
  // dipLevel.territoriosProv: {provCode:{votes}}
  const out = {};
  for(const prov of Object.keys(dipLevel?.territoriosProv||dipLevel?.territorios||{})){
    const t = (dipLevel.territoriosProv||dipLevel.territorios)[prov];
    const seats = Number(curulesMap?.[prov] || 0);
    if(!seats) continue;
    out[prov] = dhondtAllocate(t.votes||{}, seats);
  }
  return out;
}

export function applyPartyAdjust(votes, adjustPP){
  // adjustPP: {PARTY: deltaPP} applied on vote shares then renormalized to total votes
  const total = sumVotes(votes);
  if(!total) return {...votes};
  const baseShares = {};
  for(const p of Object.keys(votes)) baseShares[p] = Number(votes[p]||0)/total;
  // apply delta
  const shares = {};
  for(const p of Object.keys(baseShares)){
    shares[p] = Math.max(0, baseShares[p] + (Number(adjustPP?.[p]||0)/100));
  }
  // ensure parties in adjust that aren't present
  for(const p of Object.keys(adjustPP||{})){
    if(!(p in shares)){
      shares[p] = Math.max(0, Number(adjustPP[p]||0)/100);
    }
  }
  const sumS = Object.values(shares).reduce((a,b)=>a+b,0) || 1;
  const out = {};
  for(const p of Object.keys(shares)){
    out[p] = Math.round((shares[p]/sumS)*total);
  }
  return out;
}

export function applyMobilizacion(meta, votes, movilizacion){
  // +pp on participation or capture abstention; capped at 60% of abstention
  const inscritos = Number(meta?.inscritos||0);
  const emitidos = Number(meta?.emitidos||0);
  const abst = Math.max(0, inscritos-emitidos);
  const cap = Math.round(abst*0.60);
  if(!cap || !inscritos) return {meta:{...meta}, votes:{...votes}};

  let add = 0;
  if(movilizacion?.mode === "pp"){
    const pp = Number(movilizacion?.value||0);
    add = Math.round(inscritos*(pp/100));
  }else{ // captura
    const pct = Number(movilizacion?.value||0);
    add = Math.round(abst*(pct/100));
  }
  add = Math.min(Math.max(add,0), cap);
  if(add===0) return {meta:{...meta}, votes:{...votes}};

  // distribute proportional to existing shares (simple H2)
  const total = sumVotes(votes) || 1;
  const outVotes = {};
  let assigned = 0;
  const parties = Object.keys(votes);
  for(let i=0;i<parties.length;i++){
    const p = parties[i];
    const v = Number(votes[p]||0);
    const inc = (i===parties.length-1) ? (add-assigned) : Math.round(add*(v/total));
    outVotes[p] = v + inc;
    assigned += inc;
  }
  return {
    meta: {...meta, emitidos: emitidos+add, validos: (Number(meta?.validos||emitidos)+add)},
    votes: outVotes
  };
}

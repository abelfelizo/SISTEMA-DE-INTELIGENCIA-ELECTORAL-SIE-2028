export const DEFAULT_STATE = Object.freeze({
  nivel: "pres",
  corte: "mayo2024",
  view: "dashboard",
  simulator: {
    overrideEnabled: false,
    overrideNivel: "pres",
    growthPct: 7.63,
    partyAdjust: {},
    alliances: {},
    movilizacion: { mode:"pp", value:0, distribution:"prop", targetParty:"", negative:false },
    arrastre: { enabled:false, k:"auto", kManual:0.4 },
    polls: { enabled:false, weightRecency:true }
  }
});
const LS_KEY = "SIE2028_STATE_V1";
export function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return mergeState(structuredClone(DEFAULT_STATE), parsed);
  }catch(e){ return structuredClone(DEFAULT_STATE); }
}
export function saveState(state){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
export function mergeState(base, patch){
  if(!patch || typeof patch !== "object") return base;
  for(const k of Object.keys(patch)){
    const v = patch[k];
    if(v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object"){
      base[k] = mergeState(base[k], v);
    }else{
      base[k] = v;
    }
  }
  return base;
}
export function setState(state, patch){
  const next = mergeState(structuredClone(state), patch);
  saveState(next);
  return next;
}

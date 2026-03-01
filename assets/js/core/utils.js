
export function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
export function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
export function deepCopy(obj){ return JSON.parse(JSON.stringify(obj)); }
export function formatPct(x){ return (Math.round(x*10)/10).toFixed(1) + "%"; }
export function nowISO(){ return new Date().toISOString(); }
export function safeJsonParse(text){
  try { return {ok:true, value: JSON.parse(text)}; }
  catch(e){ return {ok:false, error:e}; }
}

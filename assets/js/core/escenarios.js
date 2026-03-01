
import {deepCopy} from "./utils.js";

const KEY = "sie_2028_scenarios_v1";

export function loadScenarios(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data)? data : [];
  }catch(e){ return []; }
}

export function saveScenarios(list){
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addScenario(scn){
  const list = loadScenarios();
  list.unshift({...scn, id: scn.id || crypto.randomUUID(), createdAt: scn.createdAt || new Date().toISOString()});
  saveScenarios(list);
  return list;
}

export function deleteScenario(id){
  const list = loadScenarios().filter(s=>s.id!==id);
  saveScenarios(list);
  return list;
}

export function getScenario(id){
  return loadScenarios().find(s=>s.id===id) || null;
}

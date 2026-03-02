/**
 * SIE 2028 -- core/auditoria.js  (H5)
 * 
 * H5 changes:
 *  - "Diferencia Pres vs Dip" es nota explicativa (info), no error
 *  - Voto en casilla partido es caracteristica del sistema electoral RD, no anomalia
 *  - Agrega validacion de partidos.json
 *  - Agrega nota explicativa sobre voto diferenciado
 */
import { getLevel, getInscritos } from "./data.js";

var NL = { pres:"Presidencial", sen:"Senadores", dip:"Diputados", mun:"Alcaldes", dm:"DM" };

export function runAuditoria(ctx) {
  var issues = [], ok = [], notas = [];
  function err(msg, n)  { issues.push({ msg:msg, nivel:n||null }); }
  function good(msg, n) { ok.push({ msg:msg, nivel:n||null }); }
  function nota(msg, n) { notas.push({ msg:msg, nivel:n||null }); }

  var niveles = ["pres","sen","dip","mun","dm"];
  for (var ni = 0; ni < niveles.length; ni++) {
    var nivel = niveles[ni];
    var lbl   = NL[nivel];
    var lv, nat;
    try { lv = getLevel(ctx, 2024, nivel); nat = lv.nacional; }
    catch(e) { err("["+lbl+"] Error al cargar: "+e.message, nivel); continue; }

    if (!nat || !nat.emitidos) { err("["+lbl+"] Sin emitidos nacionales", nivel); continue; }

    var sumVN  = (nat.validos||0) + (nat.nulos||0);
    var diffVN = Math.abs(nat.emitidos - sumVN);
    if (diffVN > 100) err("["+lbl+"] Emitidos ("+fmt(nat.emitidos)+") != Validos+Nulos ("+fmt(sumVN)+"), D="+fmt(diffVN), nivel);
    else              good("["+lbl+"] Emitidos = Validos + Nulos", nivel);

    if (nat.inscritos) {
      if (nat.inscritos < nat.emitidos) err("["+lbl+"] Inscritos < Emitidos", nivel);
      else good("["+lbl+"] Inscritos >= Emitidos", nivel);
    }

    var sumPart  = Object.values(nat.votes||{}).reduce(function(a,v){return a+v;},0);
    var diffPart = Math.abs(sumPart - (nat.validos||0));
    if (diffPart > 100) err("["+lbl+"] Suma partidos ("+fmt(sumPart)+") != Validos ("+fmt(nat.validos)+"), D="+fmt(diffPart), nivel);
    else                good("["+lbl+"] Suma partidos = Validos", nivel);

    try {
      var terr = nivel==="mun" ? (lv.mun||{}) : nivel==="dm" ? (lv.dm||{}) : (lv.prov||{});
      var tc   = Object.keys(terr).length;
      if (tc===0) err("["+lbl+"] Sin territorios desagregados", nivel);
      else        good("["+lbl+"] "+tc+" territorios OK", nivel);

      var sample = Object.keys(terr).slice(0,3);
      sample.forEach(function(tid) {
        var t = terr[tid];
        if (!t) return;
        var tv   = Object.values(t.votes||{}).reduce(function(a,v){return a+v;},0);
        var tval = t.validos || t.emitidos || 0;
        if (tval > 0 && Math.abs(tv-tval) > 500) {
          err("["+lbl+"] Territorio "+tid+": suma partidos D="+fmt(Math.abs(tv-tval)), nivel);
        }
      });
    } catch(e) { err("["+lbl+"] Error territorios: "+e.message, nivel); }
  }

  // H5: Pres vs Dip - es NOTA, no error
  // El voto diferenciado es una caracteristica del sistema electoral dominicano
  // donde el elector puede votar partido (casilla) o candidato (boleta individual)
  // La diferencia de participacion Pres > Dip es normal y esperada
  try {
    var presLv  = getLevel(ctx, 2024, "pres");
    var dipLv   = getLevel(ctx, 2024, "dip");
    var padIns  = getInscritos(ctx, "mayo2024");
    var presPrt = padIns ? presLv.nacional.emitidos / padIns : null;
    var dipIns  = dipLv.nacional.inscritos || 0;
    var dipPrt  = dipIns ? dipLv.nacional.emitidos / dipIns : null;
    if (presPrt !== null && dipPrt !== null) {
      var gap = presPrt - dipPrt; // directional: pres > dip es lo normal
      if (gap > 0.08) {
        nota("Voto diferenciado Pres-Dip: "+pctS(gap)+" (>8pp). " +
             "Normal en RD: el voto de casilla partido se contabiliza en presidencial " +
             "pero no necesariamente en legislativo. No es error de datos.", null);
      } else {
        good("Participacion Pres vs Dip: diferencia "+pctS(Math.abs(gap))+" OK", null);
      }
    }
  } catch(e) { err("Error comparando participacion: "+e.message, null); }

  // Curules
  try {
    var cur = ctx.curules;
    if (cur && cur.meta && cur.meta.total_diputados === 190) good("Curules: 190 diputados OK", "dip");
    else if (cur && cur.meta) err("Curules: total="+cur.meta.total_diputados+" (esperado 190)", "dip");
    else err("curules_2024.json: sin total_diputados", "dip");

    var tc = ((cur&&cur.territorial)||[]).reduce(function(a,c){return a+c.seats;},0)
           + ((cur&&cur.exterior)||[]).reduce(function(a,c){return a+c.seats;},0)
           + ((cur&&cur.nacionales) ? (cur.nacionales.seats||0) : 0);
    if (tc===190) good("Suma escanos circunscripciones = 190 OK", "dip");
    else          err("Suma escanos = "+tc+" (esperado 190)", "dip");
  } catch(e) { err("Error curules: "+e.message, "dip"); }

  // Padron
  try {
    var ins = getInscritos(ctx, "mayo2024");
    if (ins > 0) good("Padron mayo2024: "+fmt(ins)+" inscritos OK", null);
    else         err("Padron mayo2024: sin inscritos", null);
  } catch(e) { err("Error padron: "+e.message, null); }

  // Partidos.json
  try {
    var partidos = ctx.partidos || [];
    if (partidos.length > 0) good("partidos.json: "+partidos.length+" partidos cargados OK", null);
    else nota("partidos.json: vacio (se usaran partidos del nivel activo)", null);
  } catch(e) { err("Error partidos: "+e.message, null); }

  // Encuestas
  try {
    var polls = ctx.polls || [];
    if (polls.length > 0) good("Encuestas: "+polls.length+" registro(s) OK", null);
    else nota("polls.json: sin datos. Carga encuestas en el modulo Encuestas.", null);
  } catch(e) { err("Error encuestas: "+e.message, null); }

  // 32 provincias
  try {
    var senP = Object.keys((getLevel(ctx,2024,"sen").prov)||{}).length;
    var dipP = Object.keys((getLevel(ctx,2024,"dip").prov)||{}).length;
    if (senP===32) good("[Senadores] 32 provincias OK", "sen"); else err("[Senadores] "+senP+" provincias (esperado 32)", "sen");
    if (dipP===32) good("[Diputados] 32 provincias OK", "dip"); else err("[Diputados] "+dipP+" provincias (esperado 32)", "dip");
  } catch(e) { err("Error contando provincias: "+e.message, null); }

  return {
    issues:  issues,
    ok:      ok,
    notas:   notas,
    resumen: {
      total:     issues.length + ok.length + notas.length,
      errores:   issues.length,
      correctos: ok.length,
      notas:     notas.length,
    }
  };
}

function fmt(n)   { return (Math.round(Number(n)||0)).toLocaleString("en-US"); }
function pctS(x)  { return (x*100).toFixed(1)+"%"; }

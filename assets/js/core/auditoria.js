/**
 * SIE 2028  core/auditoria.js
 * Motor de validacin de integridad de datos.
 */

import { getLevel, getInscritos } from "./data.js";
import { rankVotes }              from "./utils.js";

const NIVEL_LABEL = { pres:"Presidencial", sen:"Senadores", dip:"Diputados", mun:"Alcaldes", dm:"DM" };

/**
 * Corre todas las validaciones y devuelve { issues, ok, resumen }
 */
export function runAuditoria(ctx) {
  const issues = [];
  const ok     = [];

  function err(msg, nivel) { issues.push({ msg, nivel: nivel || null }); }
  function good(msg, nivel) { ok.push({ msg, nivel: nivel || null }); }

  //  Por nivel 
  for (const nivel of ["pres", "sen", "dip", "mun", "dm"]) {
    const lbl = NIVEL_LABEL[nivel];
    const lv  = getLevel(ctx, 2024, nivel);
    const nat = lv.nacional;

    // Emitidos > 0
    if (!nat.emitidos) {
      err(`[${lbl}] Sin datos de emitidos nacionales`, nivel);
      continue;
    }

    // emitidos = validos + nulos
    const sumVN = nat.validos + nat.nulos;
    const diffVN = Math.abs(nat.emitidos - sumVN);
    if (diffVN > 100) {
      err(`[${lbl}] Emitidos (${fmt(nat.emitidos)}) != Validos+Nulos (${fmt(sumVN)}), D=${fmt(diffVN)}`, nivel);
    } else {
      good(`[${lbl}] Emitidos = Validos + Nulos OK`, nivel);
    }

    // inscritos >= emitidos
    if (nat.inscritos && nat.inscritos < nat.emitidos) {
      err(`[${lbl}] Inscritos (${fmt(nat.inscritos)}) < Emitidos (${fmt(nat.emitidos)})`, nivel);
    } else if (nat.inscritos) {
      good(`[${lbl}] Inscritos >= Emitidos OK`, nivel);
    }

    // Suma de votos partidos  vlidos
    const sumPart = Object.values(nat.votes).reduce((a, v) => a + v, 0);
    const diffPart = Math.abs(sumPart - nat.validos);
    if (diffPart > 100) {
      err(`[${lbl}] Suma partidos (${fmt(sumPart)}) != Validos (${fmt(nat.validos)}), D=${fmt(diffPart)}`, nivel);
    } else {
      good(`[${lbl}] Suma partidos = Validos OK`, nivel);
    }

    // Territorios: coherencia de cdigos
    const terr = nivel === "mun" ? lv.mun : nivel === "dm" ? lv.dm : lv.prov;
    const terrCount = Object.keys(terr).length;
    if (terrCount === 0) {
      err(`[${lbl}] Sin territorios desagregados`, nivel);
    } else {
      good(`[${lbl}] ${terrCount} territorios con datos OK`, nivel);
    }
  }

  //  Alerta pres vs congresual 
  const presLv  = getLevel(ctx, 2024, "pres");
  const dipLv   = getLevel(ctx, 2024, "dip");
  const padIns  = getInscritos(ctx, "mayo2024");
  const presPart = padIns ? presLv.nacional.emitidos / padIns : null;
  const dipIns   = dipLv.nacional.inscritos || 0;
  const dipPart  = dipIns ? dipLv.nacional.emitidos / dipIns : null;

  if (presPart != null && dipPart != null) {
    const gap = Math.abs(presPart - dipPart);
    if (gap > 0.08) {
      err(`Diferencia participacion Pres vs Dip: ${pct(gap)} (>8pp) -- revisar`, null);
    } else {
      good(`Participacion Pres vs Dip: diferencia ${pct(gap)} <= 8pp OK`, null);
    }
  }

  //  Curules 
  const cur = ctx.curules;
  if (cur?.meta?.total_diputados === 190) {
    good(`Curules: 190 diputados registrados OK`, "dip");
  } else if (cur?.meta?.total_diputados) {
    err(`Curules: total = ${cur.meta.total_diputados} (esperado 190)`, "dip");
  } else {
    err("curules_2024.json: sin dato total_diputados", "dip");
  }

  const totalCirc = (cur?.territorial || []).reduce((a, c) => a + c.seats, 0)
    + (cur?.exterior || []).reduce((a, c) => a + c.seats, 0)
    + (cur?.nacionales?.seats || 0);
  if (totalCirc === 190) {
    good(`Suma de escanos por circunscripcion = 190 OK`, "dip");
  } else {
    err(`Suma de escanos por circunscripcion = ${totalCirc} (esperado 190)`, "dip");
  }

  //  Padrn 
  const ins = getInscritos(ctx, "mayo2024");
  if (ins > 0) {
    good(`Padron mayo2024: ${fmt(ins)} inscritos OK`, null);
  } else {
    err("Padron mayo2024: sin inscritos", null);
  }

  //  Encuestas 
  const polls = ctx.polls || [];
  if (polls.length > 0) {
    good(`Encuestas: ${polls.length} encuesta(s) cargada(s) OK`, null);
  } else {
    err("Encuestas: polls.json vacio o sin datos", null);
  }

  //  Consistencia territorial por nivel 
  // Provincias sen y dip deben ser 32
  for (const nivel of ["sen", "dip"]) {
    const lbl  = NIVEL_LABEL[nivel];
    const lv   = getLevel(ctx, 2024, nivel);
    const n    = Object.keys(lv.prov).length;
    if (n === 32) {
      good(`[${lbl}] 32 provincias interiores OK`, nivel);
    } else {
      err(`[${lbl}] ${n} provincias (esperado 32)`, nivel);
    }
  }

  return {
    issues,
    ok,
    resumen: {
      total:    issues.length + ok.length,
      errores:  issues.length,
      correctos: ok.length,
    },
  };
}

function fmt(n) { return (Math.round(Number(n) || 0)).toLocaleString("en-US"); }
function pct(x) { return (x * 100).toFixed(1) + "%"; }

/**
 * SIE 2028  core/exportar.js  (H3)
 * Exportacin a PDF usando ventana de impresin del navegador.
 */
import { fmtInt, fmtPct, rankVotes } from "./utils.js";
import { getLevel, getInscritos }    from "./data.js";
import { simular }                   from "./simulacion.js";
import { runAuditoria }              from "./auditoria.js";

const NIVEL_LABEL = { pres:"Presidencial", sen:"Senadores", dip:"Diputados", mun:"Alcaldes", dm:"DM" };
const CORTE_LABEL = { mayo2024:"Mayo 2024", feb2024:"Feb 2024", proy2028:"Proy. 2028" };

export function exportarPDF(ctx, state, simResult = null) {
  const nivel  = state.nivel;
  const lv     = getLevel(ctx, 2024, nivel);
  const nat    = lv.nacional;
  const ins    = nivel === "pres" ? (getInscritos(ctx, state.corte) || nat.inscritos || 0) : (nat.inscritos || 0);
  const em     = nat.emitidos || 0;
  const part   = ins ? em / ins : 0;
  const ranked = rankVotes(nat.votes, em);
  const audit  = runAuditoria(ctx);
  const dipBase = nivel === "dip" ? simular(ctx, { nivel:"dip", year:2024 }) : null;
  const now    = new Date().toLocaleDateString("es-DO", { year:"numeric", month:"long", day:"numeric" });

  const dipCurRow = (p) => nivel === "dip"
    ? `<td>${(dipBase && dipBase.curules && dipBase.curules.totalByParty && dipBase.curules.totalByParty[p]) || 0}</td>` : "";
  const dipCurTh  = nivel === "dip" ? "<th>Cur. 2024</th>" : "";

  let simSection = "";
  if (simResult) {
    const sr = simResult;
    simSection = `
      <h2>Escenario Simulado</h2>
      <table>
        <tr><th>Emitidos</th><td>${fmtInt(sr.emitidos)}</td>
            <th>Participacion</th><td>${fmtPct(sr.participacion)}</td></tr>
      </table>
      <table>
        <tr><th>Partido</th><th>Votos sim</th><th>%</th>${nivel==="dip"?"<th>Curules</th>":""}</tr>
        ${sr.ranked.slice(0,12).map(({p,v,pct})=>`
          <tr><td>${p}</td><td>${fmtInt(v)}</td><td>${fmtPct(pct)}</td>
          ${nivel==="dip"?`<td>${(sr && sr.curules && sr.curules.totalByParty && sr.curules.totalByParty[p]) || 0}</td>`:""}</tr>`).join("")}
      </table>
      ${nivel==="dip"&&sr.curules ? `
        <p><b>Total curules: ${sr.curules.totalSeats}/190</b> . ${
          Object.entries(sr.curules.totalByParty).sort(([,a],[,b])=>b-a)
            .map(([p,s])=>`${p}:${s}`).join(" . ")
        }</p>` : ""}`;
  }

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<title>SIE 2028 -- ${NIVEL_LABEL[nivel]} -- ${now}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:11pt; color:#111; padding:18mm; }
h1 { font-size:17pt; color:#0d2a6e; margin-bottom:3pt; }
h2 { font-size:13pt; color:#0d2a6e; border-bottom:1pt solid #bbb; padding-bottom:3pt; margin:14pt 0 6pt; }
p  { margin-bottom:6pt; font-size:10pt; }
table { width:100%; border-collapse:collapse; margin-bottom:10pt; font-size:10pt; }
th { background:#0d2a6e; color:#fff; padding:4pt 6pt; text-align:left; }
td { padding:3pt 6pt; border-bottom:1pt solid #e0e0e0; }
tr:nth-child(even) td { background:#f4f6fb; }
.meta { font-size:9pt; color:#555; margin-bottom:12pt; }
.ok  { color:#165a29; background:#d4edda; padding:1pt 5pt; border-radius:2pt; }
.err { color:#721c24; background:#f8d7da; padding:1pt 5pt; border-radius:2pt; }
.footer { margin-top:18pt; font-size:8pt; color:#999; border-top:1pt solid #ddd; padding-top:5pt; }
ul { margin:4pt 0 8pt 14pt; font-size:10pt; }
li { margin-bottom:2pt; }
@media print { body { padding:12mm; } }
</style>
</head><body>
<h1>SIE 2028 . Sistema Inteligente Electoral</h1>
<p class="meta">
  Nivel: <b>${NIVEL_LABEL[nivel]}</b> &nbsp;.&nbsp;
  Corte: <b>${CORTE_LABEL[state.corte]||state.corte}</b> &nbsp;.&nbsp;
  Generado: <b>${now}</b>
</p>

<h2>Datos Base 2024</h2>
<table>
  <tr><th>Padron</th><td>${fmtInt(ins)}</td><th>Emitidos</th><td>${fmtInt(em)}</td></tr>
  <tr><th>Participacion</th><td>${fmtPct(part)}</td>
      <th>Abstencion</th><td>${fmtPct(1-part)} (${fmtInt(Math.round(ins*(1-part)))} votos)</td></tr>
</table>
<table>
  <tr><th>Partido</th><th>Votos</th><th>%</th>${dipCurTh}</tr>
  ${ranked.slice(0,10).map(({p,v,pct})=>`
    <tr><td>${p}</td><td>${fmtInt(v)}</td><td>${fmtPct(pct)}</td>${dipCurRow(p)}</tr>`).join("")}
</table>

${simSection}

<h2>Auditoria de Datos</h2>
<p>
  <span class="ok">OK ${audit.resumen.correctos} validaciones OK</span>
  &nbsp;&nbsp;
  <span class="err">! ${audit.resumen.errores} alertas</span>
</p>
${audit.issues.length ? `<ul>${audit.issues.map(i=>`<li>${i.msg}</li>`).join("")}</ul>` : ""}

<div class="footer">SIE 2028 . Sistema Inteligente Electoral . ${now} . Datos: JCE 2024</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Habilita ventanas emergentes para exportar PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

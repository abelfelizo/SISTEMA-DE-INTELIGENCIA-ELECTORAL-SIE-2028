/**
 * SIE 2028  core/dhondt.js
 * D'Hondt para una demarcacin.
 * votes: {partido: votos}  (integers, positivos)
 * seats: nmero de escaos a repartir
 * returns: { byParty: {partido: escaos}, threshold: cociente del ltimo escao }
 */
export function dhondt(votes, seats) {
  if (!seats || seats <= 0) return { byParty: {}, threshold: 0 };

  const parties = Object.keys(votes).filter(p => votes[p] > 0);
  const quotients = [];

  for (const p of parties) {
    for (let d = 1; d <= seats; d++) {
      quotients.push({ party: p, q: votes[p] / d });
    }
  }

  quotients.sort((a, b) => b.q - a.q);
  const top = quotients.slice(0, seats);

  const byParty = {};
  for (const p of parties) byParty[p] = 0;
  for (const t of top) byParty[t.party]++;

  return {
    byParty,
    threshold: top.length ? top[top.length - 1].q : 0,
  };
}

/**
 * Votos adicionales necesarios para que targetParty gane un escao ms.
 * Usa el estado actual de votos y seats.
 */
export function nextSeatVotes(votes, seats, targetParty) {
  const { byParty, threshold } = dhondt(votes, seats);
  const current = byParty[targetParty] || 0;
  const nextDiv = current + 1;
  const need = Math.ceil(threshold * nextDiv - (votes[targetParty] || 0));
  return Math.max(0, need);
}

/**
 * Corre D'Hondt para todas las circunscripciones de diputados.
 * curules: array de { provincia_id, circ, seats }
 * votesById: { "PP-circ": {partido: votos} }   si falta circ usa provincia
 * Devuelve { totalByParty, byCirc: { id: {byParty, seats} } }
 */
export function dhondtDip(curules, getVotesForCirc) {
  const totalByParty = {};
  const byCirc = {};

  for (const c of curules) {
    const id = c.circ > 0
      ? `${String(c.provincia_id).padStart(2,"0")}-${c.circ}`
      : String(c.provincia_id).padStart(2,"0");

    const votes = getVotesForCirc(id, c);
    const result = dhondt(votes, c.seats);

    byCirc[id] = { byParty: result.byParty, seats: c.seats, threshold: result.threshold };

    for (const [p, s] of Object.entries(result.byParty)) {
      totalByParty[p] = (totalByParty[p] || 0) + s;
    }
  }

  return { totalByParty, byCirc };
}

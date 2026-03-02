/**
 * SIE 2028  core/dhondt.js
 * D'Hondt para una demarcacin.
 * votes: {partido: votos}  (integers, positivos)
 * seats: nmero de escaos a repartir
 * returns: { byParty: {partido: escaos}, threshold: cociente del ltimo escao }
 */
export function dhondt(votes, seats) {
  if (!seats || seats <= 0) return { byParty: {}, threshold: 0 };

  var parties = Object.keys(votes).filter(p => votes[p] > 0);
  var quotients = [];

  for (var p of parties) {
    for (var d = 1; d <= seats; d++) {
      quotients.push({ party: p, q: votes[p] / d });
    }
  }

  quotients.sort((a, b) => b.q - a.q);
  var top = quotients.slice(0, seats);

  var byParty = {};
  for (var p of parties) byParty[p] = 0;
  for (var t of top) byParty[t.party]++;

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
  var { byParty, threshold } = dhondt(votes, seats);
  var current = byParty[targetParty] || 0;
  var nextDiv = current + 1;
  var need = Math.ceil(threshold * nextDiv - (votes[targetParty] || 0));
  return Math.max(0, need);
}

/**
 * Corre D'Hondt para todas las circunscripciones de diputados.
 * curules: array de { provincia_id, circ, seats }
 * votesById: { "PP-circ": {partido: votos} }   si falta circ usa provincia
 * Devuelve { totalByParty, byCirc: { id: {byParty, seats} } }
 */
export function dhondtDip(curules, getVotesForCirc) {
  var totalByParty = {};
  var byCirc = {};

  for (var c of curules) {
    var id = c.circ > 0
      ? `${String(c.provincia_id).padStart(2,"0")}-${c.circ}`
      : String(c.provincia_id).padStart(2,"0");

    var votes = getVotesForCirc(id, c);
    var result = dhondt(votes, c.seats);

    byCirc[id] = { byParty: result.byParty, seats: c.seats, threshold: result.threshold };

    for (var [p, s] of Object.entries(result.byParty)) {
      totalByParty[p] = (totalByParty[p] || 0) + s;
    }
  }

  return { totalByParty, byCirc };
}

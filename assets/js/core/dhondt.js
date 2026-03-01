
import {sum} from "./utils.js";

/**
 * D'Hondt for a single district.
 * votes: {party: votes}
 * seats: integer
 * returns {seatsByParty, quotientsTop}
 */
export function dhondt(votes, seats){
  const parties = Object.keys(votes).filter(p=>votes[p]>0);
  const quotients = [];
  for(const p of parties){
    for(let d=1; d<=seats; d++){
      quotients.push({party:p, q: votes[p]/d, d});
    }
  }
  quotients.sort((a,b)=>b.q-a.q);
  const top = quotients.slice(0, seats);
  const seatsByParty = {};
  for(const p of parties) seatsByParty[p]=0;
  for(const t of top) seatsByParty[t.party]+=1;
  return {seatsByParty, quotientsTop: top};
}

/**
 * Convenience: compute next-seat gap for a party.
 */
export function nextSeatGap(votes, seats, targetParty){
  const {quotientsTop} = dhondt(votes, seats);
  const last = quotientsTop[quotientsTop.length-1];
  // find current seats for party to get next divisor
  let currentSeats = 0;
  for(const t of quotientsTop) if(t.party===targetParty) currentSeats++;
  const nextDiv = currentSeats + 1;
  const need = last.q * nextDiv - votes[targetParty];
  return {lastWinner:last, currentSeats, nextDiv, votesNeeded: Math.max(0, Math.ceil(need))};
}

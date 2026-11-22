// Ranked-choice tabulation shared by the Worker (server) and the results site (browser).
//
//  seats === 1  → Instant-Runoff Voting (IRV): a candidate wins with a majority of the
//                 ballots still in play (continuing ballots).
//  seats  >  1  → Single Transferable Vote (STV): Droop quota, fractional (Gregory)
//                 surplus transfers, lowest-candidate elimination.
//
// Every round records a snapshot of the tallies, the decision taken, and the flow of
// votes that decision causes, so the results page can animate the count.

const EPS = 1e-9;

/**
 * @param {object} opts
 * @param {string[]} opts.candidates
 * @param {number}   opts.seats
 * @param {{ranking: string[], count?: number}[]} opts.ballots
 * @param {string}   [opts.tieSeed]  seed for last-resort tie breaks (use the election id)
 */
export function tabulate({ candidates, seats, ballots, tieSeed = '' }) {
  const names = [...new Set(candidates)];
  seats = Math.max(1, Math.min(Math.floor(seats) || 1, names.length));
  const known = new Set(names);

  // Each item is a group of identical ballots: weight starts at its count and is
  // reduced when the group carries part of an elected candidate's surplus.
  const items = [];
  for (const b of ballots) {
    const seen = new Set();
    const ranking = (b.ranking || []).filter((c) => known.has(c) && !seen.has(c) && seen.add(c));
    const count = b.count ?? 1;
    if (ranking.length && count > 0) items.push({ ranking, weight: count });
  }
  const totalValid = items.reduce((s, b) => s + b.weight, 0);

  const status = Object.fromEntries(names.map((c) => [c, 'continuing']));
  const locked = {}; // votes kept by elected candidates
  const winners = [];
  const rounds = [];
  const droop = seats > 1 ? Math.floor(totalValid / (seats + 1)) + 1 : null;
  const method = seats > 1 ? 'stv' : 'irv';

  const holderOf = (b) => b.ranking.find((c) => status[c] === 'continuing') ?? null;

  if (totalValid === 0) {
    return { method, seats, totalValid, quota: droop, winners, rounds, candidates: names };
  }

  for (let n = 1; n <= names.length * 2 + 2; n++) {
    const tallies = Object.fromEntries(names.map((c) => [c, 0]));
    let exhausted = 0;
    const holders = items.map((b) => {
      const h = holderOf(b);
      if (h) tallies[h] += b.weight;
      else exhausted += b.weight;
      return h;
    });
    for (const c of names) if (status[c] === 'elected') tallies[c] = locked[c];

    const continuing = names.filter((c) => status[c] === 'continuing');
    const continuingVotes = continuing.reduce((s, c) => s + tallies[c], 0);
    const seatsLeft = seats - winners.length;
    const quota = seats > 1 ? droop : Math.floor(continuingVotes / 2) + 1;

    const round = {
      number: n,
      tallies: roundAll(tallies),
      exhausted: round4(exhausted),
      quota,
      status: { ...status },
      action: null, // 'elected' | 'eliminated'
      reason: null, // 'quota' | 'remaining' | 'lowest'
      elected: [],
      eliminated: [],
      surplus: {}, // elected candidate → { surplus, factor }
      tieBreak: null,
      transfers: [], // { from, to (null = exhausted), votes }
    };
    rounds.push(round);

    // 1. Everyone still in the race fills the remaining seats.
    if (continuing.length <= seatsLeft) {
      const order = [...continuing].sort((a, b) => tallies[b] - tallies[a]);
      for (const c of order) {
        status[c] = 'elected';
        locked[c] = tallies[c];
        winners.push(c);
      }
      Object.assign(round, { action: 'elected', reason: 'remaining', elected: order });
      break;
    }

    // 2. Anyone at or above the quota is elected.
    const reached = continuing.filter((c) => tallies[c] >= quota - EPS).sort((a, b) => tallies[b] - tallies[a]);
    if (reached.length) {
      const toElect = reached.slice(0, seatsLeft);
      for (const c of toElect) {
        status[c] = 'elected';
        winners.push(c);
        const keep = seats > 1 ? quota : tallies[c];
        locked[c] = keep;
        const surplus = Math.max(0, tallies[c] - keep);
        round.surplus[c] = { surplus: round4(surplus), factor: tallies[c] > 0 ? surplus / tallies[c] : 0 };
      }
      Object.assign(round, { action: 'elected', reason: 'quota', elected: toElect });
      if (winners.length >= seats) break;

      // Transfer surpluses: every ballot held by a newly elected candidate moves on at
      // a reduced weight (Gregory method). Simultaneous for all candidates elected now.
      const flows = new Map();
      items.forEach((b, i) => {
        const from = holders[i];
        if (!from || !round.surplus[from]) return;
        b.weight *= round.surplus[from].factor;
        if (b.weight <= EPS) return;
        addFlow(flows, from, holderOf(b), b.weight);
      });
      round.transfers = flowList(flows);
      continue;
    }

    // 3. Nobody reached the quota: eliminate the lowest continuing candidate.
    const { loser, tieBreak } = pickLowest(continuing, tallies, rounds, tieSeed);
    status[loser] = 'eliminated';
    Object.assign(round, { action: 'eliminated', reason: 'lowest', eliminated: [loser], tieBreak });
    const flows = new Map();
    items.forEach((b, i) => {
      if (holders[i] === loser) addFlow(flows, loser, holderOf(b), b.weight);
    });
    round.transfers = flowList(flows);
  }

  return { method, seats, totalValid, quota: droop, winners, rounds, candidates: names };
}

function pickLowest(continuing, tallies, rounds, seed) {
  const min = Math.min(...continuing.map((c) => tallies[c]));
  let tied = continuing.filter((c) => tallies[c] <= min + EPS);
  if (tied.length === 1) return { loser: tied[0], tieBreak: null };

  // Backwards tie-break: the candidate who had fewer votes in the most recent earlier
  // round where the tied candidates differed is eliminated.
  for (let i = rounds.length - 2; i >= 0 && tied.length > 1; i--) {
    const t = rounds[i].tallies;
    const lo = Math.min(...tied.map((c) => t[c]));
    const next = tied.filter((c) => t[c] <= lo + EPS);
    if (next.length < tied.length) tied = next;
  }
  if (tied.length === 1) return { loser: tied[0], tieBreak: 'previous-round' };

  // Last resort: a deterministic "random" draw seeded by the election id so every
  // recount gives the same answer.
  tied.sort((a, b) => hash(seed + '\u0000' + a) - hash(seed + '\u0000' + b) || a.localeCompare(b));
  return { loser: tied[0], tieBreak: 'lot' };
}

function addFlow(flows, from, to, votes) {
  const key = from + '\u0000' + (to ?? '');
  const f = flows.get(key) || { from, to, votes: 0 };
  f.votes += votes;
  flows.set(key, f);
}

function flowList(flows) {
  return [...flows.values()]
    .map((f) => ({ ...f, votes: round4(f.votes) }))
    .filter((f) => f.votes > 0)
    .sort((a, b) => b.votes - a.votes);
}

function hash(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;
const roundAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round4(v)]));

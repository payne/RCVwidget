import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabulate } from '../public/js/tabulate.js';
import { DEMOS } from '../public/js/demos.js';

const run = (d) => tabulate({ ...d, tieSeed: d.id });

test('IRV demo: round-one leader loses after transfers', () => {
  const r = run(DEMOS.irv);
  assert.deepEqual(r.winners, ['Vanilla']);
  assert.equal(r.rounds.length, 3);
  assert.deepEqual(r.rounds[0].eliminated, ['Strawberry']);
  assert.deepEqual(r.rounds[1].eliminated, ['Mint']);
  const last = r.rounds[2];
  assert.equal(last.tallies.Vanilla, 51);
  assert.equal(last.tallies.Chocolate, 45);
  assert.equal(last.exhausted, 4);
  assert.equal(last.quota, 49); // majority of 96 continuing ballots
});

test('STV demo: surplus transfers and Droop quota', () => {
  const r = run(DEMOS.stv);
  assert.equal(r.quota, 31);
  assert.deepEqual(r.winners, ['Ava', 'Cara', 'Eve']);
  const r1 = r.rounds[0];
  assert.deepEqual(r1.elected, ['Ava']);
  assert.equal(r1.surplus.Ava.surplus, 9);
  assert.deepEqual(r1.transfers, [{ from: 'Ava', to: 'Ben', votes: 9 }]);
  assert.equal(r.rounds[1].tallies.Ben, 21);
  assert.equal(r.rounds[1].tallies.Ava, 31);
});

test('votes are conserved every round', () => {
  for (const d of Object.values(DEMOS)) {
    const r = run(d);
    for (const rd of r.rounds) {
      const sum = Object.values(rd.tallies).reduce((a, b) => a + b, 0) + rd.exhausted;
      assert.ok(Math.abs(sum - r.totalValid) < 0.01, `${d.id} round ${rd.number}: ${sum}`);
    }
  }
});

test('outright majority wins in round one', () => {
  const r = tabulate({
    candidates: ['A', 'B'],
    seats: 1,
    ballots: [{ ranking: ['A'], count: 3 }, { ranking: ['B'], count: 2 }],
  });
  assert.deepEqual(r.winners, ['A']);
  assert.equal(r.rounds.length, 1);
});

test('ties use earlier rounds, then a seeded draw that is repeatable', () => {
  const ballots = [
    { ranking: ['A'], count: 5 },
    { ranking: ['B'], count: 2 },
    { ranking: ['C'], count: 2 },
  ];
  const a = tabulate({ candidates: ['A', 'B', 'C'], seats: 1, ballots, tieSeed: 'x' });
  const b = tabulate({ candidates: ['A', 'B', 'C'], seats: 1, ballots, tieSeed: 'x' });
  assert.equal(a.rounds[0].tieBreak, null); // A has a majority immediately
  assert.deepEqual(a, b);

  const t = tabulate({
    candidates: ['A', 'B', 'C', 'D'],
    seats: 1,
    ballots: [
      { ranking: ['A'], count: 4 },
      { ranking: ['B'], count: 3 },
      { ranking: ['C'], count: 3 },
      { ranking: ['D', 'C'], count: 1 },
    ],
  });
  // Round 1 eliminates D → C gets 4, B has 3. B goes next without a tie.
  assert.deepEqual(t.rounds[0].eliminated, ['D']);
  assert.deepEqual(t.rounds[1].eliminated, ['B']);

  const lot = tabulate({
    candidates: ['A', 'B', 'C'],
    seats: 1,
    ballots: [{ ranking: ['A'], count: 2 }, { ranking: ['B'], count: 1 }, { ranking: ['C'], count: 1 }],
    tieSeed: 'seed',
  });
  assert.equal(lot.rounds[0].tieBreak, 'lot');
});

test('backward tie-break uses previous round', () => {
  const r = tabulate({
    candidates: ['A', 'B', 'C', 'D'],
    seats: 1,
    ballots: [
      { ranking: ['A'], count: 10 },
      { ranking: ['B'], count: 4 },
      { ranking: ['C'], count: 5 },
      { ranking: ['D', 'B'], count: 1 },
      { ranking: ['E'], count: 0 },
    ],
  });
  // R1: A10 B4 C5 D1 → D out, B→5. R2: B5 C5 tied; in R1 B had 4 < 5 → B out.
  assert.deepEqual(r.rounds[1].eliminated, ['B']);
  assert.equal(r.rounds[1].tieBreak, 'previous-round');
});

test('remaining candidates fill remaining seats', () => {
  const r = tabulate({
    candidates: ['A', 'B', 'C'],
    seats: 2,
    ballots: [{ ranking: ['A'], count: 2 }, { ranking: ['B'], count: 2 }, { ranking: ['C'], count: 1 }],
  });
  assert.deepEqual(new Set(r.winners), new Set(['A', 'B']));
});

test('empty and invalid ballots', () => {
  const r = tabulate({ candidates: ['A', 'B'], seats: 1, ballots: [{ ranking: ['Z'] }, { ranking: [] }] });
  assert.equal(r.totalValid, 0);
  assert.deepEqual(r.winners, []);
});

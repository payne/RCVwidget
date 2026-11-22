// Built-in sample elections. They are counted in the browser so the results page can
// teach without needing a real election in the database.
export const DEMOS = {
  irv: {
    id: 'demo-irv',
    title: 'Favorite Ice Cream (sample, 1 seat)',
    description:
      'Chocolate leads the first round but does not have a majority. Watch where the Strawberry and Mint ballots go.',
    candidates: ['Chocolate', 'Vanilla', 'Strawberry', 'Mint'],
    seats: 1,
    ballots: [
      { ranking: ['Chocolate', 'Mint'], count: 30 },
      { ranking: ['Vanilla', 'Strawberry'], count: 25 },
      { ranking: ['Strawberry', 'Vanilla'], count: 20 },
      { ranking: ['Mint', 'Chocolate', 'Vanilla'], count: 15 },
      { ranking: ['Mint', 'Strawberry', 'Vanilla'], count: 6 },
      { ranking: ['Mint'], count: 4 },
    ],
  },
  stv: {
    id: 'demo-stv',
    title: 'Student Council (sample, 3 seats)',
    description:
      'Three seats, six candidates, 120 voters. Ava is elected right away. Watch Ava’s extra votes move on as fractions of a vote.',
    candidates: ['Ava', 'Ben', 'Cara', 'Dan', 'Eve', 'Finn'],
    seats: 3,
    ballots: [
      { ranking: ['Ava', 'Ben', 'Cara'], count: 40 },
      { ranking: ['Ben', 'Ava'], count: 12 },
      { ranking: ['Cara', 'Dan'], count: 20 },
      { ranking: ['Dan', 'Cara', 'Eve'], count: 18 },
      { ranking: ['Eve', 'Finn', 'Dan'], count: 16 },
      { ranking: ['Finn', 'Eve'], count: 14 },
    ],
  },
};

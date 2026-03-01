import { calculateNewRatings } from './glicko2.js';

export async function updateRatings(client: any, player1Id: string, player2Id: string, winnerId: string | null) {
  // Lock user rows in consistent order to prevent deadlocks
  const [firstId, secondId] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
  const first = await client.query('SELECT id, rating, rating_deviation, rating_volatility FROM users WHERE id = $1 FOR UPDATE', [firstId]);
  const second = await client.query('SELECT id, rating, rating_deviation, rating_volatility FROM users WHERE id = $1 FOR UPDATE', [secondId]);

  const p1Data = first.rows[0].id === player1Id ? first.rows[0] : second.rows[0];
  const p2Data = first.rows[0].id === player1Id ? second.rows[0] : first.rows[0];

  const outcome = winnerId === player1Id ? 1 : winnerId === player2Id ? -1 : 0;
  const newRatings = calculateNewRatings(
    { rating: p1Data.rating, deviation: p1Data.rating_deviation, volatility: p1Data.rating_volatility },
    { rating: p2Data.rating, deviation: p2Data.rating_deviation, volatility: p2Data.rating_volatility },
    outcome as 1 | 0 | -1,
  );

  await client.query(
    'UPDATE users SET rating = $1, rating_deviation = $2, rating_volatility = $3 WHERE id = $4',
    [newRatings.player1.rating, newRatings.player1.deviation, newRatings.player1.volatility, player1Id],
  );
  await client.query(
    'UPDATE users SET rating = $1, rating_deviation = $2, rating_volatility = $3 WHERE id = $4',
    [newRatings.player2.rating, newRatings.player2.deviation, newRatings.player2.volatility, player2Id],
  );
}

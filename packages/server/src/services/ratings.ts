import { calculateNewRatings } from './glicko2.js';
import type { PoolClient } from '../types.js';

export interface RatingChangeResult {
  player1: { ratingBefore: number; ratingAfter: number; rankBefore: number; rankAfter: number };
  player2: { ratingBefore: number; ratingAfter: number; rankBefore: number; rankAfter: number };
}

async function getPlayerRank(client: PoolClient, rating: number): Promise<number> {
  const result = await client.query(
    'SELECT COUNT(*) FROM users WHERE rating > $1 AND rating_deviation < 350',
    [rating],
  );
  return parseInt(result.rows[0].count, 10) + 1;
}

export async function updateRatings(client: PoolClient, player1Id: string | null, player2Id: string | null, winnerId: string | null): Promise<RatingChangeResult | undefined> {
  if (player1Id == null || player2Id == null) return;
  // Lock user rows in consistent order to prevent deadlocks
  const [firstId, secondId] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
  const first = await client.query('SELECT id, rating, rating_deviation, rating_volatility FROM users WHERE id = $1 FOR UPDATE', [firstId]);
  const second = await client.query('SELECT id, rating, rating_deviation, rating_volatility FROM users WHERE id = $1 FOR UPDATE', [secondId]);

  const p1Data = first.rows[0].id === player1Id ? first.rows[0] : second.rows[0];
  const p2Data = first.rows[0].id === player1Id ? second.rows[0] : first.rows[0];

  // Capture before ratings
  const p1RatingBefore = p1Data.rating;
  const p2RatingBefore = p2Data.rating;

  // Compute ranks before update
  const p1RankBefore = await getPlayerRank(client, p1RatingBefore);
  const p2RankBefore = await getPlayerRank(client, p2RatingBefore);

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

  // Compute ranks after update
  const p1RankAfter = await getPlayerRank(client, newRatings.player1.rating);
  const p2RankAfter = await getPlayerRank(client, newRatings.player2.rating);

  return {
    player1: { ratingBefore: p1RatingBefore, ratingAfter: newRatings.player1.rating, rankBefore: p1RankBefore, rankAfter: p1RankAfter },
    player2: { ratingBefore: p2RatingBefore, ratingAfter: newRatings.player2.rating, rankBefore: p2RankBefore, rankAfter: p2RankAfter },
  };
}

export async function storeRatingChanges(client: PoolClient, gameId: string, changes: RatingChangeResult): Promise<void> {
  await client.query(
    `UPDATE games SET
      player1_rating_before = $1, player1_rating_after = $2,
      player1_rank_before = $3, player1_rank_after = $4,
      player2_rating_before = $5, player2_rating_after = $6,
      player2_rank_before = $7, player2_rank_after = $8
    WHERE id = $9`,
    [
      changes.player1.ratingBefore, changes.player1.ratingAfter,
      changes.player1.rankBefore, changes.player1.rankAfter,
      changes.player2.ratingBefore, changes.player2.ratingAfter,
      changes.player2.rankBefore, changes.player2.rankAfter,
      gameId,
    ],
  );
}

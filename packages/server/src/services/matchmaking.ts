import pool from '../db/pool.js';
import { sendEvent } from './sse.js';
import { initializeGame, drawTilesForPlayer2 } from './gameEngine.js';

export async function enterQueue(userId: string, rating: number, ratingDeviation: number): Promise<{ matched: boolean; gameId?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Try to find a match first
    const matchResult = await client.query(
      `SELECT id, user_id, rating FROM matchmaking_queue
       WHERE user_id != $1
       AND rating BETWEEN $2 - (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
                    AND $2 + (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
       ORDER BY ABS(rating - $2) ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [userId, rating],
    );

    if (matchResult.rows.length > 0) {
      const opponent = matchResult.rows[0];

      // Remove opponent from queue
      await client.query('DELETE FROM matchmaking_queue WHERE id = $1', [opponent.id]);
      // Remove self from queue if present
      await client.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);

      // Create game
      const game = initializeGame(userId);
      const { rack: player2Rack, remainingBag } = drawTilesForPlayer2(game.tileBag);

      const gameResult = await client.query(
        `INSERT INTO games (player1_id, player2_id, board_state, tile_bag, player1_rack, player2_rack, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
        [userId, opponent.user_id, JSON.stringify(game.board), JSON.stringify(remainingBag),
         JSON.stringify(game.player1Rack), JSON.stringify(player2Rack)],
      );

      const gameId = gameResult.rows[0].id;
      await client.query('COMMIT');

      // Notify both players (after commit)
      sendEvent(userId, 'match_found', { gameId });
      sendEvent(opponent.user_id, 'match_found', { gameId });

      return { matched: true, gameId };
    }

    // No match found, enter queue
    await client.query(
      'INSERT INTO matchmaking_queue (user_id, rating, rating_deviation) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
      [userId, rating, ratingDeviation],
    );
    await client.query('COMMIT');
    return { matched: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function leaveQueue(userId: string): Promise<void> {
  await pool.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GARDEN-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export { generateInviteCode };

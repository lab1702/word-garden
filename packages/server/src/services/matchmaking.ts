import pool from '../db/pool.js';
import { sendEvent } from './sse.js';
import { initializeGame, drawTilesForPlayer2 } from './gameEngine.js';

export async function enterQueue(userId: string, rating: number, ratingDeviation: number): Promise<{ matched: boolean; gameId?: string }> {
  // Try to find a match first
  const match = await findMatch(userId, rating);
  if (match) {
    return { matched: true, gameId: match };
  }

  // No match found, enter queue
  await pool.query(
    'INSERT INTO matchmaking_queue (user_id, rating, rating_deviation) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
    [userId, rating, ratingDeviation],
  );
  return { matched: false };
}

export async function leaveQueue(userId: string): Promise<void> {
  await pool.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);
}

async function findMatch(userId: string, rating: number): Promise<string | null> {
  // Look for a player in queue within rating range
  const result = await pool.query(
    `SELECT id, user_id, rating FROM matchmaking_queue
     WHERE user_id != $1
     AND rating BETWEEN $2 - (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
                  AND $2 + (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
     ORDER BY ABS(rating - $2) ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [userId, rating],
  );

  if (result.rows.length === 0) return null;

  const opponent = result.rows[0];

  // Remove opponent from queue
  await pool.query('DELETE FROM matchmaking_queue WHERE id = $1', [opponent.id]);
  // Remove self from queue if present
  await pool.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);

  // Create game
  const game = initializeGame(userId);
  const { rack: player2Rack, remainingBag } = drawTilesForPlayer2(game.tileBag);

  const gameResult = await pool.query(
    `INSERT INTO games (player1_id, player2_id, board_state, tile_bag, player1_rack, player2_rack, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
    [userId, opponent.user_id, JSON.stringify(game.board), JSON.stringify(remainingBag),
     JSON.stringify(game.player1Rack), JSON.stringify(player2Rack)],
  );

  const gameId = gameResult.rows[0].id;

  // Notify both players
  sendEvent(userId, 'match_found', { gameId });
  sendEvent(opponent.user_id, 'match_found', { gameId });

  return gameId;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GARDEN-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export { generateInviteCode };

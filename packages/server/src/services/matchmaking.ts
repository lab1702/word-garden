import { randomInt } from 'node:crypto';
import pool from '../db/pool.js';
import { sendEvent } from './sse.js';
import { initializeGame, drawTilesForPlayer2 } from './gameEngine.js';

export async function enterQueue(userId: string, rating: number, ratingDeviation: number): Promise<{ matched: boolean; gameId?: string; busy?: boolean }> {
  const client = await pool.connect();
  let notification: { opponentId: string; gameId: string } | null = null;

  try {
    await client.query('BEGIN');

    const lockResult = await client.query('SELECT pg_try_advisory_lock(42) AS acquired');
    if (!lockResult.rows[0].acquired) {
      await client.query('ROLLBACK');
      return { matched: false, busy: true };
    }

    try {
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
        const game = initializeGame();
        const { rack: player2Rack, remainingBag } = drawTilesForPlayer2(game.tileBag);

        const gameResult = await client.query(
          `INSERT INTO games (player1_id, player2_id, board_state, tile_bag, player1_rack, player2_rack, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
          [userId, opponent.user_id, JSON.stringify(game.board), JSON.stringify(remainingBag),
           JSON.stringify(game.player1Rack), JSON.stringify(player2Rack)],
        );

        const gameId = gameResult.rows[0].id;
        await client.query('COMMIT');
        notification = { opponentId: opponent.user_id, gameId };
        return { matched: true, gameId };
      }

      // No match found, enter queue
      await client.query(
        'INSERT INTO matchmaking_queue (user_id, rating, rating_deviation) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING',
        [userId, rating, ratingDeviation],
      );
      await client.query('COMMIT');
      return { matched: false };
    } finally {
      await client.query('SELECT pg_advisory_unlock(42)');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();

    // Send notifications after releasing connection and lock
    if (notification) {
      sendEvent(userId, 'match_found', { gameId: notification.gameId });
      sendEvent(notification.opponentId, 'match_found', { gameId: notification.gameId });
    }
  }
}

export async function sweepQueue(): Promise<void> {
  const matched = new Set<string>();
  const notifications: Array<{ userId: string; opponentId: string; gameId: string }> = [];

  const client = await pool.connect();
  try {
    // Acquire advisory lock to prevent race with enterQueue
    const lockResult = await client.query('SELECT pg_try_advisory_lock(42) AS acquired');
    if (!lockResult.rows[0].acquired) {
      return; // Another sweep is running
    }

    try {
      const { rows: entries } = await client.query(
        'SELECT id, user_id, rating FROM matchmaking_queue ORDER BY queued_at ASC',
      );

      for (const entry of entries) {
        if (matched.has(entry.user_id)) continue;

        const excludeIds = [entry.user_id, ...matched];

        try {
          await client.query('BEGIN');

          const matchResult = await client.query(
            `SELECT id, user_id, rating FROM matchmaking_queue
             WHERE user_id != $1
             AND user_id != ALL($3::uuid[])
             AND rating BETWEEN $2 - (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
                          AND $2 + (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
             ORDER BY ABS(rating - $2) ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
            [entry.user_id, entry.rating, excludeIds],
          );

          if (matchResult.rows.length > 0) {
            const opponent = matchResult.rows[0];

            // Remove both from queue
            await client.query('DELETE FROM matchmaking_queue WHERE user_id = ANY($1::uuid[])', [
              [entry.user_id, opponent.user_id],
            ]);

            // Create game
            const game = initializeGame();
            const { rack: player2Rack, remainingBag } = drawTilesForPlayer2(game.tileBag);

            const gameResult = await client.query(
              `INSERT INTO games (player1_id, player2_id, board_state, tile_bag, player1_rack, player2_rack, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
              [entry.user_id, opponent.user_id, JSON.stringify(game.board), JSON.stringify(remainingBag),
               JSON.stringify(game.player1Rack), JSON.stringify(player2Rack)],
            );

            const gameId = gameResult.rows[0].id;
            await client.query('COMMIT');

            matched.add(entry.user_id);
            matched.add(opponent.user_id);

            notifications.push({ userId: entry.user_id, opponentId: opponent.user_id, gameId });
          } else {
            await client.query('COMMIT');
          }
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('sweepQueue error for user', entry.user_id, err);
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(42)');
    }
  } finally {
    client.release();
  }

  // Send SSE notifications after releasing the connection
  for (const { userId, opponentId, gameId } of notifications) {
    sendEvent(userId, 'match_found', { gameId });
    sendEvent(opponentId, 'match_found', { gameId });
  }
}

export async function leaveQueue(userId: string): Promise<void> {
  await pool.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [userId]);
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GARDEN-';
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

export { generateInviteCode };

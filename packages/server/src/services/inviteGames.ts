import pool from '../db/pool.js';
import { initializeGame } from './gameEngine.js';
import { generateInviteCode } from './matchmaking.js';

export const MAX_WAITING_GAMES = 5;

export class WaitingGameLimitError extends Error {
  constructor() {
    super(`Too many waiting games (max ${MAX_WAITING_GAMES})`);
    this.name = 'WaitingGameLimitError';
  }
}

export async function createWaitingGame(userId: string): Promise<{ id: string; inviteCode: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent creates for this user so the cap is enforced atomically.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`waiting-game:${userId}`]);

    const countResult = await client.query(
      "SELECT COUNT(*) FROM games WHERE player1_id = $1 AND status = 'waiting'",
      [userId],
    );
    if (parseInt(countResult.rows[0].count, 10) >= MAX_WAITING_GAMES) {
      throw new WaitingGameLimitError();
    }

    const game = initializeGame();
    let inserted: { id: string; invite_code: string } | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const inviteCode = generateInviteCode();
      await client.query('SAVEPOINT invite_attempt');
      try {
        const result = await client.query(
          `INSERT INTO games (player1_id, board_state, tile_bag, player1_rack, invite_code, status)
           VALUES ($1, $2, $3, $4, $5, 'waiting') RETURNING id, invite_code`,
          [userId, JSON.stringify(game.board), JSON.stringify(game.tileBag),
           JSON.stringify(game.player1Rack), inviteCode],
        );
        inserted = result.rows[0];
        await client.query('RELEASE SAVEPOINT invite_attempt');
        break;
      } catch (err: any) {
        await client.query('ROLLBACK TO SAVEPOINT invite_attempt');
        if (err.code === '23505' && attempt < 2) continue;
        throw err;
      }
    }

    await client.query('COMMIT');
    return { id: inserted!.id, inviteCode: inserted!.invite_code };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already ended */ }
    throw err;
  } finally {
    client.release();
  }
}

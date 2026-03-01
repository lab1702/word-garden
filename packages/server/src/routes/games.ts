import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { initializeGame, drawTilesForPlayer2 } from '../services/gameEngine.js';
import { enterQueue, leaveQueue, generateInviteCode } from '../services/matchmaking.js';
import { sendEvent, broadcastEvent } from '../services/sse.js';
import { updateRatings, storeRatingChanges } from '../services/ratings.js';
import { handlePlayMove, handlePassMove, handleExchangeMove } from '../services/moveHandlers.js';
import type { Tile } from '@word-garden/shared';

const router = Router();

const gameLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

router.use(gameLimiter);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_CODE_RE = /^GARDEN-[A-HJ-NP-Z2-9]{6}$/;

// POST /games — create a new game with invite code
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const waitingCount = await pool.query(
      "SELECT COUNT(*) FROM games WHERE player1_id = $1 AND status = 'waiting'",
      [userId],
    );
    if (parseInt(waitingCount.rows[0].count, 10) >= 5) {
      res.status(400).json({ error: 'Too many waiting games (max 5)' });
      return;
    }

    const game = initializeGame();

    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        result = await pool.query(
          `INSERT INTO games (player1_id, board_state, tile_bag, player1_rack, invite_code, status)
           VALUES ($1, $2, $3, $4, $5, 'waiting') RETURNING id, invite_code`,
          [userId, JSON.stringify(game.board), JSON.stringify(game.tileBag),
           JSON.stringify(game.player1Rack), inviteCode],
        );
        break;
      } catch (err: any) {
        if (err.code === '23505' && attempt < 2) continue;
        throw err;
      }
    }

    res.json({ id: result!.rows[0].id, inviteCode: result!.rows[0].invite_code });
  } catch (err) {
    console.error('Create game error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /games/join/:inviteCode
router.post('/join/:inviteCode', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const inviteCode = req.params.inviteCode as string;
  if (!INVITE_CODE_RE.test(inviteCode)) {
    res.status(400).json({ error: 'Invalid invite code format' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      `SELECT * FROM games WHERE invite_code = $1 AND status = 'waiting' FOR UPDATE`,
      [inviteCode],
    );

    if (gameResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Game not found or already started' });
      return;
    }

    const game = gameResult.rows[0];
    if (game.player1_id === userId) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Cannot join your own game' });
      return;
    }

    const tileBag: Tile[] = game.tile_bag;
    const { rack, remainingBag } = drawTilesForPlayer2(tileBag);

    await client.query(
      `UPDATE games SET player2_id = $1, player2_rack = $2, tile_bag = $3, status = 'active', updated_at = NOW()
       WHERE id = $4`,
      [userId, JSON.stringify(rack), JSON.stringify(remainingBag), game.id],
    );

    await client.query('COMMIT');

    sendEvent(game.player1_id, 'game_started', { gameId: game.id });
    res.json({ id: game.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Join game error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

// POST /games/matchmake
router.post('/matchmake', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const userResult = await pool.query('SELECT rating, rating_deviation FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    const user = userResult.rows[0];

    const result = await enterQueue(userId, user.rating, user.rating_deviation);
    if (result.busy) {
      res.status(503).json({ error: 'Matchmaking busy, please retry shortly' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('Matchmake error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /games/matchmake
router.delete('/matchmake', requireAuth, async (req, res) => {
  await leaveQueue(req.user!.userId);
  res.json({ ok: true });
});

// DELETE /games/:id — cancel a waiting game
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id as string;
    if (!UUID_RE.test(gameId)) {
      res.status(400).json({ error: 'Invalid game ID' });
      return;
    }
    const userId = req.user!.userId;

    const result = await pool.query(
      `DELETE FROM games WHERE id = $1 AND player1_id = $2 AND status = 'waiting' RETURNING id`,
      [gameId, userId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Game not found or already started' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel game error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /games — list active/recent games
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const result = await pool.query(
      `SELECT g.id, g.player1_id, g.player2_id, g.player1_score, g.player2_score,
              g.current_turn, g.status, g.updated_at, g.invite_code,
              u1.username as player1_username, u1.rating as player1_rating,
              u2.username as player2_username, u2.rating as player2_rating
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.player1_id = $1 OR g.player2_id = $1
       ORDER BY g.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const games = result.rows.map((g: any) => {
      const isPlayer1 = g.player1_id === userId;
      return {
        id: g.id,
        opponentUsername: isPlayer1 ? (g.player2_username ?? 'Deleted') : (g.player1_username ?? 'Deleted'),
        opponentRating: isPlayer1 ? (g.player2_rating ?? null) : (g.player1_rating ?? null),
        playerScore: isPlayer1 ? g.player1_score : g.player2_score,
        opponentScore: isPlayer1 ? g.player2_score : g.player1_score,
        isYourTurn: g.status === 'active' && ((isPlayer1 && g.current_turn === 1) || (!isPlayer1 && g.current_turn === 2)),
        status: g.status,
        inviteCode: g.status === 'waiting' ? g.invite_code : null,
        updatedAt: g.updated_at,
      };
    });

    res.json(games);
  } catch (err) {
    console.error('List games error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /games/:id — get game state
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const gameId = req.params.id as string;
    if (!UUID_RE.test(gameId)) {
      res.status(400).json({ error: 'Invalid game ID' });
      return;
    }
    const userId = req.user!.userId;
    const gameResult = await pool.query(
      `SELECT g.*, u1.username as player1_username, u1.rating as player1_rating,
              u2.username as player2_username, u2.rating as player2_rating
       FROM games g
       LEFT JOIN users u1 ON g.player1_id = u1.id
       LEFT JOIN users u2 ON g.player2_id = u2.id
       WHERE g.id = $1`,
      [gameId],
    );

    if (gameResult.rows.length === 0) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const g = gameResult.rows[0];
    const isPlayer1 = g.player1_id === userId;
    const isPlayer2 = g.player2_id === userId;
    if (!isPlayer1 && !isPlayer2) {
      res.status(403).json({ error: 'Not a participant in this game' });
      return;
    }

    // Get last two moves (to show score gained for both players)
    const lastMovesResult = await pool.query(
      'SELECT * FROM moves WHERE game_id = $1 ORDER BY created_at DESC LIMIT 2',
      [g.id],
    );

    const lastMove = lastMovesResult.rows[0] ?? null;
    const previousMove = lastMovesResult.rows[1] ?? null;

    res.json({
      id: g.id,
      playerNumber: isPlayer1 ? 1 : 2,
      opponentUsername: isPlayer1 ? (g.player2_username ?? 'Deleted') : (g.player1_username ?? 'Deleted'),
      opponentRating: isPlayer1 ? (g.player2_rating ?? null) : (g.player1_rating ?? null),
      board: g.board_state,
      currentTurn: g.current_turn,
      player1Score: g.player1_score,
      player2Score: g.player2_score,
      status: g.status,
      winnerId: g.winner_id,
      rack: isPlayer1 ? g.player1_rack : g.player2_rack,
      tilesRemaining: g.tile_bag.length,
      opponentTileCount: (isPlayer1 ? g.player2_rack : g.player1_rack)?.length ?? 0,
      lastMove: lastMove ? {
        playerId: lastMove.player_id,
        moveType: lastMove.move_type,
        tilesPlaced: lastMove.tiles_placed,
        wordsFormed: lastMove.words_formed,
        totalScore: lastMove.score,
        createdAt: lastMove.created_at,
      } : null,
      previousMove: previousMove ? {
        playerId: previousMove.player_id,
        moveType: previousMove.move_type,
        tilesPlaced: previousMove.tiles_placed,
        wordsFormed: previousMove.words_formed,
        totalScore: previousMove.score,
        createdAt: previousMove.created_at,
      } : null,
      ratingChanges: g.status === 'finished' && g.player1_rating_before != null ? {
        me: {
          ratingBefore: Math.round(isPlayer1 ? g.player1_rating_before : g.player2_rating_before),
          ratingAfter: Math.round(isPlayer1 ? g.player1_rating_after : g.player2_rating_after),
          rankBefore: isPlayer1 ? g.player1_rank_before : g.player2_rank_before,
          rankAfter: isPlayer1 ? g.player1_rank_after : g.player2_rank_after,
        },
        opponent: {
          ratingBefore: Math.round(isPlayer1 ? g.player2_rating_before : g.player1_rating_before),
          ratingAfter: Math.round(isPlayer1 ? g.player2_rating_after : g.player1_rating_after),
          rankBefore: isPlayer1 ? g.player2_rank_before : g.player1_rank_before,
          rankAfter: isPlayer1 ? g.player2_rank_after : g.player1_rank_after,
        },
      } : null,
    });
  } catch (err) {
    console.error('Get game error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /games/:id/move
router.post('/:id/move', requireAuth, async (req, res) => {
  const gameId = req.params.id as string;
  if (!UUID_RE.test(gameId)) {
    res.status(400).json({ error: 'Invalid game ID' });
    return;
  }
  const userId = req.user!.userId;
  const { moveType, tiles, exchangeTiles } = req.body;

  if (!['play', 'pass', 'exchange'].includes(moveType)) {
    res.status(400).json({ error: 'moveType must be play, pass, or exchange' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      'SELECT * FROM games WHERE id = $1 FOR UPDATE',
      [gameId],
    );

    if (gameResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const g = gameResult.rows[0];
    if (g.status !== 'active') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Game is not active' });
      return;
    }

    const isPlayer1 = g.player1_id === userId;
    const isPlayer2 = g.player2_id === userId;
    if (!isPlayer1 && !isPlayer2) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Not a participant' });
      return;
    }

    const playerNum = isPlayer1 ? 1 : 2;
    if (g.current_turn !== playerNum) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Not your turn' });
      return;
    }

    let result;
    if (moveType === 'play') {
      result = await handlePlayMove(client, g, userId, tiles);
    } else if (moveType === 'pass') {
      result = await handlePassMove(client, g, userId);
    } else {
      result = await handleExchangeMove(client, g, userId, exchangeTiles);
    }

    if (result.type === 'error') {
      await client.query('ROLLBACK');
      res.status(result.status).json({ error: result.error });
      return;
    }

    await client.query('COMMIT');

    // Post-commit notifications
    if (moveType === 'play') {
      const r = result as { type: 'success'; score: number; wordScores: any; bingo: boolean; newRack: any; gameOver: boolean; opponentId: string };
      try { sendEvent(r.opponentId, r.gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id }); }
      catch (e) { console.error('SSE notification failed:', e); }
      if (r.gameOver) { try { broadcastEvent('leaderboard_updated', {}); } catch {} }
      res.json({ score: r.score, wordScores: r.wordScores, bingo: r.bingo, newRack: r.newRack, gameOver: r.gameOver });
    } else if (moveType === 'pass') {
      const r = result as { type: 'success'; gameOver: boolean; opponentId: string };
      try { sendEvent(r.opponentId, r.gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id }); }
      catch (e) { console.error('SSE notification failed:', e); }
      if (r.gameOver) { try { broadcastEvent('leaderboard_updated', {}); } catch {} }
      res.json({ gameOver: r.gameOver });
    } else {
      const r = result as { type: 'success'; newRack: any; opponentId: string };
      try { sendEvent(r.opponentId, 'opponent_moved', { gameId: g.id }); }
      catch (e) { console.error('SSE notification failed:', e); }
      res.json({ newRack: r.newRack, gameOver: false });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Move error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

// POST /games/:id/resign
router.post('/:id/resign', requireAuth, async (req, res) => {
  const gameId = req.params.id as string;
  if (!UUID_RE.test(gameId)) {
    res.status(400).json({ error: 'Invalid game ID' });
    return;
  }
  const userId = req.user!.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      'SELECT * FROM games WHERE id = $1 FOR UPDATE',
      [gameId],
    );

    if (gameResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const g = gameResult.rows[0];
    if (g.status !== 'active') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Game is not active' });
      return;
    }

    const isPlayer1 = g.player1_id === userId;
    const isPlayer2 = g.player2_id === userId;
    if (!isPlayer1 && !isPlayer2) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Not a participant' });
      return;
    }

    if (g.player1_id == null || g.player2_id == null) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Game is no longer valid' });
      return;
    }

    const winnerId = isPlayer1 ? g.player2_id : g.player1_id;

    await client.query(
      `UPDATE games SET status = 'finished', winner_id = $1, updated_at = NOW() WHERE id = $2`,
      [winnerId, g.id],
    );
    const ratingChanges = await updateRatings(client, g.player1_id, g.player2_id, winnerId);
    if (ratingChanges) await storeRatingChanges(client, g.id, ratingChanges);
    await client.query('COMMIT');

    const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
    if (opponentId) {
      try { sendEvent(opponentId, 'game_finished', { gameId: g.id }); }
      catch (e) { console.error('SSE notification failed:', e); }
    }
    try { broadcastEvent('leaderboard_updated', {}); } catch {}
    res.json({ ok: true });
    return;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Resign error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

export default router;

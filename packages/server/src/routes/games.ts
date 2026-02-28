import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { initializeGame, drawTilesForPlayer2, validatePlacement, findFormedWords, scoreMove } from '../services/gameEngine.js';
import { isValidWord } from '../services/dictionary.js';
import { enterQueue, leaveQueue, generateInviteCode } from '../services/matchmaking.js';
import { sendEvent } from '../services/sse.js';
import { calculateNewRatings } from '../services/glicko2.js';
import { RACK_SIZE, MAX_CONSECUTIVE_PASSES, TILE_DISTRIBUTION } from '@word-garden/shared';
import type { TilePlacement, Tile } from '@word-garden/shared';

const LETTER_POINTS = new Map(
  TILE_DISTRIBUTION.map(({ letter, points }) => [letter.toUpperCase(), points]),
);

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

// POST /games — create a new game with invite code
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const game = initializeGame(userId);

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
});

// POST /games/join/:inviteCode
router.post('/join/:inviteCode', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { inviteCode } = req.params;

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
  const userId = req.user!.userId;
  const userResult = await pool.query('SELECT rating, rating_deviation FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];

  const result = await enterQueue(userId, user.rating, user.rating_deviation);
  res.json(result);
});

// DELETE /games/matchmake
router.delete('/matchmake', requireAuth, async (req, res) => {
  await leaveQueue(req.user!.userId);
  res.json({ ok: true });
});

// GET /games — list active/recent games
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const result = await pool.query(
    `SELECT g.id, g.player1_id, g.player2_id, g.player1_score, g.player2_score,
            g.current_turn, g.status, g.updated_at, g.invite_code,
            u1.username as player1_username, u1.rating as player1_rating,
            u2.username as player2_username, u2.rating as player2_rating
     FROM games g
     JOIN users u1 ON g.player1_id = u1.id
     LEFT JOIN users u2 ON g.player2_id = u2.id
     WHERE g.player1_id = $1 OR g.player2_id = $1
     ORDER BY g.updated_at DESC
     LIMIT 20`,
    [userId],
  );

  const games = result.rows.map((g: any) => {
    const isPlayer1 = g.player1_id === userId;
    return {
      id: g.id,
      opponentUsername: isPlayer1 ? g.player2_username : g.player1_username,
      opponentRating: isPlayer1 ? g.player2_rating : g.player1_rating,
      playerScore: isPlayer1 ? g.player1_score : g.player2_score,
      opponentScore: isPlayer1 ? g.player2_score : g.player1_score,
      isYourTurn: g.status === 'active' && ((isPlayer1 && g.current_turn === 1) || (!isPlayer1 && g.current_turn === 2)),
      status: g.status,
      inviteCode: g.status === 'waiting' ? g.invite_code : null,
      updatedAt: g.updated_at,
    };
  });

  res.json(games);
});

// GET /games/:id — get game state
router.get('/:id', requireAuth, async (req, res) => {
  const gameId = req.params.id as string;
  if (!UUID_RE.test(gameId)) {
    res.status(400).json({ error: 'Invalid game ID' });
    return;
  }
  const userId = req.user!.userId;
  const gameResult = await pool.query(
    `SELECT g.*, u1.username as player1_username, u2.username as player2_username
     FROM games g
     JOIN users u1 ON g.player1_id = u1.id
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

  // Get last move
  const lastMoveResult = await pool.query(
    'SELECT * FROM moves WHERE game_id = $1 ORDER BY created_at DESC LIMIT 1',
    [g.id],
  );

  const lastMove = lastMoveResult.rows[0] ?? null;

  res.json({
    id: g.id,
    playerNumber: isPlayer1 ? 1 : 2,
    opponentUsername: isPlayer1 ? g.player2_username : g.player1_username,
    board: g.board_state,
    currentTurn: g.current_turn,
    player1Score: g.player1_score,
    player2Score: g.player2_score,
    status: g.status,
    winnerId: g.winner_id,
    rack: isPlayer1 ? g.player1_rack : g.player2_rack,
    tilesRemaining: g.tile_bag.length,
    lastMove: lastMove ? {
      playerId: lastMove.player_id,
      moveType: lastMove.move_type,
      tilesPlaced: lastMove.tiles_placed,
      wordsFormed: lastMove.words_formed,
      totalScore: lastMove.score,
      createdAt: lastMove.created_at,
    } : null,
  });
});

// POST /games/:id/move
router.post('/:id/move', requireAuth, async (req, res) => {
  const gameId = req.params.id as string;
  if (!UUID_RE.test(gameId)) {
    res.status(400).json({ error: 'Invalid game ID' });
    return;
  }
  const userId = req.user!.userId;
  const { moveType, tiles, exchangeTiles } = req.body as {
    moveType: 'play' | 'pass' | 'exchange';
    tiles?: TilePlacement[];
    exchangeTiles?: number[]; // indices into rack
  };

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

    const board = g.board_state;
    const rack: Tile[] = isPlayer1 ? g.player1_rack : g.player2_rack;
    let tileBag: Tile[] = g.tile_bag;
    const isFirstMove = board.every((row: any[]) => row.every((cell: any) => cell.tile === null));

    if (moveType === 'play') {
      if (!tiles || tiles.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'No tiles provided' });
        return;
      }

      // Validate tiles are in player's rack
      const rackCopy = [...rack];
      for (const t of tiles) {
        const idx = rackCopy.findIndex(r =>
          t.isBlank ? r.letter === '' : r.letter === t.letter
        );
        if (idx === -1) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: `Tile ${t.letter} not in your rack` });
          return;
        }
        rackCopy.splice(idx, 1);
      }

      // Validate placement
      const validation = validatePlacement(board, tiles, isFirstMove);
      if (!validation.valid) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: validation.error });
        return;
      }

      // Check all formed words are valid
      const words = findFormedWords(board, tiles);
      for (const w of words) {
        if (!isValidWord(w.word)) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: `"${w.word}" is not a valid word` });
          return;
        }
      }

      // Score the move
      const scoreResult = scoreMove(board, tiles);

      // Update board
      for (const t of tiles) {
        board[t.row][t.col].tile = {
          letter: t.letter,
          points: t.isBlank ? 0 : (LETTER_POINTS.get(t.letter.toUpperCase()) ?? 0),
        };
      }

      // Draw new tiles
      const newRack = [...rackCopy];
      const drawCount = Math.min(tiles.length, tileBag.length);
      for (let i = 0; i < drawCount; i++) {
        newRack.push(tileBag.shift()!);
      }

      // Update scores
      const rackField = isPlayer1 ? 'player1_rack' : 'player2_rack';
      const newScore = (isPlayer1 ? g.player1_score : g.player2_score) + scoreResult.totalScore;

      // Check if game is over (player used all tiles and bag is empty)
      let gameOver = false;
      let winnerId = null;
      let p1Score = isPlayer1 ? newScore : g.player1_score;
      let p2Score = isPlayer2 ? newScore : g.player2_score;

      if (newRack.length === 0 && tileBag.length === 0) {
        gameOver = true;
        // Add opponent's remaining tile points to this player's score
        const opponentRack: Tile[] = isPlayer1 ? g.player2_rack : g.player1_rack;
        const opponentTilePoints = opponentRack.reduce((sum: number, t: Tile) => sum + t.points, 0);
        if (isPlayer1) {
          p1Score += opponentTilePoints;
          p2Score -= opponentTilePoints;
        } else {
          p2Score += opponentTilePoints;
          p1Score -= opponentTilePoints;
        }
        winnerId = p1Score > p2Score ? g.player1_id : p2Score > p1Score ? g.player2_id : null;
      }

      // Record move
      await client.query(
        `INSERT INTO moves (game_id, player_id, move_type, tiles_placed, words_formed, score)
         VALUES ($1, $2, 'play', $3, $4, $5)`,
        [g.id, userId, JSON.stringify(tiles), JSON.stringify(scoreResult.wordScores), scoreResult.totalScore],
      );

      // Update game state
      await client.query(
        `UPDATE games SET board_state = $1, tile_bag = $2, ${rackField} = $3,
         player1_score = $4, player2_score = $5, current_turn = $6,
         consecutive_passes = 0, status = $7, winner_id = $8, updated_at = NOW()
         WHERE id = $9`,
        [JSON.stringify(board), JSON.stringify(tileBag), JSON.stringify(newRack),
         p1Score, p2Score, g.current_turn === 1 ? 2 : 1,
         gameOver ? 'finished' : 'active', winnerId, g.id],
      );

      if (gameOver) {
        await updateRatings(client, g.player1_id, g.player2_id, winnerId);
      }

      await client.query('COMMIT');

      // Notify opponent
      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      sendEvent(opponentId, gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id });

      res.json({
        score: scoreResult.totalScore,
        wordScores: scoreResult.wordScores,
        bingo: scoreResult.bingo,
        newRack: newRack,
        gameOver,
      });

    } else if (moveType === 'pass') {
      const newConsecutivePasses = g.consecutive_passes + 1;
      let gameOver = newConsecutivePasses >= MAX_CONSECUTIVE_PASSES;
      let winnerId = null;

      if (gameOver) {
        // Deduct remaining tile points from each player
        const p1Rack: Tile[] = g.player1_rack;
        const p2Rack: Tile[] = g.player2_rack;
        const p1Deduct = p1Rack.reduce((s: number, t: Tile) => s + t.points, 0);
        const p2Deduct = p2Rack.reduce((s: number, t: Tile) => s + t.points, 0);
        const p1Score = g.player1_score - p1Deduct;
        const p2Score = g.player2_score - p2Deduct;
        winnerId = p1Score > p2Score ? g.player1_id : p2Score > p1Score ? g.player2_id : null;

        await client.query(
          `UPDATE games SET current_turn = $1, consecutive_passes = $2,
           player1_score = $3, player2_score = $4, status = 'finished', winner_id = $5, updated_at = NOW()
           WHERE id = $6`,
          [g.current_turn === 1 ? 2 : 1, newConsecutivePasses, p1Score, p2Score, winnerId, g.id],
        );
        await updateRatings(client, g.player1_id, g.player2_id, winnerId);
      } else {
        await client.query(
          `UPDATE games SET current_turn = $1, consecutive_passes = $2, updated_at = NOW() WHERE id = $3`,
          [g.current_turn === 1 ? 2 : 1, newConsecutivePasses, g.id],
        );
      }

      await client.query(
        `INSERT INTO moves (game_id, player_id, move_type, score) VALUES ($1, $2, 'pass', 0)`,
        [g.id, userId],
      );

      await client.query('COMMIT');

      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      sendEvent(opponentId, gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id });
      res.json({ gameOver });

    } else if (moveType === 'exchange') {
      if (!exchangeTiles || exchangeTiles.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'No tiles to exchange' });
        return;
      }
      if (!exchangeTiles.every((i: number) => Number.isInteger(i) && i >= 0 && i < rack.length)) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Invalid tile indices' });
        return;
      }
      if (new Set(exchangeTiles).size !== exchangeTiles.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Duplicate tile indices' });
        return;
      }
      if (tileBag.length < exchangeTiles.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Not enough tiles in bag' });
        return;
      }

      const newRack = rack.filter((_: Tile, i: number) => !exchangeTiles.includes(i));
      const returned: Tile[] = exchangeTiles.map((i: number) => rack[i]);

      // Draw new tiles
      for (let i = 0; i < exchangeTiles.length; i++) {
        newRack.push(tileBag.shift()!);
      }
      // Put returned tiles back in bag and shuffle
      tileBag.push(...returned);
      for (let i = tileBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tileBag[i], tileBag[j]] = [tileBag[j], tileBag[i]];
      }

      const rackField = isPlayer1 ? 'player1_rack' : 'player2_rack';

      await client.query(
        `UPDATE games SET ${rackField} = $1, tile_bag = $2, current_turn = $3,
         consecutive_passes = 0, updated_at = NOW() WHERE id = $4`,
        [JSON.stringify(newRack), JSON.stringify(tileBag), g.current_turn === 1 ? 2 : 1, g.id],
      );

      await client.query(
        `INSERT INTO moves (game_id, player_id, move_type, score) VALUES ($1, $2, 'exchange', 0)`,
        [g.id, userId],
      );

      await client.query('COMMIT');

      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      sendEvent(opponentId, 'opponent_moved', { gameId: g.id });
      res.json({ newRack, gameOver: false });
    } else {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Invalid move type' });
      return;
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

    const winnerId = isPlayer1 ? g.player2_id : g.player1_id;

    await client.query(
      `UPDATE games SET status = 'finished', winner_id = $1, updated_at = NOW() WHERE id = $2`,
      [winnerId, g.id],
    );
    await updateRatings(client, g.player1_id, g.player2_id, winnerId);
    await client.query('COMMIT');

    const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
    sendEvent(opponentId, 'game_finished', { gameId: g.id });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Resign error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

async function updateRatings(client: any, player1Id: string, player2Id: string, winnerId: string | null) {
  const p1 = await client.query('SELECT rating, rating_deviation, rating_volatility FROM users WHERE id = $1', [player1Id]);
  const p2 = await client.query('SELECT rating, rating_deviation, rating_volatility FROM users WHERE id = $1', [player2Id]);

  const outcome = winnerId === player1Id ? 1 : winnerId === player2Id ? -1 : 0;
  const newRatings = calculateNewRatings(
    { rating: p1.rows[0].rating, deviation: p1.rows[0].rating_deviation, volatility: p1.rows[0].rating_volatility },
    { rating: p2.rows[0].rating, deviation: p2.rows[0].rating_deviation, volatility: p2.rows[0].rating_volatility },
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

export default router;

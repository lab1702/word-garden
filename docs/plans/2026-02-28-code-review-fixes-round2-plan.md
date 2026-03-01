# Code Review Fixes Round 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 remaining code review issues — matchmaking race condition, client state inconsistency, missing rate limit, insecure shuffle warning, and move handler monolith.

**Architecture:** Server fixes in `packages/server/src/`, client fix in `packages/client/src/`. The move handler extraction (Task 5) is the largest change — it creates a new service file and restructures the route handler.

**Tech Stack:** TypeScript, Express, PostgreSQL, React, Vitest

---

### Task 1: Add advisory lock to enterQueue

**Files:**
- Modify: `packages/server/src/services/matchmaking.ts:6-65`

**Step 1: Add advisory lock around the matching logic in enterQueue**

In `packages/server/src/services/matchmaking.ts`, after `await client.query('BEGIN');` (line 9), acquire the advisory lock. Wrap the existing matching + queue insertion logic, and release in a finally before the outer catch/finally.

The modified `enterQueue` function should become:

```typescript
export async function enterQueue(userId: string, rating: number, ratingDeviation: number): Promise<{ matched: boolean; gameId?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Acquire advisory lock to coordinate with sweepQueue
    await client.query('SELECT pg_advisory_lock(42)');

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
    } finally {
      await client.query('SELECT pg_advisory_unlock(42)');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

Note: Use `pg_advisory_lock(42)` (blocking) rather than `pg_try_advisory_lock(42)`, because `enterQueue` is user-facing and should wait for any in-progress sweep to finish rather than silently skip. Sweeps are fast (<100ms) so the wait is negligible.

**Step 2: Verify the server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run tests**

Run: `cd packages/server && npx vitest run`
Expected: All 18 tests pass

**Step 4: Commit**

```bash
git add packages/server/src/services/matchmaking.ts
git commit -m "fix: add advisory lock to enterQueue to coordinate with sweepQueue

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Fix loadGame failure after submitMove

**Files:**
- Modify: `packages/client/src/hooks/useGame.ts:198-254`

**Step 1: Remove optimistic rack update from submitMove and exchangeTiles**

In `packages/client/src/hooks/useGame.ts`:

In `submitMove` (around lines 198-219), remove the early `setRack` call. The function should become:

```typescript
  const submitMove = useCallback(async () => {
    if (!game || tentativePlacements.length === 0) return;
    setError('');
    setSubmitting(true);
    try {
      const tiles: TilePlacement[] = tentativePlacements.map(({ row, col, letter, isBlank }) => ({
        row, col, letter, isBlank,
      }));
      await apiFetch<any>(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'play', tiles }),
      });
      await loadGame();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [game, gameId, tentativePlacements, loadGame]);
```

Key changes:
- Remove `const result =` — we no longer use the response
- Remove the `if (result.newRack)` block (lines 210-212)
- `loadGame()` already fetches the authoritative rack from the server

In `exchangeTiles` (around lines 237-254), apply the same fix:

```typescript
  const exchangeTiles = useCallback(async (indices: number[]) => {
    setError('');
    setSubmitting(true);
    try {
      await apiFetch<any>(`/games/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ moveType: 'exchange', exchangeTiles: indices }),
      });
      await loadGame();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [gameId, loadGame]);
```

Key changes:
- Remove `const result =` — we no longer use the response
- Remove the `if (result.newRack)` block (lines 245-247)

**Step 2: Verify the client compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: Only pre-existing CSS module / Vite ImportMeta errors

**Step 3: Commit**

```bash
git add packages/client/src/hooks/useGame.ts
git commit -m "fix: remove optimistic rack update to prevent inconsistent state on loadGame failure

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Rate limit leaderboard endpoint

**Files:**
- Modify: `packages/server/src/routes/leaderboard.ts`

**Step 1: Add rate limiting**

In `packages/server/src/routes/leaderboard.ts`, add rate limiting using the same pattern as other routes:

```typescript
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';

const router = Router();

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

router.use(leaderboardLimiter);

router.get('/', async (_req, res) => {
  // ... existing handler unchanged ...
});

export default router;
```

**Step 2: Verify the server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/server/src/routes/leaderboard.ts
git commit -m "fix: add rate limiting to leaderboard endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add JSDoc warning to shared shuffleBag

**Files:**
- Modify: `packages/shared/src/tiles.ts:52-59`

**Step 1: Add JSDoc comment**

In `packages/shared/src/tiles.ts`, add a JSDoc comment above the `shuffleBag` function (before line 52):

```typescript
/**
 * Client-only cosmetic shuffle using Math.random().
 * NOT cryptographically secure — do NOT use for game-critical randomness.
 * The server uses secureShuffleBag (crypto.randomInt) in gameEngine.ts.
 */
export function shuffleBag(bag: Tile[]): Tile[] {
```

**Step 2: Commit**

```bash
git add packages/shared/src/tiles.ts
git commit -m "docs: add security warning to shared shuffleBag function

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Extract move handlers from route monolith

**Files:**
- Create: `packages/server/src/services/moveHandlers.ts`
- Modify: `packages/server/src/routes/games.ts:259-569`

This is the largest task. The goal is to extract the three move type branches (play, pass, exchange) from the route handler into separate service functions. The route handler keeps the common preamble and delegates.

**Step 1: Create moveHandlers.ts**

Create `packages/server/src/services/moveHandlers.ts` with the three extracted handlers. Each handler takes the DB client, game row, userId, and move-specific args. Each returns a result object that the route handler uses to build the response.

```typescript
import { randomInt } from 'node:crypto';
import { validatePlacement, findFormedWords, scoreMove } from './gameEngine.js';
import { isValidWord } from './dictionary.js';
import { updateRatings } from './ratings.js';
import { RACK_SIZE, LETTER_POINTS, MAX_CONSECUTIVE_PASSES, BOARD_SIZE } from '@word-garden/shared';
import type { TilePlacement, Tile } from '@word-garden/shared';

interface PlayResult {
  type: 'success';
  score: number;
  wordScores: { word: string; score: number }[];
  bingo: boolean;
  newRack: Tile[];
  gameOver: boolean;
  opponentId: string;
}

interface PassResult {
  type: 'success';
  gameOver: boolean;
  opponentId: string;
}

interface ExchangeResult {
  type: 'success';
  newRack: Tile[];
  opponentId: string;
}

interface MoveError {
  type: 'error';
  status: number;
  error: string;
}

export async function handlePlayMove(
  client: any,
  g: any,
  userId: string,
  tiles: TilePlacement[],
): Promise<PlayResult | MoveError> {
  const isPlayer1 = g.player1_id === userId;

  if (!Array.isArray(tiles) || tiles.length === 0 || tiles.length > RACK_SIZE) {
    return { type: 'error', status: 400, error: 'Invalid tiles' };
  }

  for (const t of tiles) {
    if (typeof t.row !== 'number' || typeof t.col !== 'number' ||
        !Number.isInteger(t.row) || !Number.isInteger(t.col) ||
        t.row < 0 || t.row >= BOARD_SIZE || t.col < 0 || t.col >= BOARD_SIZE ||
        typeof t.letter !== 'string' || t.letter.length !== 1 || !/^[A-Za-z]$/.test(t.letter) ||
        typeof t.isBlank !== 'boolean') {
      return { type: 'error', status: 400, error: 'Invalid tile placement data' };
    }
    t.letter = t.letter.toUpperCase();
  }

  // Validate tiles are in player's rack
  const board = g.board_state;
  const rack: Tile[] = isPlayer1 ? g.player1_rack : g.player2_rack;
  const tileBag: Tile[] = g.tile_bag;
  const isFirstMove = board.every((row: any[]) => row.every((cell: any) => cell.tile === null));

  const rackCopy = [...rack];
  for (const t of tiles) {
    const idx = rackCopy.findIndex((r: Tile) =>
      t.isBlank ? r.letter === '' : r.letter === t.letter
    );
    if (idx === -1) {
      return { type: 'error', status: 400, error: `Tile ${t.letter} not in your rack` };
    }
    rackCopy.splice(idx, 1);
  }

  // Validate placement
  const validation = validatePlacement(board, tiles, isFirstMove);
  if (!validation.valid) {
    return { type: 'error', status: 400, error: validation.error! };
  }

  // Check all formed words are valid
  const words = findFormedWords(board, tiles);
  if (words.length === 0) {
    return { type: 'error', status: 400, error: 'Move must form at least one word' };
  }
  for (const w of words) {
    if (!isValidWord(w.word)) {
      return { type: 'error', status: 400, error: `"${w.word}" is not a valid word` };
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

  let gameOver = false;
  let winnerId = null;
  let p1Score = isPlayer1 ? newScore : g.player1_score;
  let p2Score = !isPlayer1 ? newScore : g.player2_score;

  if (newRack.length === 0 && tileBag.length === 0) {
    gameOver = true;
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

  return {
    type: 'success',
    score: scoreResult.totalScore,
    wordScores: scoreResult.wordScores,
    bingo: scoreResult.bingo,
    newRack,
    gameOver,
    opponentId: isPlayer1 ? g.player2_id : g.player1_id,
  };
}

export async function handlePassMove(
  client: any,
  g: any,
  userId: string,
): Promise<PassResult | MoveError> {
  const isPlayer1 = g.player1_id === userId;
  const newConsecutivePasses = g.consecutive_passes + 1;
  let gameOver = newConsecutivePasses >= MAX_CONSECUTIVE_PASSES;
  let winnerId = null;

  if (gameOver) {
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

  return {
    type: 'success',
    gameOver,
    opponentId: isPlayer1 ? g.player2_id : g.player1_id,
  };
}

export async function handleExchangeMove(
  client: any,
  g: any,
  userId: string,
  exchangeTiles: number[],
): Promise<ExchangeResult | MoveError> {
  const isPlayer1 = g.player1_id === userId;
  const rack: Tile[] = isPlayer1 ? g.player1_rack : g.player2_rack;
  const tileBag: Tile[] = g.tile_bag;

  if (!Array.isArray(exchangeTiles) || exchangeTiles.length === 0) {
    return { type: 'error', status: 400, error: 'No tiles to exchange' };
  }
  if (!exchangeTiles.every((i: number) => Number.isInteger(i) && i >= 0 && i < rack.length)) {
    return { type: 'error', status: 400, error: 'Invalid tile indices' };
  }
  if (new Set(exchangeTiles).size !== exchangeTiles.length) {
    return { type: 'error', status: 400, error: 'Duplicate tile indices' };
  }
  if (tileBag.length < exchangeTiles.length) {
    return { type: 'error', status: 400, error: 'Not enough tiles in bag' };
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
    const j = randomInt(i + 1);
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

  return {
    type: 'success',
    newRack,
    opponentId: isPlayer1 ? g.player2_id : g.player1_id,
  };
}
```

**Step 2: Rewrite the move route handler to use the extracted functions**

In `packages/server/src/routes/games.ts`, replace the `POST /games/:id/move` handler (lines 259-569) with a simplified version that delegates to the handlers.

Remove imports that are no longer needed in games.ts:
- Remove `randomInt` from `node:crypto` import (line 2) — only used in exchange shuffle, now in moveHandlers
- Remove `validatePlacement, findFormedWords, scoreMove` from gameEngine import (line 6) — now in moveHandlers
- Remove `isValidWord` import (line 7) — now in moveHandlers
- Remove `updateRatings` import (line 10) — now in moveHandlers
- Remove `RACK_SIZE, MAX_CONSECUTIVE_PASSES, LETTER_POINTS, BOARD_SIZE` from shared import (line 11) — now in moveHandlers
- Remove `type TilePlacement, Tile` from shared import (line 12) — now in moveHandlers

Add new import:
```typescript
import { handlePlayMove, handlePassMove, handleExchangeMove } from '../services/moveHandlers.js';
```

Keep imports still needed in games.ts:
- `Router` from express
- `rateLimit` from express-rate-limit
- `pool` from db/pool
- `requireAuth` from middleware/auth
- `initializeGame, drawTilesForPlayer2` from gameEngine (used in create/join game)
- `enterQueue, leaveQueue, generateInviteCode` from matchmaking
- `sendEvent, broadcastEvent` from sse
- `Tile` type from shared (used in join game for tileBag typing)

The new move handler becomes:

```typescript
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
    try {
      if (moveType === 'play') {
        const r = result as Extract<typeof result, { type: 'success'; score: number }>;
        sendEvent(r.opponentId, r.gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id });
        if (r.gameOver) broadcastEvent('leaderboard_updated', {});
        res.json({ score: r.score, wordScores: r.wordScores, bingo: r.bingo, newRack: r.newRack, gameOver: r.gameOver });
      } else if (moveType === 'pass') {
        const r = result as Extract<typeof result, { type: 'success'; gameOver: boolean }>;
        sendEvent(r.opponentId, r.gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id });
        if (r.gameOver) broadcastEvent('leaderboard_updated', {});
        res.json({ gameOver: r.gameOver });
      } else {
        const r = result as Extract<typeof result, { type: 'success'; newRack: any }>;
        sendEvent(r.opponentId, 'opponent_moved', { gameId: g.id });
        res.json({ newRack: r.newRack, gameOver: false });
      }
    } catch (e) {
      console.error('SSE notification failed:', e);
      // Response already depends on move type, handle edge case where sendEvent fails after commit
      if (!res.headersSent) {
        res.json({ ok: true });
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Move error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});
```

**Step 3: Verify the server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 4: Run all tests**

Run: `cd packages/server && npx vitest run`
Expected: All 18 tests pass

**Step 5: Commit**

```bash
git add packages/server/src/services/moveHandlers.ts packages/server/src/routes/games.ts
git commit -m "refactor: extract move handlers into moveHandlers service

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

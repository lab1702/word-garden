# End-of-Game Rating & Rank Changes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show both players' Glicko-2 rating change and leaderboard rank change on the game-over screen.

**Architecture:** Store before/after rating and rank in the games table at game-finish time. The GET /games/:id endpoint includes this data for finished games. The client renders it in the game-over overlay.

**Tech Stack:** PostgreSQL migration, Express/TypeScript backend, React frontend with CSS modules.

---

### Task 1: Database Migration

**Files:**
- Create: `packages/server/src/db/migrations/007-rating-changes.sql`

**Step 1: Write the migration**

```sql
ALTER TABLE games
  ADD COLUMN player1_rating_before DOUBLE PRECISION,
  ADD COLUMN player1_rating_after DOUBLE PRECISION,
  ADD COLUMN player2_rating_before DOUBLE PRECISION,
  ADD COLUMN player2_rating_after DOUBLE PRECISION,
  ADD COLUMN player1_rank_before INT,
  ADD COLUMN player1_rank_after INT,
  ADD COLUMN player2_rank_before INT,
  ADD COLUMN player2_rank_after INT;
```

All columns nullable — existing games and in-progress games won't have data.

**Step 2: Verify migration applies**

Run: `cd packages/server && npx tsx src/db/migrate.ts` (or restart the dev server which runs migrations on startup).
Expected: "Migration applied: 007-rating-changes.sql"

**Step 3: Commit**

```
feat: add rating/rank change columns to games table
```

---

### Task 2: Update `updateRatings()` to return before/after data

**Files:**
- Modify: `packages/server/src/services/ratings.ts`

**Step 1: Write a failing test**

Create test in `packages/server/src/services/__tests__/ratings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateRatings } from '../ratings.js';

// Mock glicko2
vi.mock('../glicko2.js', () => ({
  calculateNewRatings: vi.fn(() => ({
    player1: { rating: 1547, deviation: 190, volatility: 0.059 },
    player2: { rating: 1453, deviation: 190, volatility: 0.059 },
  })),
}));

function createMockClient() {
  const queryResults: any[] = [];
  const client = {
    query: vi.fn(async () => queryResults.shift() ?? { rows: [] }),
    pushResult: (result: any) => queryResults.push(result),
  };
  return client;
}

describe('updateRatings', () => {
  it('returns rating and rank changes for both players', async () => {
    const client = createMockClient();
    // SELECT FOR UPDATE player1 (sorted first by id)
    client.pushResult({ rows: [{ id: 'aaa', rating: 1500, rating_deviation: 200, rating_volatility: 0.06 }] });
    // SELECT FOR UPDATE player2
    client.pushResult({ rows: [{ id: 'bbb', rating: 1500, rating_deviation: 200, rating_volatility: 0.06 }] });
    // Rank query for player1 before
    client.pushResult({ rows: [{ count: '2' }] });
    // Rank query for player2 before
    client.pushResult({ rows: [{ count: '2' }] });
    // UPDATE player1 rating
    client.pushResult({ rows: [] });
    // UPDATE player2 rating
    client.pushResult({ rows: [] });
    // Rank query for player1 after
    client.pushResult({ rows: [{ count: '1' }] });
    // Rank query for player2 after
    client.pushResult({ rows: [{ count: '3' }] });

    const result = await updateRatings(client as any, 'aaa', 'bbb', 'aaa');

    expect(result).toBeDefined();
    expect(result!.player1.ratingBefore).toBe(1500);
    expect(result!.player1.ratingAfter).toBe(1547);
    expect(result!.player1.rankBefore).toBe(3);
    expect(result!.player1.rankAfter).toBe(2);
    expect(result!.player2.ratingBefore).toBe(1500);
    expect(result!.player2.ratingAfter).toBe(1453);
    expect(result!.player2.rankBefore).toBe(3);
    expect(result!.player2.rankAfter).toBe(4);
  });

  it('returns undefined when player ids are null', async () => {
    const client = createMockClient();
    const result = await updateRatings(client as any, null, 'bbb', null);
    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/services/__tests__/ratings.test.ts`
Expected: FAIL — `updateRatings` currently returns void.

**Step 3: Update `updateRatings()` implementation**

In `packages/server/src/services/ratings.ts`, change the function to:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/services/__tests__/ratings.test.ts`
Expected: PASS

**Step 5: Run all existing tests to check for regressions**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass. The `moveHandlers.test.ts` mocks `updateRatings` so no changes needed there.

**Step 6: Commit**

```
feat: return rating/rank changes from updateRatings
```

---

### Task 3: Store rating changes in move handlers

**Files:**
- Modify: `packages/server/src/services/moveHandlers.ts`

**Step 1: Update `handlePlayMove` to store rating changes**

After the existing `await updateRatings(...)` call at line 139, add code to store the returned data:

```typescript
// In handlePlayMove, change:
if (gameOver) {
  await updateRatings(client, g.player1_id, g.player2_id, winnerId);
}
// To:
if (gameOver) {
  const ratingChanges = await updateRatings(client, g.player1_id, g.player2_id, winnerId);
  if (ratingChanges) {
    await client.query(
      `UPDATE games SET
        player1_rating_before = $1, player1_rating_after = $2,
        player1_rank_before = $3, player1_rank_after = $4,
        player2_rating_before = $5, player2_rating_after = $6,
        player2_rank_before = $7, player2_rank_after = $8
      WHERE id = $9`,
      [
        ratingChanges.player1.ratingBefore, ratingChanges.player1.ratingAfter,
        ratingChanges.player1.rankBefore, ratingChanges.player1.rankAfter,
        ratingChanges.player2.ratingBefore, ratingChanges.player2.ratingAfter,
        ratingChanges.player2.rankBefore, ratingChanges.player2.rankAfter,
        g.id,
      ],
    );
  }
}
```

**Step 2: Update `handlePassMove` the same way**

Same pattern at line 185.

**Step 3: Run tests**

Run: `cd packages/server && npx vitest run`
Expected: All pass. Mocks for `updateRatings` already return undefined by default.

**Step 4: Commit**

```
feat: store rating/rank changes on game row when game finishes
```

---

### Task 4: Store rating changes on resign

**Files:**
- Modify: `packages/server/src/routes/games.ts` (resign handler, ~line 444)

**Step 1: Update the resign handler**

Change the resign handler's `updateRatings` call from:

```typescript
await updateRatings(client, g.player1_id, g.player2_id, winnerId);
```

To:

```typescript
const ratingChanges = await updateRatings(client, g.player1_id, g.player2_id, winnerId);
if (ratingChanges) {
  await client.query(
    `UPDATE games SET
      player1_rating_before = $1, player1_rating_after = $2,
      player1_rank_before = $3, player1_rank_after = $4,
      player2_rating_before = $5, player2_rating_after = $6,
      player2_rank_before = $7, player2_rank_after = $8
    WHERE id = $9`,
    [
      ratingChanges.player1.ratingBefore, ratingChanges.player1.ratingAfter,
      ratingChanges.player1.rankBefore, ratingChanges.player1.rankAfter,
      ratingChanges.player2.ratingBefore, ratingChanges.player2.ratingAfter,
      ratingChanges.player2.rankBefore, ratingChanges.player2.rankAfter,
      g.id,
    ],
  );
}
```

**Step 2: Run tests**

Run: `cd packages/server && npx vitest run`
Expected: All pass.

**Step 3: Commit**

```
feat: store rating/rank changes on resign
```

---

### Task 5: Include rating changes in GET /games/:id response

**Files:**
- Modify: `packages/server/src/routes/games.ts` (GET handler, ~line 259)

**Step 1: Add rating changes to the response**

In the GET `/games/:id` handler, after the existing `res.json({...})` block, add `ratingChanges` field. Change the `res.json` call to include:

```typescript
// Add to the res.json object, after previousMove:
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
```

**Step 2: Commit**

```
feat: include rating/rank changes in game API response
```

---

### Task 6: Update frontend GameData type and game-over overlay

**Files:**
- Modify: `packages/client/src/hooks/useGame.ts` (GameData interface)
- Modify: `packages/client/src/pages/Game.tsx` (game-over overlay)
- Modify: `packages/client/src/pages/Game.module.css` (styles)

**Step 1: Add `ratingChanges` to GameData interface**

In `packages/client/src/hooks/useGame.ts`, add to `GameData`:

```typescript
ratingChanges: {
  me: { ratingBefore: number; ratingAfter: number; rankBefore: number; rankAfter: number };
  opponent: { ratingBefore: number; ratingAfter: number; rankBefore: number; rankAfter: number };
} | null;
```

**Step 2: Update game-over overlay in `Game.tsx`**

Replace the game-over overlay section (lines 197-207) with:

```tsx
{isFinished && (
  <div className={styles.gameOverOverlay}>
    <h2 style={{ color: myScore > opponentScore ? 'var(--color-accent)' : myScore < opponentScore ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
      {myScore > opponentScore ? 'You Won!' : myScore < opponentScore ? 'You Lost' : 'Draw'}
    </h2>
    <p>{myScore} - {opponentScore}</p>
    {game.ratingChanges && (
      <div className={styles.ratingChanges}>
        <div className={styles.ratingRow}>
          <span className={styles.ratingPlayer}>You</span>
          <span className={styles.ratingValue}>{game.ratingChanges.me.ratingAfter}</span>
          <span className={game.ratingChanges.me.ratingAfter >= game.ratingChanges.me.ratingBefore ? styles.ratingUp : styles.ratingDown}>
            {game.ratingChanges.me.ratingAfter >= game.ratingChanges.me.ratingBefore ? '+' : ''}{game.ratingChanges.me.ratingAfter - game.ratingChanges.me.ratingBefore}
          </span>
          {game.ratingChanges.me.rankBefore !== game.ratingChanges.me.rankAfter ? (
            <span className={styles.rankChange}>#{game.ratingChanges.me.rankBefore} → #{game.ratingChanges.me.rankAfter}</span>
          ) : (
            <span className={styles.rankChange}>#{game.ratingChanges.me.rankAfter}</span>
          )}
        </div>
        <div className={styles.ratingRow}>
          <span className={styles.ratingPlayer}>{game.opponentUsername}</span>
          <span className={styles.ratingValue}>{game.ratingChanges.opponent.ratingAfter}</span>
          <span className={game.ratingChanges.opponent.ratingAfter >= game.ratingChanges.opponent.ratingBefore ? styles.ratingUp : styles.ratingDown}>
            {game.ratingChanges.opponent.ratingAfter >= game.ratingChanges.opponent.ratingBefore ? '+' : ''}{game.ratingChanges.opponent.ratingAfter - game.ratingChanges.opponent.ratingBefore}
          </span>
          {game.ratingChanges.opponent.rankBefore !== game.ratingChanges.opponent.rankAfter ? (
            <span className={styles.rankChange}>#{game.ratingChanges.opponent.rankBefore} → #{game.ratingChanges.opponent.rankAfter}</span>
          ) : (
            <span className={styles.rankChange}>#{game.ratingChanges.opponent.rankAfter}</span>
          )}
        </div>
      </div>
    )}
    <button onClick={() => navigate('/')} className={styles.playButton}>
      Back to Lobby
    </button>
  </div>
)}
```

**Step 3: Add CSS styles**

Add to `packages/client/src/pages/Game.module.css` after the `.gameOverOverlay p` block:

```css
.ratingChanges {
  margin: 0.75rem 0 1rem;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.ratingRow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
}

.ratingPlayer {
  color: var(--color-text);
  min-width: 5rem;
  text-align: right;
}

.ratingValue {
  color: var(--color-gold);
  font-weight: bold;
}

.ratingUp {
  color: var(--color-accent);
}

.ratingDown {
  color: var(--color-danger);
}

.rankChange {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
```

**Step 4: Verify the build compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit**

```
feat: show rating and rank changes on game-over screen
```

---

### Task 7: Manual verification

**Step 1: Start the dev server**

Run: `npm run dev` (or however the app starts)

**Step 2: Play a game to completion and verify**

- Start a game between two accounts
- Play until game ends
- Verify the game-over overlay shows rating and rank changes for both players
- Verify the other player's view also shows correct changes
- Verify revisiting a finished game still shows the data

**Step 3: Verify old finished games gracefully show no rating data**

- Open a game that was finished before this migration
- Verify it shows the normal game-over screen without rating changes (no errors)

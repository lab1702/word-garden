# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 issues identified during full-project code review — auth performance, matchmaking race condition, React hook bugs, missing indexes, and duplicated logic.

**Architecture:** All fixes are independent and can be implemented in any order. Server-side changes are in `packages/server/src/`. Client-side changes are in `packages/client/src/`. New migration goes in `packages/server/src/db/migrations/`.

**Tech Stack:** TypeScript, Express, PostgreSQL, React, Vitest

---

### Task 1: Add token_version cache to auth middleware

**Files:**
- Create: `packages/server/src/services/tokenVersionCache.ts`
- Modify: `packages/server/src/middleware/auth.ts`
- Modify: `packages/server/src/routes/auth.ts`

**Step 1: Create the cache service**

Create `packages/server/src/services/tokenVersionCache.ts`:

```typescript
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  version: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedTokenVersion(userId: string): number | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return entry.version;
}

export function setCachedTokenVersion(userId: string, version: number): void {
  cache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateTokenVersion(userId: string): void {
  cache.delete(userId);
}
```

**Step 2: Update auth middleware to use cache**

In `packages/server/src/middleware/auth.ts`, add imports for `getCachedTokenVersion` and `setCachedTokenVersion`. Replace the direct DB query with a cache-first check:

```typescript
import { getCachedTokenVersion, setCachedTokenVersion } from '../services/tokenVersionCache.js';

// Replace lines 25-31 with:
const cachedVersion = getCachedTokenVersion(payload.userId);
if (cachedVersion !== null) {
  if (cachedVersion !== payload.tokenVersion) {
    res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.status(401).json({ error: 'Token revoked' });
    return;
  }
} else {
  const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [payload.userId]);
  if (result.rows.length === 0 || result.rows[0].token_version !== payload.tokenVersion) {
    res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.status(401).json({ error: 'Token revoked' });
    return;
  }
  setCachedTokenVersion(payload.userId, result.rows[0].token_version);
}
```

**Step 3: Invalidate cache on password change and account deletion**

In `packages/server/src/routes/auth.ts`:
- Add import: `import { invalidateTokenVersion } from '../services/tokenVersionCache.js';`
- In PUT `/password` handler (after `disconnectUser(userId)` around line 367): add `invalidateTokenVersion(userId);`
- In DELETE `/account` handler (after `disconnectUser(userId)` around line 440): add `invalidateTokenVersion(userId);`

**Step 4: Verify the server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/server/src/services/tokenVersionCache.ts packages/server/src/middleware/auth.ts packages/server/src/routes/auth.ts
git commit -m "perf: cache token_version in auth middleware to reduce DB load"
```

---

### Task 2: Add advisory lock to matchmaking sweep

**Files:**
- Modify: `packages/server/src/services/matchmaking.ts`

**Step 1: Wrap sweepQueue in pg_try_advisory_lock**

In `packages/server/src/services/matchmaking.ts`, modify the `sweepQueue` function. After `const client = await pool.connect();`, acquire an advisory lock. If the lock isn't available, release the client and return early. Wrap the existing logic in a try/finally that releases the lock.

Replace the `try` block starting at line 72 with:

```typescript
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

      // ... existing for-loop logic stays the same ...

    } finally {
      await client.query('SELECT pg_advisory_unlock(42)');
    }
  } finally {
    client.release();
  }
```

Keep the existing for-loop and notification logic unchanged inside the inner try.

**Step 2: Verify the server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/server/src/services/matchmaking.ts
git commit -m "fix: add advisory lock to sweepQueue to prevent matchmaking race condition"
```

---

### Task 3: Fix useSSE useMemo

**Files:**
- Modify: `packages/client/src/hooks/useSSE.ts`

**Step 1: Replace the broken useMemo with a plain computation**

In `packages/client/src/hooks/useSSE.ts`:
- Remove `useMemo` from the import (keep `useEffect` and `useRef`)
- Replace lines 9-13 with:

```typescript
  const eventKeys = Object.keys(handlers).sort().join(',');
```

The `useEffect` on line 15 already depends on `[eventKeys]`, so it will correctly re-run only when the set of event names changes.

**Step 2: Verify the client compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/client/src/hooks/useSSE.ts
git commit -m "fix: remove broken useMemo in useSSE to prevent unnecessary reconnections"
```

---

### Task 4: Clean up ChangePasswordModal timer

**Files:**
- Modify: `packages/client/src/components/ChangePasswordModal.tsx`

**Step 1: Add useRef/useEffect for timer cleanup and autoComplete attributes**

In `packages/client/src/components/ChangePasswordModal.tsx`:

- Add `useRef` and `useEffect` to the import: `import { useState, useRef, useEffect } from 'react';`
- Add a ref and cleanup effect after the existing `useState` calls (after line 14):

```typescript
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { clearTimeout(timerRef.current); };
  }, []);
```

- Replace `setTimeout(onClose, 1500);` (line 27) with:

```typescript
      timerRef.current = setTimeout(onClose, 1500);
```

- Add `autoComplete="current-password"` to the current password input (line 40-46)
- Add `autoComplete="new-password"` to the new password input (line 48-53)

**Step 2: Verify the client compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/client/src/components/ChangePasswordModal.tsx
git commit -m "fix: clean up timer on unmount in ChangePasswordModal and add autoComplete"
```

---

### Task 5: Add performance indexes migration

**Files:**
- Create: `packages/server/src/db/migrations/005-performance-indexes.sql`

**Step 1: Create the migration file**

Create `packages/server/src/db/migrations/005-performance-indexes.sql`:

```sql
CREATE INDEX idx_users_leaderboard ON users(rating DESC) WHERE rating_deviation < 350;
CREATE INDEX idx_moves_game_created ON moves(game_id, created_at DESC);
```

**Step 2: Commit**

```bash
git add packages/server/src/db/migrations/005-performance-indexes.sql
git commit -m "perf: add indexes for leaderboard and last-move queries"
```

---

### Task 6: Extract shared updateRatings service

**Files:**
- Create: `packages/server/src/services/ratings.ts`
- Modify: `packages/server/src/routes/games.ts`
- Modify: `packages/server/src/routes/auth.ts`

**Step 1: Create the ratings service**

Create `packages/server/src/services/ratings.ts` by extracting the `updateRatings` function from `packages/server/src/routes/games.ts:635-659`:

```typescript
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
```

**Step 2: Update games.ts to import from ratings service**

In `packages/server/src/routes/games.ts`:
- Add import: `import { updateRatings } from '../services/ratings.js';`
- Remove the `import { calculateNewRatings } from '../services/glicko2.js';` line (line 10)
- Delete the local `updateRatings` function (lines 635-659)

**Step 3: Update auth.ts to import from ratings service**

In `packages/server/src/routes/auth.ts`:
- Add import: `import { updateRatings } from '../services/ratings.js';`
- Remove the `import { calculateNewRatings } from '../services/glicko2.js';` line (line 16)
- Replace the duplicated rating update logic in the DELETE `/account` handler (lines 399-420) with a call to `updateRatings(client, g.player1_id, g.player2_id, winnerId);`

The for-loop in the DELETE handler becomes:

```typescript
    for (const g of activeGames.rows) {
      const isPlayer1 = g.player1_id === userId;
      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      const winnerId = opponentId;

      await client.query(
        `UPDATE games SET status = 'finished', winner_id = $1, updated_at = NOW() WHERE id = $2`,
        [winnerId, g.id],
      );

      await updateRatings(client, g.player1_id, g.player2_id, winnerId);

      // Notify opponent
      try { sendEvent(opponentId, 'game_finished', { gameId: g.id }); } catch {}
    }
```

**Step 4: Verify the server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 5: Run all tests**

Run: `cd packages/server && npx vitest run`
Expected: All 18 tests pass (ratings service is a pure extraction, no logic changes)

**Step 6: Commit**

```bash
git add packages/server/src/services/ratings.ts packages/server/src/routes/games.ts packages/server/src/routes/auth.ts
git commit -m "refactor: extract shared updateRatings into ratings service"
```

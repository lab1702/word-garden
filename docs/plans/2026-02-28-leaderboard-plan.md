# Live Top 10 Leaderboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a live high score list to the lobby showing the top 10 players by rating, updated in real-time via SSE.

**Architecture:** Add `broadcastEvent` to the SSE service for all-client broadcasts. Add a `GET /api/leaderboard` endpoint querying top 10 users by rating (excluding unrated). Trigger `leaderboard_updated` SSE broadcast on every game finish. Lobby fetches on mount + re-fetches on SSE signal.

**Tech Stack:** Express, PostgreSQL, React, SSE, CSS Modules, Vitest

---

### Task 1: Add `broadcastEvent` to SSE service

**Files:**
- Modify: `packages/server/src/services/sse.ts`

**Step 1: Add the `broadcastEvent` function**

Add to the end of `packages/server/src/services/sse.ts`:

```typescript
export function broadcastEvent(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [userId, userClients] of clients) {
    for (const res of [...userClients]) {
      try {
        res.write(payload);
      } catch {
        removeClient(userId, res);
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/server/src/services/sse.ts
git commit -m "feat: add broadcastEvent to SSE service"
```

---

### Task 2: Add `GET /api/leaderboard` endpoint

**Files:**
- Create: `packages/server/src/routes/leaderboard.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create the leaderboard route**

Create `packages/server/src/routes/leaderboard.ts`:

```typescript
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, rating
       FROM users
       WHERE rating_deviation < 350
       ORDER BY rating DESC
       LIMIT 10`
    );
    const leaderboard = result.rows.map((row, i) => ({
      rank: i + 1,
      userId: row.id,
      username: row.username,
      rating: Math.round(row.rating),
    }));
    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
```

**Step 2: Mount the route in `index.ts`**

In `packages/server/src/index.ts`, add import:

```typescript
import leaderboardRouter from './routes/leaderboard.js';
```

Add route mount after the games router line:

```typescript
app.use('/api/leaderboard', leaderboardRouter);
```

**Step 3: Commit**

```bash
git add packages/server/src/routes/leaderboard.ts packages/server/src/index.ts
git commit -m "feat: add GET /api/leaderboard endpoint"
```

---

### Task 3: Broadcast `leaderboard_updated` on game finish

**Files:**
- Modify: `packages/server/src/routes/games.ts`

**Step 1: Update import**

In `packages/server/src/routes/games.ts` line 9, change:

```typescript
import { sendEvent } from '../services/sse.js';
```

to:

```typescript
import { sendEvent, broadcastEvent } from '../services/sse.js';
```

**Step 2: Add broadcast after each game finish**

There are 3 locations where `game_finished` is sent. After each one, add a `broadcastEvent` call:

**Location 1 — Move completion (line ~417):**
After `try { sendEvent(opponentId, gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id }); }`:
```typescript
if (gameOver) { try { broadcastEvent('leaderboard_updated', {}); } catch {} }
```

**Location 2 — Consecutive passes (line ~466):**
After `try { sendEvent(opponentId, gameOver ? 'game_finished' : 'opponent_moved', { gameId: g.id }); }`:
```typescript
if (gameOver) { try { broadcastEvent('leaderboard_updated', {}); } catch {} }
```

**Location 3 — Resign (line ~590):**
After `try { sendEvent(opponentId, 'game_finished', { gameId: g.id }); }`:
```typescript
try { broadcastEvent('leaderboard_updated', {}); } catch {}
```

**Step 3: Commit**

```bash
git add packages/server/src/routes/games.ts
git commit -m "feat: broadcast leaderboard_updated on game finish"
```

---

### Task 4: Add leaderboard UI to the Lobby

**Files:**
- Modify: `packages/client/src/pages/Lobby.tsx`
- Modify: `packages/client/src/pages/Lobby.module.css`

**Step 1: Add leaderboard types, state, fetch, and SSE handler**

In `Lobby.tsx`, add a new interface after `GameSummary`:

```typescript
interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  rating: number;
}
```

Add `userId` to `LobbyProps`:

```typescript
interface LobbyProps {
  userId: string;
  username: string;
  rating: number;
  onGameFinished?: () => void;
}
```

Update the destructure:

```typescript
export function Lobby({ userId, username, rating, onGameFinished }: LobbyProps) {
```

Add state:

```typescript
const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
```

Add fetch function:

```typescript
const loadLeaderboard = useCallback(async () => {
  try {
    const data = await apiFetch<LeaderboardEntry[]>('/leaderboard');
    setLeaderboard(data);
  } catch (err: any) {
    console.error('Failed to load leaderboard:', err);
  }
}, []);
```

Add to `useEffect`:

```typescript
useEffect(() => { loadGames(); loadLeaderboard(); }, [loadGames, loadLeaderboard]);
```

Add `leaderboard_updated` to the `useSSE` handlers:

```typescript
leaderboard_updated: () => loadLeaderboard(),
```

**Step 2: Add leaderboard section to JSX**

Insert before the `<div className={styles.actions}>` block:

```tsx
{leaderboard.length > 0 && (
  <section className={styles.leaderboard}>
    <h2 className={styles.sectionTitle}>Top Players</h2>
    <ol className={styles.leaderboardList}>
      {leaderboard.map(entry => (
        <li
          key={entry.userId}
          className={`${styles.leaderboardEntry} ${entry.userId === userId ? styles.leaderboardSelf : ''}`}
        >
          <span className={styles.leaderboardRank}>#{entry.rank}</span>
          <span className={styles.leaderboardName}>{entry.username}</span>
          <span className={styles.leaderboardRating}>{entry.rating}</span>
        </li>
      ))}
    </ol>
  </section>
)}
```

**Step 3: Add CSS styles**

Append to `Lobby.module.css`:

```css
.leaderboard {
  margin-bottom: 1.5rem;
}

.leaderboardList {
  list-style: none;
  padding: 0;
  margin: 0;
}

.leaderboardEntry {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  gap: 0.75rem;
}

.leaderboardEntry:nth-child(odd) {
  background: var(--color-surface);
}

.leaderboardSelf {
  background: rgba(107, 142, 35, 0.15) !important;
  font-weight: bold;
}

.leaderboardRank {
  font-family: var(--font-mono, 'Courier New', monospace);
  color: var(--color-text-muted);
  min-width: 2rem;
}

.leaderboardName {
  flex: 1;
  color: var(--color-text);
}

.leaderboardRating {
  font-family: var(--font-mono, 'Courier New', monospace);
  color: var(--color-text);
  font-weight: bold;
}
```

**Step 4: Pass `userId` from App.tsx**

In `packages/client/src/App.tsx`, update the Lobby element (line 29):

```tsx
<Lobby userId={user.id} username={user.username} rating={user.rating} onGameFinished={refreshUser} />
```

**Step 5: Commit**

```bash
git add packages/client/src/pages/Lobby.tsx packages/client/src/pages/Lobby.module.css packages/client/src/App.tsx
git commit -m "feat: add live top 10 leaderboard to lobby"
```

---

### Task 5: Build and verify

**Step 1: Build the project**

```bash
cd /home/lab/tmp/word-garden && npm run build
```

**Step 2: Fix any type errors**

Address any TypeScript errors from the build.

**Step 3: Run existing tests**

```bash
cd /home/lab/tmp/word-garden/packages/server && npm test
```

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address build issues"
```

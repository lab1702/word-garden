# Lobby Stats Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real-time online player count and matchmaking queue size in the lobby's left column.

**Architecture:** Server broadcasts a `lobby_stats` SSE event (with debouncing) whenever SSE clients connect/disconnect or the matchmaking queue changes. The lobby component listens for this event and renders the counts below the leaderboard.

**Tech Stack:** TypeScript, Express SSE, React, Vitest

---

### Task 1: Add `getOnlinePlayerCount` and `broadcastLobbyStats` to SSE service

**Files:**
- Modify: `packages/server/src/services/sse.ts`

**Step 1: Add `getOnlinePlayerCount` export**

At the bottom of `sse.ts`, before the final export or at end of file, add:

```ts
export function getOnlinePlayerCount(): number {
  return clients.size;
}
```

**Step 2: Add `getMatchmakingCount` import and `broadcastLobbyStats` with debounce**

Add at the top of `sse.ts`:

```ts
import pool from '../db/pool.js';
```

Add at the bottom of `sse.ts`:

```ts
let lobbyStatsTimer: ReturnType<typeof setTimeout> | null = null;

export function broadcastLobbyStats(): void {
  if (lobbyStatsTimer) return;
  lobbyStatsTimer = setTimeout(async () => {
    lobbyStatsTimer = null;
    try {
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM matchmaking_queue');
      const matchmakingPlayers = result.rows[0].count;
      broadcastEvent('lobby_stats', {
        onlinePlayers: clients.size,
        matchmakingPlayers,
      });
    } catch (err) {
      console.error('Failed to broadcast lobby stats:', err);
    }
  }, 500);
}
```

**Step 3: Add `sendLobbyStats` for sending to a single client**

```ts
export async function sendLobbyStats(userId: string): Promise<void> {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM matchmaking_queue');
    const matchmakingPlayers = result.rows[0].count;
    sendEvent(userId, 'lobby_stats', {
      onlinePlayers: clients.size,
      matchmakingPlayers,
    });
  } catch (err) {
    console.error('Failed to send lobby stats:', err);
  }
}
```

**Step 4: Call `broadcastLobbyStats` from `addClient` and `removeClient`**

At the end of `addClient` (after `res.on('error', ...)`), add:

```ts
broadcastLobbyStats();
```

At the end of `removeClient` (after `if (userClients.length === 0) clients.delete(userId);`), add:

```ts
broadcastLobbyStats();
```

**Step 5: Commit**

```bash
git add packages/server/src/services/sse.ts
git commit -m "feat: add broadcastLobbyStats and sendLobbyStats to SSE service"
```

---

### Task 2: Add SSE tests for new lobby stats functions

**Files:**
- Modify: `packages/server/src/services/__tests__/sse.test.ts`

**Step 1: Write tests for `getOnlinePlayerCount`**

Add to the `describe('sse', ...)` block. Update the `beforeEach` imports to include the new exports and mock `pool`:

At the top of the file, add:

```ts
vi.mock('../../db/pool.js', () => ({
  default: { query: vi.fn() },
}));
```

In the `beforeEach`, also import the new functions:

```ts
let getOnlinePlayerCount: typeof import('../sse.js').getOnlinePlayerCount;
let broadcastLobbyStats: typeof import('../sse.js').broadcastLobbyStats;
let sendLobbyStats: typeof import('../sse.js').sendLobbyStats;
```

And in the `beforeEach` body:

```ts
getOnlinePlayerCount = mod.getOnlinePlayerCount;
broadcastLobbyStats = mod.broadcastLobbyStats;
sendLobbyStats = mod.sendLobbyStats;
```

Add tests:

```ts
it('getOnlinePlayerCount returns unique user count', () => {
  addClient('user-1', mockResponse());
  addClient('user-1', mockResponse()); // same user, two connections
  addClient('user-2', mockResponse());
  expect(getOnlinePlayerCount()).toBe(2);
});

it('getOnlinePlayerCount returns 0 when no clients', () => {
  expect(getOnlinePlayerCount()).toBe(0);
});
```

**Step 2: Write test for `broadcastLobbyStats`**

```ts
it('broadcastLobbyStats sends lobby_stats to all clients', async () => {
  const { default: pool } = await import('../../db/pool.js');
  (pool.query as any).mockResolvedValue({ rows: [{ count: 3 }] });

  const r1 = mockResponse();
  const r2 = mockResponse();
  addClient('user-1', r1);
  addClient('user-2', r2);

  broadcastLobbyStats();

  // Wait for debounce (500ms) + async
  await vi.waitFor(() => {
    expect(r1.write).toHaveBeenCalledWith(
      expect.stringContaining('"onlinePlayers":2')
    );
  }, { timeout: 1000 });

  expect(r2.write).toHaveBeenCalledWith(
    expect.stringContaining('"matchmakingPlayers":3')
  );
});
```

**Step 3: Write test for `sendLobbyStats`**

```ts
it('sendLobbyStats sends lobby_stats to specific user', async () => {
  const { default: pool } = await import('../../db/pool.js');
  (pool.query as any).mockResolvedValue({ rows: [{ count: 1 }] });

  const res = mockResponse();
  addClient('user-1', res);

  await sendLobbyStats('user-1');

  expect(res.write).toHaveBeenCalledWith(
    expect.stringContaining('"onlinePlayers":1')
  );
  expect(res.write).toHaveBeenCalledWith(
    expect.stringContaining('"matchmakingPlayers":1')
  );
});
```

**Step 4: Run tests**

Run: `npm test -w packages/server`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/server/src/services/__tests__/sse.test.ts
git commit -m "test: add tests for lobby stats SSE functions"
```

---

### Task 3: Call `broadcastLobbyStats` from matchmaking service

**Files:**
- Modify: `packages/server/src/services/matchmaking.ts`

**Step 1: Import `broadcastLobbyStats`**

Update the existing import from `./sse.js`:

```ts
import { sendEvent, broadcastLobbyStats } from './sse.js';
```

**Step 2: Call after entering queue (no match path)**

In `enterQueue`, after `await client.query('COMMIT');` in the "No match found, enter queue" block (around line 62-63), add to the finally block after notifications:

```ts
// At the end of the outer finally block, after notification sends:
broadcastLobbyStats();
```

Actually, to keep it clean: add `broadcastLobbyStats()` as the very last line in the outer `finally` block of `enterQueue` (after the notification if-block).

**Step 3: Call after leaving queue**

In `leaveQueue`, after the DELETE query, add:

```ts
broadcastLobbyStats();
```

**Step 4: Call after sweep matches**

In `sweepQueue`, at the end after the notification loop, add:

```ts
if (notifications.length > 0) {
  broadcastLobbyStats();
}
```

**Step 5: Commit**

```bash
git add packages/server/src/services/matchmaking.ts
git commit -m "feat: broadcast lobby stats on matchmaking queue changes"
```

---

### Task 4: Send initial lobby stats on SSE connect

**Files:**
- Modify: `packages/server/src/index.ts`

**Step 1: Import `sendLobbyStats`**

Update the existing import from `./services/sse.js`:

```ts
import { addClient, closeAllConnections, isAtCapacity, sendLobbyStats } from './services/sse.js';
```

**Step 2: Send stats after client connects**

In the SSE endpoint handler, after `addClient(req.user!.userId, res);`, add:

```ts
sendLobbyStats(req.user!.userId);
```

**Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: send lobby stats to newly connected SSE clients"
```

---

### Task 5: Add lobby stats UI to Lobby component

**Files:**
- Modify: `packages/client/src/pages/Lobby.tsx`
- Modify: `packages/client/src/pages/Lobby.module.css`

**Step 1: Add state for lobby stats**

In `Lobby.tsx`, add state after the `leaderboard` state:

```ts
const [lobbyStats, setLobbyStats] = useState<{ onlinePlayers: number; matchmakingPlayers: number } | null>(null);
```

**Step 2: Add SSE handler**

In the `useSSE` call, add a handler:

```ts
lobby_stats: (data: { onlinePlayers: number; matchmakingPlayers: number }) => {
  setLobbyStats(data);
},
```

**Step 3: Add UI in left column**

In the left side panel (first `<div className={styles.sidePanel}>`), after the leaderboard `</section>` closing tag but still inside the sidePanel div, add:

```tsx
{lobbyStats && (
  <section className={styles.communityStats}>
    <h2 className={styles.sectionTitle}>Community</h2>
    <div className={styles.statRow}>
      <span className={styles.statValue}>{lobbyStats.onlinePlayers}</span>
      <span className={styles.statLabel}>players online</span>
    </div>
    <div className={styles.statRow}>
      <span className={styles.statValue}>{lobbyStats.matchmakingPlayers}</span>
      <span className={styles.statLabel}>searching for match</span>
    </div>
  </section>
)}
```

**Step 4: Add CSS styles**

In `Lobby.module.css`, add at the bottom:

```css
.communityStats {
  margin-top: 1.5rem;
}

.statRow {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
}

.statValue {
  font-family: var(--font-mono);
  font-weight: bold;
  font-size: 1.125rem;
  color: var(--color-accent);
}

.statLabel {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}
```

**Step 5: Commit**

```bash
git add packages/client/src/pages/Lobby.tsx packages/client/src/pages/Lobby.module.css
git commit -m "feat: display online players and matchmaking queue count in lobby"
```

---

### Task 6: Run all tests and verify

**Step 1: Run server tests**

Run: `npm test -w packages/server`
Expected: All tests pass

**Step 2: Verify build**

Run: `npm run build -w packages/client`
Expected: Build succeeds with no TypeScript errors

**Step 3: Commit any fixes if needed**

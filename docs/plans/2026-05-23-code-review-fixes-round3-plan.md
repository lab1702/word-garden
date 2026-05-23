# Code Review Fixes (Round 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 12 correctness/security bugs found in the 2026-05-23 whole-codebase review.

**Architecture:** Server fixes are TDD'd with the existing Vitest setup; pure logic is extracted into small testable helper modules where a route/DB makes direct testing hard. The client gets a new Vitest + React Testing Library harness; UI logic is extracted into pure helpers/components so it can be unit-tested without driving jsdom layout. Token-revocation across processes uses Postgres `LISTEN/NOTIFY`.

**Tech Stack:** TypeScript, Express 5, `pg`, Vitest (server + client), React 19 + React Testing Library, Postgres.

**Conventions for every task:**
- All commits use the repo's `fix:`/`chore:`/`test:` style and must include the trailer:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Run a single server test file: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run <relative-path>`
- Run a single client test file: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run <relative-path>`
- Server typecheck: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit`
- Client typecheck: `cd /home/lab/tmp/word-garden/packages/client && npx tsc --noEmit`

---

## Task 0: Create the working branch

- [ ] **Step 1: Branch off main**

```bash
cd /home/lab/tmp/word-garden
git checkout -b fix/code-review-round3
```

---

## File Structure

**Created:**
- `packages/server/src/services/passwordAuth.ts` — constant-time password verification + byte-length validation (fixes #6, #8)
- `packages/server/src/services/__tests__/passwordAuth.test.ts`
- `packages/server/src/services/inviteGames.ts` — atomic waiting-game creation under a per-user advisory lock (fixes #9)
- `packages/server/src/services/__tests__/inviteGames.test.ts`
- `packages/server/src/services/tokenVersionListener.ts` — Postgres LISTEN/NOTIFY token-version invalidation (fixes #5)
- `packages/server/src/services/__tests__/tokenVersionListener.test.ts`
- `packages/server/src/services/__tests__/profanityFilter.test.ts` — new tests for #1
- `packages/server/src/services/__tests__/matchmaking.test.ts` — new tests for #4
- `packages/server/src/db/migrations/008-leaderboard-tiebreak-index.sql` — composite tie-break index (#7)
- `packages/client/vitest.setup.ts` — RTL/jest-dom setup
- `packages/client/src/test/setup.test.ts` — harness smoke test (#client infra)
- `packages/client/src/pages/GameLoadState.tsx` + `GameLoadState.test.tsx` — load/error UI (fixes #2)
- `packages/client/src/components/dragLogic.ts` + `dragLogic.test.ts` — pure drop resolution (fixes #3)
- `packages/client/src/hooks/__tests__/useGame.test.ts` — blank-tile fix (#11)
- `packages/client/src/pages/Login.test.tsx` — double-submit guard (#12)

**Modified:**
- `packages/server/src/services/profanityFilter.ts` (#1)
- `packages/server/src/routes/auth.ts` (#6, #8)
- `packages/server/src/scripts/set-password.ts` (#5, #8)
- `packages/server/src/routes/leaderboard.ts` (#7)
- `packages/server/src/services/ratings.ts` (#7)
- `packages/server/src/services/matchmaking.ts` (#4)
- `packages/server/src/routes/games.ts` (#9)
- `packages/server/src/services/sse.ts` (#10)
- `packages/server/src/index.ts` (#5, #10)
- `packages/client/vite.config.ts` (test config)
- `packages/client/package.json` (devDeps + scripts)
- `packages/client/src/pages/Game.tsx` (#2)
- `packages/client/src/components/Board.tsx` (#3)
- `packages/client/src/hooks/useGame.ts` (#11)
- `packages/client/src/pages/Login.tsx` (#12)

---

## Task 1: Fix profanity-filter blanket bypass (#1)

The current `ALLOWED_SUBSTRINGS` loop `return false`s on any benign substring, so `"passfuck"` (contains "pass") bypasses every blocked word. Fix: exempt only the specific character ranges covered by an allowed substring; profanity elsewhere is still caught.

**Files:**
- Test: `packages/server/src/services/__tests__/profanityFilter.test.ts`
- Modify: `packages/server/src/services/profanityFilter.ts:86-102`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/services/__tests__/profanityFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { containsProfanity } from '../profanityFilter.js';

describe('containsProfanity', () => {
  it('blocks profanity even when a benign substring is also present', () => {
    expect(containsProfanity('passfuck')).toBe(true);   // "pass" must not exempt "fuck"
    expect(containsProfanity('classnigger')).toBe(true); // "class" must not exempt "nigger"
    expect(containsProfanity('grasscunt')).toBe(true);
  });

  it('still allows benign words whose only match is inside an allowed substring', () => {
    expect(containsProfanity('grass')).toBe(false);       // "ass" inside "grass"
    expect(containsProfanity('classic')).toBe(false);
    expect(containsProfanity('scunthorpe')).toBe(false);  // "cunt" inside "scunthorpe"
    expect(containsProfanity('cocktail')).toBe(false);
  });

  it('blocks bare slurs and respects word boundaries for milder words', () => {
    expect(containsProfanity('fuck')).toBe(true);
    expect(containsProfanity('alice')).toBe(false);
    expect(containsProfanity('ass')).toBe(true);          // standalone, boundaries satisfied
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/profanityFilter.test.ts`
Expected: FAIL — `containsProfanity('passfuck')` returns `false` (current bypass).

- [ ] **Step 3: Implement the fix**

Replace the body of `containsProfanity` in `packages/server/src/services/profanityFilter.ts` (lines 86-102) with:

```ts
export function containsProfanity(username: string): boolean {
  const lower = username.toLowerCase();

  // Mark character ranges belonging to a known-safe substring so a blocked
  // word appearing *inside* such a word (e.g. "ass" in "grass", "cunt" in
  // "scunthorpe") is exempt — but unrelated profanity elsewhere is still caught.
  const covered = new Array<boolean>(lower.length).fill(false);
  for (const safe of ALLOWED_SUBSTRINGS) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(safe, from);
      if (idx === -1) break;
      for (let i = idx; i < idx + safe.length; i++) covered[i] = true;
      from = idx + 1;
    }
  }

  const isCovered = (start: number, end: number): boolean => {
    for (let i = start; i < end; i++) if (!covered[i]) return false;
    return true;
  };

  return BLOCKED_WORDS.some((word) => {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(word, from);
      if (idx === -1) return false;
      from = idx + 1;
      const end = idx + word.length;
      if (isCovered(idx, end)) continue; // benign occurrence, keep scanning
      if (ALWAYS_BLOCK.has(word)) return true;
      const before = idx === 0 || !/[a-z0-9]/.test(lower[idx - 1]);
      const after = end >= lower.length || !/[a-z0-9]/.test(lower[end]);
      if (before && after) return true;
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/profanityFilter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/profanityFilter.ts packages/server/src/services/__tests__/profanityFilter.test.ts
git commit -m "fix: profanity filter no longer bypassed by benign substrings"
```

---

## Task 2: Add password auth helper — constant-time verify + byte-length validation (#6, #8)

Login currently skips `bcrypt.compare` for unknown usernames (timing oracle), and password length is checked in characters while bcrypt truncates at 72 bytes. Centralize both in one helper.

**Files:**
- Create: `packages/server/src/services/passwordAuth.ts`
- Test: `packages/server/src/services/__tests__/passwordAuth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/services/__tests__/passwordAuth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcrypt', () => ({
  default: {
    hashSync: vi.fn(() => '$2b$12$dummderpdummderpdummderO'),
    compare: vi.fn(async (pw: string, hash: string) => pw === 'correct' && hash === 'realhash'),
  },
}));

let verifyPassword: typeof import('../passwordAuth.js').verifyPassword;
let passwordLengthError: typeof import('../passwordAuth.js').passwordLengthError;
let bcrypt: typeof import('bcrypt').default;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../passwordAuth.js');
  verifyPassword = mod.verifyPassword;
  passwordLengthError = mod.passwordLengthError;
  bcrypt = (await import('bcrypt')).default;
});

describe('verifyPassword', () => {
  it('runs bcrypt.compare even when the hash is null (constant-time)', async () => {
    const result = await verifyPassword(null, 'anything');
    expect(result).toBe(false);
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('returns true on a matching password', async () => {
    expect(await verifyPassword('realhash', 'correct')).toBe(true);
  });

  it('returns false on a non-matching password', async () => {
    expect(await verifyPassword('realhash', 'wrong')).toBe(false);
  });
});

describe('passwordLengthError', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(passwordLengthError('short')).toMatch(/at least 8/);
  });

  it('rejects passwords longer than 72 bytes (multibyte aware)', () => {
    expect(passwordLengthError('é'.repeat(40))).toMatch(/72 bytes/); // 80 bytes
  });

  it('accepts a valid password', () => {
    expect(passwordLengthError('password123')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/passwordAuth.test.ts`
Expected: FAIL — module `../passwordAuth.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `packages/server/src/services/passwordAuth.ts`:

```ts
import bcrypt from 'bcrypt';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;
export const BCRYPT_COST = 12;

// A valid bcrypt hash used only to spend comparable CPU time when the target
// account does not exist or has no password, so login latency cannot reveal
// whether a username exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_COST);

export async function verifyPassword(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH); // spend equivalent time
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}

export function passwordLengthError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/passwordAuth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/passwordAuth.ts packages/server/src/services/__tests__/passwordAuth.test.ts
git commit -m "feat: add passwordAuth helper for constant-time verify and byte-length validation"
```

---

## Task 3: Wire constant-time login + byte-length validation into routes (#6, #8)

**Files:**
- Modify: `packages/server/src/routes/auth.ts:14-17` (import), `:74-77` (register), `:106-121` (login), `:352-355` (change password)
- Modify: `packages/server/src/scripts/set-password.ts:12-15`

- [ ] **Step 1: Add the import to `auth.ts`**

After line 16 (`import { invalidateTokenVersion } ...`), add:

```ts
import { verifyPassword, passwordLengthError } from '../services/passwordAuth.js';
```

- [ ] **Step 2: Replace the register length check (`auth.ts:74-77`)**

Old:

```ts
    if (password.length < 8 || password.length > 72) {
      res.status(400).json({ error: 'Password must be between 8 and 72 characters' });
      return;
    }
```

New:

```ts
    const pwError = passwordLengthError(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }
```

- [ ] **Step 3: Replace the login lookup/verify (`auth.ts:106-121`)**

Old:

```ts
    const result = await pool.query('SELECT id, username, password_hash, rating, token_version FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const user = result.rows[0];
    if (!user.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
```

New:

```ts
    const result = await pool.query('SELECT id, username, password_hash, rating, token_version FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    // Always run a bcrypt comparison (against a dummy hash when the user or
    // password_hash is missing) so response timing cannot enumerate usernames.
    const valid = await verifyPassword(user?.password_hash, password);
    if (!user || !valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
```

- [ ] **Step 4: Replace the change-password length check (`auth.ts:352-355`)**

Old:

```ts
    if (newPassword.length < 8 || newPassword.length > 72) {
      res.status(400).json({ error: 'New password must be between 8 and 72 characters' });
      return;
    }
```

New:

```ts
    const pwError = passwordLengthError(newPassword);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }
```

- [ ] **Step 5: Update `set-password.ts:12-15` to byte-length validation**

Old:

```ts
if (password.length < 8 || password.length > 72) {
  console.error('Password must be between 8 and 72 characters');
  process.exit(1);
}
```

New:

```ts
import { passwordLengthError } from '../services/passwordAuth.js';

const pwError = passwordLengthError(password);
if (pwError) {
  console.error(pwError);
  process.exit(1);
}
```

(Place the `import` with the other imports at the top, lines 2-3.)

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit`
Expected: no errors. (`bcrypt` is still imported in `auth.ts` for `bcrypt.hash` in register/change-password — leave that import.)

- [ ] **Step 7: Run the full server suite (no regressions)**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/scripts/set-password.ts
git commit -m "fix: constant-time login and byte-accurate password length validation"
```

---

## Task 4: Leaderboard tie-breaker + consistent rank (#7)

`ORDER BY rating DESC` with no tie-breaker makes pagination skip/duplicate tied users, and `getPlayerRank` uses competition ranking that disagrees with the leaderboard's positional ranking. Make both order by `(rating DESC, id ASC)`.

**Files:**
- Create: `packages/server/src/db/migrations/008-leaderboard-tiebreak-index.sql`
- Modify: `packages/server/src/routes/leaderboard.ts:21-28`
- Modify: `packages/server/src/services/ratings.ts:9-15` (and call sites `:32-33`, `:52-53`)
- Test: `packages/server/src/services/__tests__/ratings.test.ts` (add a case)

- [ ] **Step 1: Write the failing test (rank query includes the tie-break + userId)**

Append to `packages/server/src/services/__tests__/ratings.test.ts` inside the existing `describe('updateRatings', ...)`:

```ts
  it('computes rank with a stable id tie-breaker', async () => {
    const client = createMockClient();
    client.pushResult({ rows: [{ id: 'aaa', rating: 1500, rating_deviation: 200, rating_volatility: 0.06 }] });
    client.pushResult({ rows: [{ id: 'bbb', rating: 1500, rating_deviation: 200, rating_volatility: 0.06 }] });
    client.pushResult({ rows: [{ count: '0' }] }); // p1 rank before
    client.pushResult({ rows: [{ count: '0' }] }); // p2 rank before
    client.pushResult({ rows: [] });               // update p1
    client.pushResult({ rows: [] });               // update p2
    client.pushResult({ rows: [{ count: '0' }] }); // p1 rank after
    client.pushResult({ rows: [{ count: '0' }] }); // p2 rank after

    await updateRatings(client as any, 'aaa', 'bbb', 'aaa');

    const rankCalls = client.query.mock.calls.filter((c: any[]) => /COUNT\(\*\)/.test(c[0]));
    expect(rankCalls.length).toBeGreaterThan(0);
    for (const call of rankCalls) {
      expect(call[0]).toMatch(/id <\s*\$2/);     // tie-break clause present
      expect(call[1]).toHaveLength(2);            // [rating, userId]
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/ratings.test.ts`
Expected: FAIL — current rank query has only one param and no `id < $2`.

- [ ] **Step 3: Update `getPlayerRank` in `ratings.ts` (lines 9-15)**

Old:

```ts
async function getPlayerRank(client: PoolClient, rating: number): Promise<number> {
  const result = await client.query(
    'SELECT COUNT(*) FROM users WHERE rating > $1 AND rating_deviation < 350',
    [rating],
  );
  return parseInt(result.rows[0].count, 10) + 1;
}
```

New:

```ts
async function getPlayerRank(client: PoolClient, rating: number, userId: string): Promise<number> {
  // Count users that sort strictly before this one under the leaderboard's
  // (rating DESC, id ASC) ordering, so the rank matches the leaderboard position.
  const result = await client.query(
    `SELECT COUNT(*) FROM users
     WHERE rating_deviation < 350
       AND (rating > $1 OR (rating = $1 AND id < $2))`,
    [rating, userId],
  );
  return parseInt(result.rows[0].count, 10) + 1;
}
```

- [ ] **Step 4: Update the four call sites in `ratings.ts`**

Line 32-33 (ranks before):

```ts
  const p1RankBefore = await getPlayerRank(client, p1RatingBefore, player1Id);
  const p2RankBefore = await getPlayerRank(client, p2RatingBefore, player2Id);
```

Line 52-53 (ranks after):

```ts
  const p1RankAfter = await getPlayerRank(client, newRatings.player1.rating, player1Id);
  const p2RankAfter = await getPlayerRank(client, newRatings.player2.rating, player2Id);
```

(`player1Id`/`player2Id` are non-null here — the function returns early at line 18 when either is null.)

- [ ] **Step 5: Update the leaderboard query (`leaderboard.ts:21-28`)**

Change the `ORDER BY rating DESC` line to add the tie-breaker:

```ts
    const result = await pool.query(
      `SELECT username, rating
       FROM users
       WHERE rating_deviation < 350
       ORDER BY rating DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
```

- [ ] **Step 6: Create the supporting index migration**

Create `packages/server/src/db/migrations/008-leaderboard-tiebreak-index.sql`:

```sql
-- Replace the single-column leaderboard index with a composite that matches
-- the new (rating DESC, id ASC) ordering used by the leaderboard and rank query.
DROP INDEX IF EXISTS idx_users_leaderboard;
CREATE INDEX idx_users_leaderboard ON users (rating DESC, id) WHERE rating_deviation < 350;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/ratings.test.ts`
Expected: PASS (the original `updateRatings` test still passes — rank results are still read positionally from the mock queue).

- [ ] **Step 8: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/routes/leaderboard.ts packages/server/src/services/ratings.ts packages/server/src/services/__tests__/ratings.test.ts packages/server/src/db/migrations/008-leaderboard-tiebreak-index.sql
git commit -m "fix: deterministic leaderboard ordering and consistent player rank"
```

---

## Task 5: Matchmaking — exclude existing opponents in SQL, never drop the searcher (#4)

When the nearest candidate already has an active game with the searcher, `enterQueue` commits and returns without enqueuing the searcher (and never tries another candidate). Filter existing-opponents in the candidate query so the nearest *eligible* candidate is chosen, and fall through to enqueue when none exists.

**Files:**
- Modify: `packages/server/src/services/matchmaking.ts:20-68` (enterQueue), `:121-173` (sweepQueue)
- Test: `packages/server/src/services/__tests__/matchmaking.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/services/__tests__/matchmaking.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const connect = vi.fn();
vi.mock('../../db/pool.js', () => ({ default: { connect } }));
vi.mock('../sse.js', () => ({ sendEvent: vi.fn(), broadcastLobbyStats: vi.fn() }));
vi.mock('../gameEngine.js', () => ({
  initializeGame: () => ({ board: [], tileBag: [], player1Rack: [] }),
  drawTilesForPlayer2: () => ({ rack: [], remainingBag: [] }),
}));

let enterQueue: typeof import('../matchmaking.js').enterQueue;

function mockClient(steps: any[]) {
  let i = 0;
  return {
    query: vi.fn(async () => steps[i++] ?? { rows: [] }),
    release: vi.fn(),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  enterQueue = (await import('../matchmaking.js')).enterQueue;
});

describe('enterQueue', () => {
  it('enqueues the searcher when no eligible candidate exists', async () => {
    const client = mockClient([
      { rows: [] },                       // BEGIN
      { rows: [{ acquired: true }] },     // advisory lock
      { rows: [] },                       // match query -> no eligible candidate
      { rows: [] },                       // INSERT into matchmaking_queue
      { rows: [] },                       // COMMIT
      { rows: [] },                       // advisory unlock
    ]);
    connect.mockResolvedValue(client);

    const result = await enterQueue('u1', 1500, 200);

    expect(result).toEqual({ matched: false });
    const sqls = client.query.mock.calls.map((c: any[]) => c[0] as string);
    expect(sqls.some(s => /NOT EXISTS/.test(s))).toBe(true);                 // candidate query filters existing opponents
    expect(sqls.some(s => /INSERT INTO matchmaking_queue/.test(s))).toBe(true); // searcher enqueued, not dropped
  });

  it('creates a game when an eligible candidate is found', async () => {
    const client = mockClient([
      { rows: [] },                                            // BEGIN
      { rows: [{ acquired: true }] },                          // advisory lock
      { rows: [{ id: 'q2', user_id: 'u2', rating: 1500 }] },   // match query
      { rows: [] },                                            // DELETE opponent
      { rows: [] },                                            // DELETE self
      { rows: [{ id: 'g1' }] },                                // INSERT games
      { rows: [] },                                            // COMMIT
      { rows: [] },                                            // advisory unlock
    ]);
    connect.mockResolvedValue(client);

    const result = await enterQueue('u1', 1500, 200);
    expect(result).toEqual({ matched: true, gameId: 'g1' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/matchmaking.test.ts`
Expected: FAIL — first test fails because the current code returns `{matched:false}` without inserting (and the candidate query has no `NOT EXISTS`).

- [ ] **Step 3: Rewrite the `enterQueue` match block (`matchmaking.ts:20-68`)**

Replace lines 20-68 (from `// Try to find a match first` through the closing of the `if (matchResult.rows.length > 0)` block) with:

```ts
      // Find the nearest eligible candidate, excluding anyone we already have an
      // active game against (so we never get stuck on an ineligible nearest match).
      const matchResult = await client.query(
        `SELECT id, user_id, rating FROM matchmaking_queue mq
         WHERE user_id != $1
         AND rating BETWEEN $2 - (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
                      AND $2 + (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
         AND NOT EXISTS (
           SELECT 1 FROM games g WHERE g.status = 'active'
           AND ((g.player1_id = $1 AND g.player2_id = mq.user_id)
             OR (g.player1_id = mq.user_id AND g.player2_id = $1))
         )
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
```

(This removes the separate `existingGame` SELECT and the early `return { matched: false }` — the no-match path below at lines 70-76 now always runs the `INSERT INTO matchmaking_queue ... ON CONFLICT DO NOTHING`.)

- [ ] **Step 4: Apply the same exclusion in `sweepQueue` (`matchmaking.ts:121-146`)**

Replace the candidate query and the `existingGame` skip (lines 121-146) with:

```ts
          const matchResult = await client.query(
            `SELECT id, user_id, rating FROM matchmaking_queue mq
             WHERE user_id != $1
             AND user_id != ALL($3::uuid[])
             AND rating BETWEEN $2 - (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
                          AND $2 + (100 + EXTRACT(EPOCH FROM NOW() - queued_at) * 2)
             AND NOT EXISTS (
               SELECT 1 FROM games g WHERE g.status = 'active'
               AND ((g.player1_id = $1 AND g.player2_id = mq.user_id)
                 OR (g.player1_id = mq.user_id AND g.player2_id = $1))
             )
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
```

(Delete the now-redundant `existingGame` SELECT and its `if (existingGame.rows.length > 0) { ... continue; }` block; the rest of the `if (matchResult.rows.length > 0)` body — game creation, COMMIT, notifications — is unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/matchmaking.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/matchmaking.ts packages/server/src/services/__tests__/matchmaking.test.ts
git commit -m "fix: matchmaking excludes existing opponents in SQL and never drops the searcher"
```

---

## Task 6: Atomic waiting-game cap (#9)

The 5-waiting-games cap does `COUNT` then `INSERT` in two un-synchronized queries (TOCTOU). Extract creation into a service that serializes per-user with a transaction advisory lock.

**Files:**
- Create: `packages/server/src/services/inviteGames.ts`
- Test: `packages/server/src/services/__tests__/inviteGames.test.ts`
- Modify: `packages/server/src/routes/games.ts:1-65`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/services/__tests__/inviteGames.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const connect = vi.fn();
vi.mock('../../db/pool.js', () => ({ default: { connect } }));
vi.mock('../gameEngine.js', () => ({
  initializeGame: () => ({ board: [], tileBag: [], player1Rack: [] }),
}));
vi.mock('../matchmaking.js', () => ({ generateInviteCode: () => 'GARDEN-ABC234' }));

let createWaitingGame: typeof import('../inviteGames.js').createWaitingGame;
let WaitingGameLimitError: typeof import('../inviteGames.js').WaitingGameLimitError;

function mockClient(steps: any[]) {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const step = steps[i++] ?? { rows: [] };
      if (step && step.throw) throw step.throw;
      return step;
    }),
    release: vi.fn(),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../inviteGames.js');
  createWaitingGame = mod.createWaitingGame;
  WaitingGameLimitError = mod.WaitingGameLimitError;
});

describe('createWaitingGame', () => {
  it('acquires a per-user advisory lock before counting, then inserts', async () => {
    const client = mockClient([
      { rows: [] },                                              // BEGIN
      { rows: [] },                                              // pg_advisory_xact_lock
      { rows: [{ count: '0' }] },                               // COUNT
      { rows: [] },                                              // SAVEPOINT
      { rows: [{ id: 'g1', invite_code: 'GARDEN-ABC234' }] },   // INSERT
      { rows: [] },                                              // RELEASE SAVEPOINT
      { rows: [] },                                              // COMMIT
    ]);
    connect.mockResolvedValue(client);

    const result = await createWaitingGame('u1');

    expect(result).toEqual({ id: 'g1', inviteCode: 'GARDEN-ABC234' });
    const sqls = client.query.mock.calls.map((c: any[]) => c[0] as string);
    const lockIdx = sqls.findIndex(s => /pg_advisory_xact_lock/.test(s));
    const countIdx = sqls.findIndex(s => /COUNT\(\*\)/.test(s));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(countIdx); // lock taken before the count
  });

  it('throws WaitingGameLimitError and does not insert when at the cap', async () => {
    const client = mockClient([
      { rows: [] },                 // BEGIN
      { rows: [] },                 // advisory lock
      { rows: [{ count: '5' }] },   // COUNT -> at cap
      { rows: [] },                 // ROLLBACK
    ]);
    connect.mockResolvedValue(client);

    await expect(createWaitingGame('u1')).rejects.toBeInstanceOf(WaitingGameLimitError);
    const sqls = client.query.mock.calls.map((c: any[]) => c[0] as string);
    expect(sqls.some(s => /INSERT INTO games/.test(s))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/inviteGames.test.ts`
Expected: FAIL — `../inviteGames.js` does not exist.

- [ ] **Step 3: Implement the service**

Create `packages/server/src/services/inviteGames.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/inviteGames.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the route (`games.ts`)**

Add the import after line 6 (`import { enterQueue, ... } from '../services/matchmaking.js';`):

```ts
import { createWaitingGame, WaitingGameLimitError } from '../services/inviteGames.js';
```

Replace the whole `router.post('/', requireAuth, ...)` handler body (lines 28-65) with:

```ts
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id, inviteCode } = await createWaitingGame(req.user!.userId);
    res.json({ id, inviteCode });
  } catch (err) {
    if (err instanceof WaitingGameLimitError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Create game error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit`
Expected: no errors. (`initializeGame` may now be unused in `games.ts` — if `tsc` flags it, remove `initializeGame` from the `gameEngine.js` import on line 5, keeping `drawTilesForPlayer2`.)

- [ ] **Step 7: Run the full server suite**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/services/inviteGames.ts packages/server/src/services/__tests__/inviteGames.test.ts packages/server/src/routes/games.ts
git commit -m "fix: enforce waiting-game cap atomically under a per-user advisory lock"
```

---

## Task 7: Clear the lobby-stats debounce timer on shutdown (#10)

`broadcastLobbyStats` schedules a module-global `setTimeout` that nothing clears on shutdown, so it can fire `pool.query` after `pool.end()`. Add `stopLobbyStats()` and call it during shutdown.

**Files:**
- Modify: `packages/server/src/services/sse.ts:94-111`
- Modify: `packages/server/src/index.ts:14` (import), `:141-157` (shutdown)
- Test: `packages/server/src/services/__tests__/sse.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/services/__tests__/sse.test.ts` inside `describe('sse', ...)`:

```ts
  it('stopLobbyStats prevents a pending lobby-stats query from firing', async () => {
    vi.useFakeTimers();
    const { default: pool } = await import('../../db/pool.js');
    (pool.query as any).mockResolvedValue({ rows: [{ count: 0 }] });
    const mod = await import('../sse.js');

    mod.broadcastLobbyStats();   // schedules the 500ms debounce timer
    mod.stopLobbyStats();        // must cancel it

    await vi.advanceTimersByTimeAsync(600);
    expect(pool.query).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/sse.test.ts`
Expected: FAIL — `mod.stopLobbyStats` is not a function.

- [ ] **Step 3: Update `sse.ts` (lines 94-111)**

Replace:

```ts
let lobbyStatsTimer: ReturnType<typeof setTimeout> | null = null;

export function broadcastLobbyStats(): void {
  if (lobbyStatsTimer) return;
  lobbyStatsTimer = setTimeout(async () => {
```

with:

```ts
let lobbyStatsTimer: ReturnType<typeof setTimeout> | null = null;
let lobbyStatsStopped = false;

export function stopLobbyStats(): void {
  lobbyStatsStopped = true;
  if (lobbyStatsTimer) {
    clearTimeout(lobbyStatsTimer);
    lobbyStatsTimer = null;
  }
}

export function broadcastLobbyStats(): void {
  if (lobbyStatsStopped || lobbyStatsTimer) return;
  lobbyStatsTimer = setTimeout(async () => {
```

(The rest of the `setTimeout` callback is unchanged.)

- [ ] **Step 4: Wire shutdown in `index.ts`**

Update the import on line 14 to include `stopLobbyStats`:

```ts
import { addClient, closeAllConnections, isAtCapacity, sendLobbyStats, stopLobbyStats } from './services/sse.js';
```

In `shutdown()` (after `closeAllConnections();` on line 146), add:

```ts
    stopLobbyStats();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/sse.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/sse.ts packages/server/src/index.ts packages/server/src/services/__tests__/sse.test.ts
git commit -m "fix: cancel lobby-stats debounce timer on shutdown"
```

---

## Task 8: Cross-process token-version revocation via LISTEN/NOTIFY (#5)

The offline `set-password.ts` bumps `token_version` in the DB but cannot invalidate the running server's in-memory cache (≤30s stale window). Emit a Postgres NOTIFY on every token-version change and have the server LISTEN and invalidate.

**Files:**
- Create: `packages/server/src/services/tokenVersionListener.ts`
- Test: `packages/server/src/services/__tests__/tokenVersionListener.test.ts`
- Modify: `packages/server/src/scripts/set-password.ts`
- Modify: `packages/server/src/routes/auth.ts` (change-password + delete-account paths)
- Modify: `packages/server/src/index.ts` (start/stop the listener)

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/services/__tests__/tokenVersionListener.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invalidateTokenVersion = vi.fn();
vi.mock('../tokenVersionCache.js', () => ({ invalidateTokenVersion }));

let mod: typeof import('../tokenVersionListener.js');

beforeEach(async () => {
  vi.clearAllMocks();
  mod = await import('../tokenVersionListener.js');
});

describe('handleTokenVersionNotification', () => {
  it('invalidates the cache for the userId in the payload', () => {
    mod.handleTokenVersionNotification({ channel: mod.TOKEN_VERSION_CHANNEL, payload: 'user-1' });
    expect(invalidateTokenVersion).toHaveBeenCalledWith('user-1');
  });

  it('ignores notifications on other channels', () => {
    mod.handleTokenVersionNotification({ channel: 'something_else', payload: 'user-1' });
    expect(invalidateTokenVersion).not.toHaveBeenCalled();
  });

  it('ignores notifications with no payload', () => {
    mod.handleTokenVersionNotification({ channel: mod.TOKEN_VERSION_CHANNEL });
    expect(invalidateTokenVersion).not.toHaveBeenCalled();
  });
});

describe('notifyTokenVersionChanged', () => {
  it('issues pg_notify with the channel and userId', async () => {
    const executor = { query: vi.fn(async () => ({ rows: [] })) };
    await mod.notifyTokenVersionChanged(executor, 'user-7');
    expect(executor.query).toHaveBeenCalledWith(
      'SELECT pg_notify($1, $2)',
      [mod.TOKEN_VERSION_CHANNEL, 'user-7'],
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/tokenVersionListener.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the listener**

Create `packages/server/src/services/tokenVersionListener.ts`:

```ts
import pg from 'pg';
import { invalidateTokenVersion } from './tokenVersionCache.js';

export const TOKEN_VERSION_CHANNEL = 'token_version_changed';

const DEFAULT_CONN = 'postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden';

let client: pg.Client | null = null;
let stopped = false;
let connStr: string | undefined;

// Pure handler so it can be unit-tested without a live connection.
export function handleTokenVersionNotification(msg: { channel: string; payload?: string }): void {
  if (msg.channel !== TOKEN_VERSION_CHANNEL || !msg.payload) return;
  // Delete the cache entry; the next requireAuth re-reads the true version from the DB.
  invalidateTokenVersion(msg.payload);
}

export async function notifyTokenVersionChanged(
  executor: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  userId: string,
): Promise<void> {
  await executor.query('SELECT pg_notify($1, $2)', [TOKEN_VERSION_CHANNEL, userId]);
}

async function connect(): Promise<void> {
  client = new pg.Client({ connectionString: connStr });
  client.on('notification', handleTokenVersionNotification);
  client.on('error', (err) => {
    console.error('Token version listener error:', err);
    void reconnect();
  });
  await client.connect();
  await client.query(`LISTEN ${TOKEN_VERSION_CHANNEL}`); // channel is a constant, not user input
}

async function reconnect(): Promise<void> {
  if (stopped) return;
  try { if (client) await client.end(); } catch { /* ignore */ }
  client = null;
  setTimeout(() => {
    if (!stopped) void connect().catch((err) => console.error('Token listener reconnect failed:', err));
  }, 1000);
}

export async function startTokenVersionListener(connectionString?: string): Promise<void> {
  stopped = false;
  connStr = connectionString || process.env.DATABASE_URL || DEFAULT_CONN;
  await connect();
}

export async function stopTokenVersionListener(): Promise<void> {
  stopped = true;
  if (client) {
    try { await client.end(); } catch { /* ignore */ }
    client = null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run src/services/__tests__/tokenVersionListener.test.ts`
Expected: PASS

- [ ] **Step 5: Emit NOTIFY from `set-password.ts`**

Add the import near the top (with the other imports):

```ts
import { notifyTokenVersionChanged } from '../services/tokenVersionListener.js';
```

After the success branch (right before `console.log(\`Password updated for ...\`)`), add:

```ts
  await notifyTokenVersionChanged(pool, result.rows[0].id);
```

- [ ] **Step 6: Emit NOTIFY from the in-app token bumps (`auth.ts`)**

Add the import after line 16:

```ts
import { notifyTokenVersionChanged } from '../services/tokenVersionListener.js';
```

In the change-password handler, after `invalidateTokenVersion(userId, newVersion);` (line 388), add:

```ts
    await notifyTokenVersionChanged(pool, userId);
```

In the delete-account handler, after `invalidateTokenVersion(userId);` (line 450), add:

```ts
    await notifyTokenVersionChanged(pool, userId);
```

(The local `invalidateTokenVersion` keeps the originating instance immediate; the NOTIFY covers other instances and offline scripts.)

- [ ] **Step 7: Start/stop the listener in `index.ts`**

Add the import after line 17:

```ts
import { startTokenVersionListener, stopTokenVersionListener } from './services/tokenVersionListener.js';
```

In `start()`, after `await loadDictionary();` (line 133), add:

```ts
  await startTokenVersionListener();
```

In `shutdown()`, after `stopLobbyStats();` (added in Task 7), add:

```ts
    void stopTokenVersionListener();
```

- [ ] **Step 8: Typecheck + full suite**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/services/tokenVersionListener.ts packages/server/src/services/__tests__/tokenVersionListener.test.ts packages/server/src/scripts/set-password.ts packages/server/src/routes/auth.ts packages/server/src/index.ts
git commit -m "fix: invalidate token-version cache across processes via LISTEN/NOTIFY"
```

---

## Task 9: Add Vitest + React Testing Library to the client

The client has no unit-test runner. Add one so the remaining client fixes are TDD'd.

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/vite.config.ts`
- Create: `packages/client/vitest.setup.ts`
- Create: `packages/client/src/test/setup.test.ts`

- [ ] **Step 1: Install dev dependencies**

Run:

```bash
cd /home/lab/tmp/word-garden/packages/client
npm install -D vitest@^3.0.0 jsdom@^25.0.0 @testing-library/react@^16.1.0 @testing-library/dom@^10.4.0 @testing-library/user-event@^14.5.2 @testing-library/jest-dom@^6.6.3
```

- [ ] **Step 2: Add the Vitest config to `vite.config.ts`**

Replace the file contents with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const basePath = process.env.VITE_BASE_PATH || '';

export default defineConfig({
  base: basePath ? `${basePath}/` : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 3: Create the setup file**

Create `packages/client/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add test scripts to `package.json`**

In `packages/client/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test**

Create `packages/client/src/test/setup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('client test harness', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
```

- [ ] **Step 6: Run the smoke test to verify the harness works**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/test/setup.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/client/package.json packages/client/package-lock.json packages/client/vite.config.ts packages/client/vitest.setup.ts packages/client/src/test/setup.test.ts
git commit -m "chore: add Vitest + React Testing Library to the client"
```

---

## Task 10: Show an error (not an infinite spinner) when a game fails to load (#2)

`Game.tsx` returns the loading spinner whenever `game` is null, and the only error render sits below that early return — so a failed initial load shows "Loading…" forever. Extract a pure load-state component and render it (with the error) in the `!game` branch.

**Files:**
- Create: `packages/client/src/pages/GameLoadState.tsx`
- Test: `packages/client/src/pages/GameLoadState.test.tsx`
- Modify: `packages/client/src/pages/Game.tsx:56-58`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/pages/GameLoadState.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameLoadState } from './GameLoadState.js';

describe('GameLoadState', () => {
  it('shows the loading message when there is no error', () => {
    render(<GameLoadState error="" onBack={() => {}} />);
    expect(screen.getByText(/loading game/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the error and a back button when loading failed', async () => {
    const onBack = vi.fn();
    render(<GameLoadState error="Game not found" onBack={onBack} />);
    expect(screen.getByText('Game not found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /lobby/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/pages/GameLoadState.test.tsx`
Expected: FAIL — `./GameLoadState.js` does not exist.

- [ ] **Step 3: Implement the component**

Create `packages/client/src/pages/GameLoadState.tsx`:

```tsx
import styles from './Game.module.css';

export function GameLoadState({ error, onBack }: { error: string; onBack: () => void }) {
  if (error) {
    return (
      <div className={styles.loading}>
        <p className={styles.error}>{error}</p>
        <button onClick={onBack} className={styles.backButton}>&larr; Back to Lobby</button>
      </div>
    );
  }
  return <div className={styles.loading}>Loading game...</div>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/pages/GameLoadState.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire it into `Game.tsx`**

Add the import after line 7 (`import { TileDragProvider } ...`):

```tsx
import { GameLoadState } from './GameLoadState.js';
```

Replace the early return (lines 56-58):

```tsx
  if (!game) {
    return <div className={styles.loading}>Loading game...</div>;
  }
```

with:

```tsx
  if (!game) {
    return <GameLoadState error={error} onBack={() => navigate('/')} />;
  }
```

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/pages/GameLoadState.tsx packages/client/src/pages/GameLoadState.test.tsx packages/client/src/pages/Game.tsx
git commit -m "fix: show error and recovery instead of infinite spinner on game load failure"
```

---

## Task 11: Return a board tile to the rack when dropped off-board (#3)

`Board` receives `onReturnToRack` but never calls it; dragging a tentative tile off the board does nothing. Extract the drop decision into a pure function, test it, and wire it into `handlePointerUp`.

**Files:**
- Create: `packages/client/src/components/dragLogic.ts`
- Test: `packages/client/src/components/dragLogic.test.ts`
- Modify: `packages/client/src/components/Board.tsx:70-91`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/components/dragLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDrop } from './dragLogic.js';

describe('resolveDrop', () => {
  it('places a rack tile on an empty board cell', () => {
    expect(resolveDrop({ row: 3, col: 4 }, false, { type: 'rack', index: 2 }))
      .toEqual({ action: 'placeFromRack', row: 3, col: 4, rackIndex: 2 });
  });

  it('moves a tentative tile to an empty board cell', () => {
    expect(resolveDrop({ row: 3, col: 4 }, false, { type: 'board', row: 1, col: 1 }))
      .toEqual({ action: 'moveTentative', fromRow: 1, fromCol: 1, toRow: 3, toCol: 4 });
  });

  it('does nothing when dropped on a blocked board cell', () => {
    expect(resolveDrop({ row: 3, col: 4 }, true, { type: 'board', row: 1, col: 1 }))
      .toEqual({ action: 'none' });
  });

  it('returns a board tile to the rack when dropped off the board', () => {
    expect(resolveDrop(null, false, { type: 'board', row: 1, col: 1 }))
      .toEqual({ action: 'returnToRack', row: 1, col: 1 });
  });

  it('does nothing when a rack tile is dropped off the board', () => {
    expect(resolveDrop(null, false, { type: 'rack', index: 2 }))
      .toEqual({ action: 'none' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/components/dragLogic.test.ts`
Expected: FAIL — `./dragLogic.js` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `packages/client/src/components/dragLogic.ts`:

```ts
import type { DragSource } from '../context/TileDragContext.js';

export type DropResult =
  | { action: 'placeFromRack'; row: number; col: number; rackIndex: number }
  | { action: 'moveTentative'; fromRow: number; fromCol: number; toRow: number; toCol: number }
  | { action: 'returnToRack'; row: number; col: number }
  | { action: 'none' };

export function resolveDrop(
  pos: { row: number; col: number } | null,
  targetBlocked: boolean,
  source: DragSource,
): DropResult {
  if (pos) {
    if (targetBlocked) return { action: 'none' };
    if (source.type === 'rack') {
      return { action: 'placeFromRack', row: pos.row, col: pos.col, rackIndex: source.index };
    }
    return { action: 'moveTentative', fromRow: source.row, fromCol: source.col, toRow: pos.row, toCol: pos.col };
  }
  // Dropped off the board: a board-sourced tile goes back to the rack.
  if (source.type === 'board') {
    return { action: 'returnToRack', row: source.row, col: source.col };
  }
  return { action: 'none' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/components/dragLogic.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `resolveDrop` into `Board.tsx`**

Add the import after line 6 (`import type { BoardCell, ... }`):

```tsx
import { resolveDrop } from './dragLogic.js';
```

Replace `handlePointerUp` (lines 70-91) with:

```tsx
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const boardEl = boardRef.current;
    const pos = boardEl ? getCellFromPointer(e, boardEl) : null;
    const targetBlocked = pos
      ? (!!board[pos.row][pos.col].tile || tentativePlacements.some(t => t.row === pos.row && t.col === pos.col))
      : false;

    const result = resolveDrop(pos, targetBlocked, dragState.source);
    switch (result.action) {
      case 'placeFromRack':
        onDropFromRack?.(result.row, result.col, result.rackIndex);
        break;
      case 'moveTentative':
        onMoveTentative?.(result.fromRow, result.fromCol, result.toRow, result.toCol);
        break;
      case 'returnToRack':
        onReturnToRack?.(result.row, result.col);
        break;
    }

    setHoverCell(null);
    endDrag();
  }, [dragState, board, tentativePlacements, onDropFromRack, onMoveTentative, onReturnToRack, endDrag]);
```

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx tsc --noEmit`
Expected: no errors. (`onReturnToRack` is now used, clearing the unused-prop concern.)

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/dragLogic.ts packages/client/src/components/dragLogic.test.ts packages/client/src/components/Board.tsx
git commit -m "fix: dragging a tentative tile off the board returns it to the rack"
```

---

## Task 12: Remove blank tile by identity, cancel pending blank on reload (#11)

`confirmBlankTile` removes the rack tile by an index captured at placement time; a reorder/shuffle/reload between placement and confirm corrupts the rack. Remove by stable `_id`, and clear `pendingBlankPlacement` on `loadGame`.

**Files:**
- Modify: `packages/client/src/hooks/useGame.ts:80-87` (loadGame reset), `:166-176` (confirmBlankTile)
- Test: `packages/client/src/hooks/__tests__/useGame.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/hooks/__tests__/useGame.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../api.js', () => ({ apiFetch }));
vi.mock('../useSSE.js', () => ({ useSSE: () => {} }));

import { useGame } from '../useGame.js';

function emptyBoard() {
  return Array.from({ length: 15 }, () =>
    Array.from({ length: 15 }, () => ({ tile: null })),
  );
}

function gameData() {
  return {
    id: 'g1', playerNumber: 1, opponentUsername: 'bob', opponentRating: 1500,
    board: emptyBoard(), currentTurn: 1, player1Score: 0, player2Score: 0,
    status: 'active', winnerId: null,
    rack: [
      { letter: '', points: 0 },   // blank
      { letter: 'A', points: 1 },
      { letter: 'B', points: 3 },
      { letter: 'C', points: 3 },
    ],
    tilesRemaining: 50, opponentTileCount: 7,
    lastMove: null, previousMove: null, ratingChanges: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue(gameData());
});

describe('useGame blank tile placement', () => {
  it('removes the correct (blank) tile even after the rack is reordered', async () => {
    const { result } = renderHook(() => useGame('g1'));
    await waitFor(() => expect(result.current.game).not.toBeNull());

    // Place the blank (index 0) on the center cell -> opens the blank picker.
    act(() => { result.current.placeTileFromRack(7, 7, 0); });
    // Reorder the rack so index 0 no longer points at the blank.
    act(() => { result.current.reorderRack(0, 3); });
    // Confirm the blank as 'Q'.
    act(() => { result.current.confirmBlankTile('Q'); });

    // The blank must be gone from the rack and present as a tentative placement.
    expect(result.current.rack.some(t => t.letter === '')).toBe(false);
    expect(result.current.rack).toHaveLength(3);
    expect(result.current.tentativePlacements).toEqual([
      expect.objectContaining({ row: 7, col: 7, letter: 'Q', isBlank: true }),
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/hooks/__tests__/useGame.test.ts`
Expected: FAIL — index-based removal deletes the wrong tile after reorder, so a blank remains in the rack.

- [ ] **Step 3: Remove by `_id` in `confirmBlankTile` (`useGame.ts:166-176`)**

Replace:

```ts
    setRack(prev => prev.filter((_, i) => i !== rackIndex));
```

(inside `confirmBlankTile`) with:

```ts
    setRack(prev => prev.filter(t => t._id !== originalTile._id));
```

- [ ] **Step 4: Cancel a pending blank when the game reloads (`useGame.ts:80-83`)**

In `loadGame`, after `setTentativePlacements([]);` (line 80), add:

```ts
      setPendingBlankPlacement(null);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/hooks/__tests__/useGame.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/hooks/useGame.ts packages/client/src/hooks/__tests__/useGame.test.ts
git commit -m "fix: blank tile removed by identity and cleared on game reload"
```

---

## Task 13: Guard the login form against double submit (#12)

The disabled buttons block clicks but not Enter; mashing Enter re-submits. Add a synchronous in-flight guard.

**Files:**
- Modify: `packages/client/src/pages/Login.tsx:1`, `:11-47`
- Test: `packages/client/src/pages/Login.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/pages/Login.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login.js';

function noopProps() {
  return {
    onLogin: vi.fn(() => new Promise<any>(() => {})), // never resolves -> stays in-flight
    onRegister: vi.fn(() => new Promise<any>(() => {})),
    onLoginPasskey: vi.fn(() => new Promise<any>(() => {})),
    onRegisterPasskey: vi.fn(() => new Promise<any>(() => {})),
  };
}

describe('Login double-submit guard', () => {
  it('calls onLogin only once when the form is submitted twice while in flight', async () => {
    const props = noopProps();
    const { container } = render(<Login {...props} />);
    await userEvent.type(screen.getByPlaceholderText('Username'), 'alice');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'password123');

    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/pages/Login.test.tsx`
Expected: FAIL — `onLogin` is called twice.

- [ ] **Step 3: Add a ref guard in `Login.tsx`**

Change the import on line 1:

```tsx
import { useState, useRef } from 'react';
```

After `const [loading, setLoading] = useState(false);` (line 15), add:

```tsx
  const inFlight = useRef(false);
```

At the very start of `handleSubmit` (before `setError('')`, line 18) add:

```tsx
    if (inFlight.current) return;
    inFlight.current = true;
```

and in its `finally` block (line 28-30) set it back:

```tsx
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
```

Apply the identical guard to `handlePasskey`: add `if (inFlight.current) return; inFlight.current = true;` at the start (before line 34's `setError('')`), and `inFlight.current = false;` in its `finally` (line 45-47).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run src/pages/Login.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/Login.tsx packages/client/src/pages/Login.test.tsx
git commit -m "fix: prevent duplicate login/register submission via Enter key"
```

---

## Task 14: Full verification

- [ ] **Step 1: Run the entire server suite**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx vitest run`
Expected: all PASS.

- [ ] **Step 2: Run the entire client suite**

Run: `cd /home/lab/tmp/word-garden/packages/client && npx vitest run`
Expected: all PASS.

- [ ] **Step 3: Typecheck both packages**

Run: `cd /home/lab/tmp/word-garden/packages/server && npx tsc --noEmit && cd /home/lab/tmp/word-garden/packages/client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build (catches anything tests miss)**

Run: `cd /home/lab/tmp/word-garden && npm run build --workspaces --if-present`
Expected: server `tsc` build and client `vite build` both succeed.

- [ ] **Step 5: (Optional) Manual DB smoke for migration 008 and LISTEN/NOTIFY**

Run the stack (`docker-compose up`), confirm migration `008-leaderboard-tiebreak-index.sql` applies cleanly, then run `npm run set-password --workspace @word-garden/server -- <user> <newpass>` and confirm an existing session is rejected on its next request (token-version listener invalidated the cache).

---

## Self-Review

**Spec coverage** — every numbered review item maps to a task:
- #1 profanity bypass → Task 1
- #2 game load infinite spinner → Task 10
- #3 board→rack drag → Task 11
- #4 matchmaking silent drop → Task 5
- #5 token revocation (LISTEN/NOTIFY) → Task 8
- #6 login timing side-channel → Tasks 2 + 3
- #7 leaderboard tie-breaker / rank consistency → Task 4
- #8 bcrypt 72-byte truncation → Tasks 2 + 3
- #9 waiting-game TOCTOU → Task 6
- #10 lobby-stats timer shutdown → Task 7
- #11 confirmBlankTile stale index → Task 12
- #12 login double-submit → Task 13
- Client test harness (prerequisite for #2/#3/#11/#12) → Task 9

**Type consistency** — `verifyPassword`/`passwordLengthError` (Task 2) are used as defined in Task 3; `createWaitingGame`/`WaitingGameLimitError` (Task 6) match the route import; `stopLobbyStats` (Task 7) matches the `index.ts` import; `TOKEN_VERSION_CHANNEL`/`handleTokenVersionNotification`/`notifyTokenVersionChanged`/`startTokenVersionListener`/`stopTokenVersionListener` (Task 8) match all call sites; `resolveDrop`/`DropResult`/`DragSource` (Task 11) reuse the existing `DragSource` from `TileDragContext`; `GameLoadState` props (Task 10) match the `Game.tsx` call.

**Ordering note** — Task 9 (client harness) must precede Tasks 10-13. Server Tasks 1-8 are independent and may run in any order, but Tasks 2→3 and 6 (route wiring) and 7→8 (shared `index.ts` shutdown edits) should keep their stated order to avoid merge churn in `index.ts`/`auth.ts`.

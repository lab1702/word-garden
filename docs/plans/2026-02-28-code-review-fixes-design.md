# Code Review Fixes Design

Six fixes addressing issues found during full-project code review.

## Fix 1: Auth middleware token_version cache

Every authenticated request queries the DB for `token_version`, which will exhaust the connection pool under load.

Add an in-memory cache in a new `tokenVersionCache.ts` service. Cache entries have a 30-second TTL. On password change or account deletion, invalidate the entry. The auth middleware checks the cache first, falling back to DB on miss.

Files: new `services/tokenVersionCache.ts`, modify `middleware/auth.ts`, `routes/auth.ts`.

## Fix 2: Matchmaking sweep advisory lock

`sweepQueue` reads the queue outside a transaction, allowing race conditions with concurrent `enterQueue` calls.

Wrap `sweepQueue` in `pg_try_advisory_lock(42)`. If the lock is held, skip the sweep. Release with `pg_advisory_unlock(42)` in a finally block.

Files: modify `services/matchmaking.ts`.

## Fix 3: Fix useSSE useMemo

The `useMemo` dependency array recalculates on every render, making it pointless and causing unnecessary EventSource reconnections.

Remove `useMemo`. Compute `eventKeys` as a plain string. Use it directly in the `useEffect` dependency array.

Files: modify `hooks/useSSE.ts`.

## Fix 4: Clean up ChangePasswordModal timer

`setTimeout(onClose, 1500)` can fire after unmount. Store the timeout ID in a `useRef` and clear it in a cleanup `useEffect`. Also add `autoComplete` attributes to password inputs.

Files: modify `components/ChangePasswordModal.tsx`.

## Fix 5: Add missing DB indexes

Leaderboard and last-move queries lack supporting indexes.

New migration adding:
- `idx_users_leaderboard` — partial index on `rating DESC` where `rating_deviation < 350`
- `idx_moves_game_created` — composite index on `(game_id, created_at DESC)`

Files: new `db/migrations/005-performance-indexes.sql`.

## Fix 6: Extract shared updateRatings

Rating update logic is duplicated between `games.ts` and `auth.ts`.

Extract into `services/ratings.ts` with signature `updateRatings(client, player1Id, player2Id, winnerId)`. Import in both route files.

Files: new `services/ratings.ts`, modify `routes/games.ts`, `routes/auth.ts`.

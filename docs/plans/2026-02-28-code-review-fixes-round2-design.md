# Code Review Fixes Round 2 Design

Five fixes addressing remaining issues from full-project code review.

## I1: Add advisory lock to enterQueue

`enterQueue` races with `sweepQueue` because it doesn't acquire the same advisory lock. Add `pg_advisory_lock(42)` (blocking) around the matching logic in `enterQueue`. Blocking is acceptable since sweeps are fast (<100ms).

Files: modify `services/matchmaking.ts`.

## I2: Fix loadGame failure after submitMove

`submitMove` sets rack optimistically before `loadGame()`, creating inconsistent state if `loadGame` fails. Remove the early `setRack` — `loadGame()` already sets rack from server. Same fix for `exchangeTiles`.

Files: modify `hooks/useGame.ts`.

## I4: Rate limit leaderboard endpoint

Add `express-rate-limit` to leaderboard route (60 req/min). Same pattern as other routes.

Files: modify `routes/leaderboard.ts`.

## I6: Add JSDoc warning to shared shuffleBag

Mark `shuffleBag` as client-only with JSDoc. Server uses `secureShuffleBag` already.

Files: modify `shared/src/tiles.ts`.

## I7: Extract move handlers

Extract `handlePlayMove`, `handlePassMove`, `handleExchangeMove` into `services/moveHandlers.ts`. Route handler keeps common preamble (auth, game lookup, turn check) and delegates. Each handler returns a result object; route sends response and notifications.

Files: new `services/moveHandlers.ts`, modify `routes/games.ts`.

# End-of-Game Rating & Rank Changes

## Summary

Show both players' rating change and leaderboard rank change on the game-over overlay. Both players see both changes (e.g. "PlayerOne 1547 (+47) #3 → #2 / PlayerTwo 1480 (-32) #2 → #3").

## Approach

Store before/after rating and rank in the games table so data is accurate even when revisiting old games.

## Database Migration

Add 8 nullable columns to `games`:
- `player1_rating_before DOUBLE PRECISION`
- `player1_rating_after DOUBLE PRECISION`
- `player2_rating_before DOUBLE PRECISION`
- `player2_rating_after DOUBLE PRECISION`
- `player1_rank_before INT`
- `player1_rank_after INT`
- `player2_rank_before INT`
- `player2_rank_after INT`

All nullable — existing finished games and in-progress games won't have this data.

## Backend Changes

### `ratings.ts` — `updateRatings()`

1. Capture both players' ratings before update (already fetched via SELECT FOR UPDATE)
2. Compute leaderboard rank before update: `SELECT COUNT(*) + 1 FROM users WHERE rating > $playerRating AND rating_deviation < 350`
3. Perform existing Glicko-2 update
4. Compute leaderboard rank after update (same query with new ratings)
5. Return `{ player1: { ratingBefore, ratingAfter, rankBefore, rankAfter }, player2: { ... } }`

### `games.ts` — move/resign handlers

After `updateRatings()`, store returned values on the game row:
```sql
UPDATE games SET
  player1_rating_before = $1, player1_rating_after = $2,
  player1_rank_before = $3, player1_rank_after = $4,
  player2_rating_before = $5, player2_rating_after = $6,
  player2_rank_before = $7, player2_rank_after = $8
WHERE id = $9
```

### `games.ts` — GET `/games/:id`

For finished games, include `ratingChanges` in response:
```json
{
  "ratingChanges": {
    "me": { "ratingBefore": 1500, "ratingAfter": 1547, "rankBefore": 3, "rankAfter": 2 },
    "opponent": { "ratingBefore": 1512, "ratingAfter": 1480, "rankBefore": 2, "rankAfter": 3 }
  }
}
```

Omit if columns are null (old games without data).

## Frontend Changes

### Game-over overlay (`Game.tsx`)

Below the score line, add a rating changes section:

```
You Won!
385 - 312

PlayerOne  1547 (+47)  #3 → #2
PlayerTwo  1480 (-32)  #2 → #3
```

- Rating deltas: green for positive, red for negative
- Rank shown with arrow if changed, omitted if player is provisional (deviation >= 350)
- Section hidden if `ratingChanges` is null (old games)

# Show Last Round Score Gain

## Goal

Display the score gained from each player's most recent move, shown as `+N` next to their total score in the scoreboard.

## Backend

- Change last-move query from `LIMIT 1` to `LIMIT 2`
- Return both `lastMove` and `previousMove` in the game response
- Add `previousMove` field to `PlayerGameView` and `MoveRecord` types

## Frontend

- Determine which move belongs to "me" vs "opponent" using `playerId` + `playerNumber`
- Show `+N` next to each score in smaller, muted text
- Show `+0` for pass/exchange moves
- Show nothing until the first move has been played

## Visual

```
You              Waiting...        Opponent
156  +32                           128  +18
```

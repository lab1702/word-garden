# Live Top 10 Leaderboard — Design

## Overview

Add a live high score list to the lobby showing the top 10 players by rating, updated in real-time via SSE.

## Backend

### New endpoint: `GET /api/leaderboard`

Returns top 10 users by rating, excluding unrated players (those still at default 1500 rating with 350 deviation — meaning they haven't played a rated game yet).

Response: `{ rank: number, username: string, rating: number, userId: string }[]`

### New SSE broadcast: `broadcastEvent(event, data)`

Added to `sse.ts`. Iterates all connected clients and sends the given event. Unlike `sendEvent` which targets a single user, this targets everyone.

### Trigger

After each game finish (3 locations in `games.ts` — move completion, consecutive passes, resign), call `broadcastEvent('leaderboard_updated', {})` alongside the existing per-user `game_finished` event.

## Frontend

### State

New `leaderboard` state in Lobby, fetched on mount via `GET /api/leaderboard`.

### SSE handler

`leaderboard_updated` event triggers a re-fetch of `/api/leaderboard`.

### UI

"Top Players" section rendered at the top of the lobby (before action buttons). Compact numbered list showing rank, username, and rating. Current user's row highlighted with accent color at low opacity.

## Display details

- Rank: `#1`, `#2`, etc.
- Username: plain text
- Rating: integer (rounded)
- Current user row: subtle background highlight

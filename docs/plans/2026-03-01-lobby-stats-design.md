# Lobby Stats: Online Players & Matchmaking Queue Count

## Overview

Add real-time player counts to the lobby: number of online player sessions and number of players in the matchmaking queue. Both counts update in real-time via SSE and display in the left column alongside the leaderboard.

## Approach

Broadcast a `lobby_stats` SSE event to all connected clients whenever a relevant change occurs (SSE connect/disconnect, matchmaking queue join/leave). Debounce rapid changes to avoid flooding.

## Server Changes

### SSE service (`packages/server/src/services/sse.ts`)

- Export `getOnlinePlayerCount()` — returns `clients.size` (unique users with active connections)
- Export `broadcastLobbyStats()` — gathers online player count from `clients.size` and matchmaking queue count from `SELECT COUNT(*) FROM matchmaking_queue`, then calls `broadcastEvent('lobby_stats', { onlinePlayers, matchmakingPlayers })`
- Debounce `broadcastLobbyStats()` at ~500ms to batch rapid connect/disconnect events
- Call debounced broadcast in `addClient` (after adding) and `removeClient` (after removing)

### Matchmaking service (`packages/server/src/services/matchmaking.ts`)

- After `enterQueue` inserts into queue (no match path): call `broadcastLobbyStats()`
- After `leaveQueue`: call `broadcastLobbyStats()`
- After match is made in `enterQueue` and `sweepQueue`: call `broadcastLobbyStats()`

### SSE endpoint (`packages/server/src/index.ts`)

- After sending the `connected` event to a new client, also send `lobby_stats` with current counts so the client has data immediately

## Client Changes

### Lobby component (`packages/client/src/pages/Lobby.tsx`)

- Add state: `lobbyStats: { onlinePlayers: number, matchmakingPlayers: number }`
- Add `lobby_stats` handler in `useSSE` to update the state
- Render a "Community" section in the left column below the leaderboard with two lines: "X players online" and "X searching for match"

### Lobby styles (`packages/client/src/pages/Lobby.module.css`)

- Add styles for the community stats section matching existing leaderboard aesthetic — muted text, compact layout

## SSE Event Payload

```json
{
  "event": "lobby_stats",
  "data": {
    "onlinePlayers": 42,
    "matchmakingPlayers": 3
  }
}
```

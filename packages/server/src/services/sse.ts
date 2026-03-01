import type { Response } from 'express';
import pool from '../db/pool.js';

const MAX_CONNECTIONS_PER_USER = 5;
const MAX_GLOBAL_CONNECTIONS = 10_000;
const clients = new Map<string, Response[]>();
let globalConnectionCount = 0;

export function isAtCapacity(): boolean {
  return globalConnectionCount >= MAX_GLOBAL_CONNECTIONS;
}

function removeClient(userId: string, res: Response): void {
  const userClients = clients.get(userId);
  if (userClients) {
    const idx = userClients.indexOf(res);
    if (idx !== -1) {
      userClients.splice(idx, 1);
      globalConnectionCount--;
    }
    if (userClients.length === 0) clients.delete(userId);
  }
  broadcastLobbyStats();
}

export function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, []);
  const userClients = clients.get(userId)!;
  while (userClients.length >= MAX_CONNECTIONS_PER_USER) {
    const oldest = userClients.shift()!;
    globalConnectionCount--;
    try { oldest.end(); } catch { /* already closed */ }
  }
  userClients.push(res);
  globalConnectionCount++;
  res.on('close', () => removeClient(userId, res));
  res.on('error', () => removeClient(userId, res));
  broadcastLobbyStats();
}

export function sendEvent(userId: string, event: string, data: unknown): void {
  if (/[\r\n]/.test(event)) throw new Error('Invalid SSE event name');
  const userClients = clients.get(userId);
  if (!userClients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...userClients]) {
    try {
      res.write(payload);
    } catch {
      removeClient(userId, res);
    }
  }
}

export function disconnectUser(userId: string): void {
  const userClients = clients.get(userId);
  if (!userClients) return;
  globalConnectionCount -= userClients.length;
  for (const res of [...userClients]) {
    try { res.end(); } catch { /* already closed */ }
  }
  clients.delete(userId);
}

export function closeAllConnections(): void {
  for (const [, userClients] of clients) {
    for (const res of userClients) {
      try { res.end(); } catch { /* already closed */ }
    }
  }
  clients.clear();
  globalConnectionCount = 0;
}

export function broadcastEvent(event: string, data: unknown): void {
  if (/[\r\n]/.test(event)) throw new Error('Invalid SSE event name');
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

export function getOnlinePlayerCount(): number {
  return clients.size;
}

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

import type { Response } from 'express';

const MAX_CONNECTIONS_PER_USER = 5;
const clients = new Map<string, Response[]>();

function removeClient(userId: string, res: Response): void {
  const userClients = clients.get(userId);
  if (userClients) {
    const idx = userClients.indexOf(res);
    if (idx !== -1) userClients.splice(idx, 1);
    if (userClients.length === 0) clients.delete(userId);
  }
}

export function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, []);
  const userClients = clients.get(userId)!;
  while (userClients.length >= MAX_CONNECTIONS_PER_USER) {
    const oldest = userClients.shift()!;
    try { oldest.end(); } catch { /* already closed */ }
  }
  userClients.push(res);
  res.on('close', () => removeClient(userId, res));
  res.on('error', () => removeClient(userId, res));
}

export function sendEvent(userId: string, event: string, data: unknown): void {
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
  for (const res of [...userClients]) {
    try { res.end(); } catch { /* already closed */ }
  }
  clients.delete(userId);
}

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

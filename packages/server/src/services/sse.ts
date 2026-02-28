import type { Response } from 'express';

const clients = new Map<string, Response[]>();

export function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, []);
  clients.get(userId)!.push(res);
  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      const idx = userClients.indexOf(res);
      if (idx !== -1) userClients.splice(idx, 1);
      if (userClients.length === 0) clients.delete(userId);
    }
  });
}

export function sendEvent(userId: string, event: string, data: unknown): void {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of userClients) {
    res.write(payload);
  }
}

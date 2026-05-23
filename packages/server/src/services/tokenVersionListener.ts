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

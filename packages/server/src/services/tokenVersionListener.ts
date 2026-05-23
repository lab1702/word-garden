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
  // Payload is either "<userId>" (plain invalidation) or "<userId>:<version>".
  // UUID userIds contain no colon, so the first colon separates the version.
  // When a version is supplied we set it directly: setCachedTokenVersion's
  // monotonic guard then prevents an in-flight stale read from repopulating the
  // old version, closing the cross-process revocation window. Without a version
  // we delete and let the next requireAuth re-read the true version from the DB.
  const colonIdx = msg.payload.indexOf(':');
  if (colonIdx === -1) {
    invalidateTokenVersion(msg.payload);
    return;
  }
  const userId = msg.payload.slice(0, colonIdx);
  const version = Number(msg.payload.slice(colonIdx + 1));
  if (Number.isInteger(version)) {
    invalidateTokenVersion(userId, version);
  } else {
    invalidateTokenVersion(userId);
  }
}

export async function notifyTokenVersionChanged(
  executor: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  userId: string,
  version?: number,
): Promise<void> {
  const payload = version === undefined ? userId : `${userId}:${version}`;
  await executor.query('SELECT pg_notify($1, $2)', [TOKEN_VERSION_CHANNEL, payload]);
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

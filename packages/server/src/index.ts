import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { runMigrations } from './db/migrate.js';
import pool from './db/pool.js';
import { loadDictionary } from './services/dictionary.js';
import authRouter from './routes/auth.js';
import gameRouter from './routes/games.js';
import leaderboardRouter from './routes/leaderboard.js';
import { addClient, closeAllConnections } from './services/sse.js';
import { requireAuth } from './middleware/auth.js';
import { sweepQueue } from './services/matchmaking.js';
import { startCacheCleanup } from './services/tokenVersionCache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '../../client/dist');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust one reverse proxy (e.g. Caddy/nginx) for correct X-Forwarded-For.
// Increase if behind multiple proxies; incorrect value can allow rate-limit bypass.
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// Content-Security-Policy for XSS defense-in-depth
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'");
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/games', gameRouter);
app.use('/api/leaderboard', leaderboardRouter);

// SSE endpoint
app.get('/api/events', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);
  res.on('close', () => clearInterval(heartbeat));
  addClient(req.user!.userId, res);
});

// Serve static client assets in production
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for non-API routes
  app.get('{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function cleanupStaleRecords() {
  try {
    await pool.query(`DELETE FROM games WHERE status = 'waiting' AND created_at < NOW() - INTERVAL '24 hours'`);
    await pool.query(`DELETE FROM matchmaking_queue WHERE queued_at < NOW() - INTERVAL '30 minutes'`);
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

async function waitForDb(retries = 15, delayMs = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      console.log(`Waiting for database... (attempt ${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Database not available after retries');
}

async function start() {
  await waitForDb();
  await runMigrations();
  await loadDictionary();
  const cleanupInterval = setInterval(cleanupStaleRecords, 60 * 60 * 1000);
  const sweepInterval = setInterval(sweepQueue, 5000);
  const cacheInterval = startCacheCleanup();
  const server = app.listen(PORT, () => {
    console.log(`Word Garden server running on port ${PORT}`);
  });

  function shutdown(signal: string) {
    console.log(`${signal} received, shutting down...`);
    clearInterval(cleanupInterval);
    clearInterval(sweepInterval);
    clearInterval(cacheInterval);
    closeAllConnections();
    server.close(() => {
      pool.end().then(() => {
        console.log('Shutdown complete');
        process.exit(0);
      });
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(console.error);

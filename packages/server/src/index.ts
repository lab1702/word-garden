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
import { addClient } from './services/sse.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '../../client/dist');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/games', gameRouter);

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

async function start() {
  await runMigrations();
  await loadDictionary();
  setInterval(cleanupStaleRecords, 60 * 60 * 1000);
  app.listen(PORT, () => {
    console.log(`Word Garden server running on port ${PORT}`);
  });
}

start().catch(console.error);

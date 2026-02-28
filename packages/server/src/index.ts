import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { runMigrations } from './db/migrate.js';
import { loadDictionary } from './services/dictionary.js';
import authRouter from './routes/auth.js';
import gameRouter from './routes/games.js';
import { addClient } from './services/sse.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
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
  addClient(req.user!.userId, res);
});

async function start() {
  await runMigrations();
  await loadDictionary();
  app.listen(PORT, () => {
    console.log(`Word Garden server running on port ${PORT}`);
  });
}

start().catch(console.error);

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db/pool.js';

const router = Router();

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

router.use(leaderboardLimiter);

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, rating
       FROM users
       WHERE rating_deviation < 350
       ORDER BY rating DESC
       LIMIT 10`
    );
    const leaderboard = result.rows.map((row, i) => ({
      rank: i + 1,
      userId: row.id,
      username: row.username,
      rating: Math.round(row.rating),
    }));
    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;

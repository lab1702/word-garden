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

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 50);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const result = await pool.query(
      `SELECT username, rating
       FROM users
       WHERE rating_deviation < 350
       ORDER BY rating DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const leaderboard = result.rows.map((row, i) => ({
      rank: offset + i + 1,
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

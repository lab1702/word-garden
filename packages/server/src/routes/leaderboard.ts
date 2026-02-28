import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

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

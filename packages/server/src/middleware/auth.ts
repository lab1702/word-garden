import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type SessionPayload } from '../services/session.js';
import pool from '../db/pool.js';

declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Verify token_version matches the DB (rejects tokens issued before password change)
  const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [payload.userId]);
  if (result.rows.length === 0 || result.rows[0].token_version !== payload.tokenVersion) {
    res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.status(401).json({ error: 'Token revoked' });
    return;
  }

  req.user = payload;
  next();
}

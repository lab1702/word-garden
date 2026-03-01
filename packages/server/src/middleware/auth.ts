import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type SessionPayload } from '../services/session.js';
import pool from '../db/pool.js';
import { getCachedTokenVersion, setCachedTokenVersion } from '../services/tokenVersionCache.js';

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

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

  // Verify token_version (cache-first to reduce DB load, 30s TTL)
  const cachedVersion = getCachedTokenVersion(payload.userId);
  if (cachedVersion !== null) {
    if (cachedVersion !== payload.tokenVersion) {
      res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
      res.status(401).json({ error: 'Token revoked' });
      return;
    }
  } else {
    const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [payload.userId]);
    if (result.rows.length === 0 || result.rows[0].token_version !== payload.tokenVersion) {
      res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
      res.status(401).json({ error: 'Token revoked' });
      return;
    }
    setCachedTokenVersion(payload.userId, result.rows[0].token_version);
  }

  req.user = payload;
  next();
}

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import pool from '../db/pool.js';
import { createToken, verifyToken } from '../services/session.js';
import { requireAuth } from '../middleware/auth.js';
import { containsProfanity } from '../services/profanityFilter.js';
import { sendEvent, broadcastEvent, disconnectUser } from '../services/sse.js';
import { invalidateTokenVersion } from '../services/tokenVersionCache.js';
import { updateRatings, storeRatingChanges } from '../services/ratings.js';
import type { CookieOptions } from 'express';

const router = Router();

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Apply rate limiting only to mutation endpoints (exclude GET /me)
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return authLimiter(req, res, next);
});

const rpName = process.env.RP_NAME || 'Word Garden';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:5173';

// In-memory challenge store keyed by random ID to prevent overwrite attacks
const challenges = new Map<string, { challenge: string; username: string }>();
const MAX_CHALLENGES = 1000;
const CHALLENGE_TTL = 2 * 60 * 1000; // 2 minutes

// POST /auth/register/password
router.post('/register/password', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }
    if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
      return;
    }
    if (containsProfanity(username)) {
      res.status(400).json({ error: 'Username contains inappropriate language' });
      return;
    }
    if (password.length < 8 || password.length > 72) {
      res.status(400).json({ error: 'Password must be between 8 and 72 characters' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, rating, token_version',
      [username, hash],
    );
    const user = result.rows[0];
    const token = createToken({ userId: user.id, username: user.username, tokenVersion: user.token_version });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ id: user.id, username: user.username, rating: user.rating });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
    throw err;
  }
});

// POST /auth/login/password
router.post('/login/password', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const result = await pool.query('SELECT id, username, password_hash, rating, token_version FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const user = result.rows[0];
    if (!user.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = createToken({ userId: user.id, username: user.username, tokenVersion: user.token_version });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ id: user.id, username: user.username, rating: user.rating });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/register/passkey/options
router.post('/register/passkey/options', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ error: 'Username required' });
      return;
    }
    if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
      return;
    }
    if (containsProfanity(username)) {
      res.status(400).json({ error: 'Username contains inappropriate language' });
      return;
    }

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username,
      attestationType: 'none',
    });

    if (challenges.size >= MAX_CHALLENGES) {
      res.status(503).json({ error: 'Too many pending registrations, try again later' });
      return;
    }
    const challengeId = randomUUID();
    challenges.set(challengeId, { challenge: options.challenge, username });
    setTimeout(() => challenges.delete(challengeId), CHALLENGE_TTL);

    res.json({ ...options, challengeId });
  } catch (err) {
    console.error('Passkey registration options error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/register/passkey/verify
router.post('/register/passkey/verify', async (req, res) => {
  const { username, credential, challengeId } = req.body;
  if (!username || !credential || !challengeId) {
    res.status(400).json({ error: 'Username, credential, and challengeId required' });
    return;
  }
  const pending = challenges.get(challengeId);
  challenges.delete(challengeId); // Delete immediately to prevent replay
  if (!pending || pending.username !== username) {
    res.status(400).json({ error: 'No pending registration' });
    return;
  }
  const expectedChallenge = pending.challenge;

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Verification failed' });
      return;
    }

    const { credential: cred } = verification.registrationInfo;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        'INSERT INTO users (username) VALUES ($1) RETURNING id, username, rating, token_version',
        [username],
      );
      const user = userResult.rows[0];

      await client.query(
        'INSERT INTO user_credentials (user_id, credential_id, public_key, counter) VALUES ($1, $2, $3, $4)',
        [user.id, cred.id, Buffer.from(cred.publicKey), cred.counter],
      );
      await client.query('COMMIT');

      const token = createToken({ userId: user.id, username: user.username, tokenVersion: user.token_version });
      res.cookie('token', token, COOKIE_OPTIONS);
      res.json({ id: user.id, username: user.username, rating: user.rating });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'Username already taken' });
    } else {
      console.error('Passkey registration error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

// POST /auth/login/passkey/options
router.post('/login/passkey/options', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ error: 'Username required' });
      return;
    }

    const creds = await pool.query(
      'SELECT uc.credential_id FROM user_credentials uc JOIN users u ON uc.user_id = u.id WHERE u.username = $1',
      [username],
    );

    if (creds.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.rows.map((row: { credential_id: string }) => ({
        id: row.credential_id,
      })),
    });

    if (challenges.size >= MAX_CHALLENGES) {
      res.status(503).json({ error: 'Too many pending logins, try again later' });
      return;
    }
    const challengeId = randomUUID();
    challenges.set(challengeId, { challenge: options.challenge, username });
    setTimeout(() => challenges.delete(challengeId), CHALLENGE_TTL);

    res.json({ ...options, challengeId });
  } catch (err) {
    console.error('Passkey login options error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/login/passkey/verify
router.post('/login/passkey/verify', async (req, res) => {
  const { username, credential, challengeId } = req.body;
  if (!username || !credential || !challengeId) {
    res.status(400).json({ error: 'Username, credential, and challengeId required' });
    return;
  }
  const pending = challenges.get(challengeId);
  challenges.delete(challengeId); // Delete immediately to prevent replay
  if (!pending || pending.username !== username) {
    res.status(400).json({ error: 'No pending login' });
    return;
  }
  const expectedChallenge = pending.challenge;

  try {
    const credResult = await pool.query(
      `SELECT uc.id, uc.credential_id, uc.public_key, uc.counter, u.id as user_id, u.username, u.rating, u.token_version
       FROM user_credentials uc JOIN users u ON uc.user_id = u.id
       WHERE u.username = $1 AND uc.credential_id = $2`,
      [username, credential.id],
    );

    if (credResult.rows.length === 0) {
      res.status(401).json({ error: 'Credential not found' });
      return;
    }

    const stored = credResult.rows[0];

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credential_id,
        publicKey: stored.public_key,
        counter: stored.counter,
      },
    });

    if (!verification.verified) {
      res.status(401).json({ error: 'Verification failed' });
      return;
    }

    // Update counter
    await pool.query(
      'UPDATE user_credentials SET counter = $1 WHERE id = $2',
      [verification.authenticationInfo.newCounter, stored.id],
    );

    const token = createToken({ userId: stored.user_id, username: stored.username, tokenVersion: stored.token_version });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ id: stored.user_id, username: stored.username, rating: stored.rating });
  } catch (err) {
    res.status(401).json({ error: 'Login failed' });
  }
});

// PUT /auth/password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password required' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      res.status(400).json({ error: 'New password must be between 8 and 72 characters' });
      return;
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      res.status(400).json({ error: 'Account uses passkey authentication' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    const updated = await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING token_version',
      [hash, userId],
    );
    const newVersion = updated.rows[0].token_version;

    // Issue a fresh token so the current session stays valid
    const token = createToken({ userId, username: req.user!.username, tokenVersion: newVersion });
    res.cookie('token', token, COOKIE_OPTIONS);

    // Disconnect any existing SSE connections (they hold stale tokens)
    disconnectUser(userId);
    invalidateTokenVersion(userId, newVersion);

    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /auth/account
router.delete('/account', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user!.userId;
    await client.query('BEGIN');

    // Forfeit all active games so opponents get a proper win + rating update
    const activeGames = await client.query(
      `SELECT * FROM games WHERE status = 'active' AND (player1_id = $1 OR player2_id = $1) FOR UPDATE`,
      [userId],
    );

    const notifications: { opponentId: string; gameId: string }[] = [];

    for (const g of activeGames.rows) {
      const isPlayer1 = g.player1_id === userId;
      const opponentId = isPlayer1 ? g.player2_id : g.player1_id;
      const winnerId = opponentId;

      await client.query(
        `UPDATE games SET status = 'finished', winner_id = $1, updated_at = NOW() WHERE id = $2`,
        [winnerId, g.id],
      );

      const ratingChanges = await updateRatings(client, g.player1_id, g.player2_id, winnerId);
      if (ratingChanges) await storeRatingChanges(client, g.id, ratingChanges);

      if (opponentId) notifications.push({ opponentId, gameId: g.id });
    }

    // Delete waiting games (no opponent to preserve them for)
    await client.query(`DELETE FROM games WHERE player1_id = $1 AND status = 'waiting'`, [userId]);

    // Delete the user (SET NULL preserves finished games for opponents; CASCADE handles credentials/queue)
    const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await client.query('COMMIT');

    // Send notifications after commit to avoid notifying about uncommitted state
    for (const n of notifications) {
      try { sendEvent(n.opponentId, 'game_finished', { gameId: n.gameId }); } catch {}
    }
    if (notifications.length > 0) {
      try { broadcastEvent('leaderboard_updated', {}); } catch {}
    }

    disconnectUser(userId);
    invalidateTokenVersion(userId);
    res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    client.release();
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  // Best-effort SSE disconnect if token is valid
  const payload = req.cookies?.token ? verifyToken(req.cookies.token) : null;
  if (payload) disconnectUser(payload.userId);

  res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
  res.json({ ok: true });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, rating FROM users WHERE id = $1', [req.user!.userId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;

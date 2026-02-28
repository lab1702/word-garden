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
import { createToken } from '../services/session.js';
import { requireAuth } from '../middleware/auth.js';
import { containsProfanity } from '../services/profanityFilter.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

router.use(authLimiter);

const rpName = process.env.RP_NAME || 'Word Garden';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:5173';

// In-memory challenge store keyed by random ID to prevent overwrite attacks
const challenges = new Map<string, { challenge: string; username: string }>();
const MAX_CHALLENGES = 10000;

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
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, rating',
      [username, hash],
    );
    const user = result.rows[0];
    const token = createToken({ userId: user.id, username: user.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
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

    const result = await pool.query('SELECT id, username, password_hash, rating FROM users WHERE username = $1', [username]);
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

    const token = createToken({ userId: user.id, username: user.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
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
    setTimeout(() => challenges.delete(challengeId), 5 * 60 * 1000);

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
        'INSERT INTO users (username) VALUES ($1) RETURNING id, username, rating',
        [username],
      );
      const user = userResult.rows[0];

      await client.query(
        'INSERT INTO user_credentials (user_id, credential_id, public_key, counter) VALUES ($1, $2, $3, $4)',
        [user.id, cred.id, Buffer.from(cred.publicKey), cred.counter],
      );
      await client.query('COMMIT');

      challenges.delete(challengeId);
      const token = createToken({ userId: user.id, username: user.username });
      res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
      res.json({ id: user.id, username: user.username, rating: user.rating });
    } catch (innerErr) {
      await client.query('ROLLBACK');
      throw innerErr;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' });
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
    setTimeout(() => challenges.delete(challengeId), 5 * 60 * 1000);

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
  if (!pending || pending.username !== username) {
    res.status(400).json({ error: 'No pending login' });
    return;
  }
  const expectedChallenge = pending.challenge;

  try {
    const credResult = await pool.query(
      `SELECT uc.id, uc.credential_id, uc.public_key, uc.counter, u.id as user_id, u.username, u.rating
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

    challenges.delete(challengeId);
    const token = createToken({ userId: stored.user_id, username: stored.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ id: stored.user_id, username: stored.username, rating: stored.rating });
  } catch (err) {
    res.status(401).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.json({ ok: true });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, username, rating FROM users WHERE id = $1', [req.user!.userId]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(result.rows[0]);
});

export default router;

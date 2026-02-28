import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import pool from '../db/pool.js';
import { createToken } from '../services/session.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const rpName = process.env.RP_NAME || 'Word Garden';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:5173';

// In-memory challenge store (per-session, short-lived)
const challenges = new Map<string, string>();

// POST /auth/register/password
router.post('/register/password', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Username already taken' });
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
});

// POST /auth/login/password
router.post('/login/password', async (req, res) => {
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
    res.status(401).json({ error: 'This account uses passkey authentication' });
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
});

// POST /auth/register/passkey/options
router.post('/register/passkey/options', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }
  if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
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

  challenges.set(username, options.challenge);
  setTimeout(() => challenges.delete(username), 5 * 60 * 1000);

  res.json(options);
});

// POST /auth/register/passkey/verify
router.post('/register/passkey/verify', async (req, res) => {
  const { username, credential } = req.body;
  const expectedChallenge = challenges.get(username);
  if (!expectedChallenge) {
    res.status(400).json({ error: 'No pending registration' });
    return;
  }

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

    const userResult = await pool.query(
      'INSERT INTO users (username) VALUES ($1) RETURNING id, username, rating',
      [username],
    );
    const user = userResult.rows[0];

    await pool.query(
      'INSERT INTO user_credentials (user_id, credential_id, public_key, counter) VALUES ($1, $2, $3, $4)',
      [user.id, cred.id, Buffer.from(cred.publicKey), cred.counter],
    );

    challenges.delete(username);
    const token = createToken({ userId: user.id, username: user.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username, rating: user.rating });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

// POST /auth/login/passkey/options
router.post('/login/passkey/options', async (req, res) => {
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
    res.status(404).json({ error: 'No passkeys found for this user' });
    return;
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.rows.map((row: { credential_id: string }) => ({
      id: row.credential_id,
    })),
  });

  challenges.set(`login:${username}`, options.challenge);
  setTimeout(() => challenges.delete(`login:${username}`), 5 * 60 * 1000);

  res.json(options);
});

// POST /auth/login/passkey/verify
router.post('/login/passkey/verify', async (req, res) => {
  const { username, credential } = req.body;
  const expectedChallenge = challenges.get(`login:${username}`);
  if (!expectedChallenge) {
    res.status(400).json({ error: 'No pending login' });
    return;
  }

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

    challenges.delete(`login:${username}`);
    const token = createToken({ userId: stored.user_id, username: stored.username });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ id: stored.user_id, username: stored.username, rating: stored.rating });
  } catch (err) {
    res.status(401).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
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

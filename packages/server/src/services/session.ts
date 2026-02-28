import jwt from 'jsonwebtoken';

const KNOWN_DEFAULTS = ['dev-secret', 'dev-secret-change-in-production'];

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || KNOWN_DEFAULTS.includes(secret)) {
      throw new Error('SESSION_SECRET must be set to a secure value in production');
    }
  }
  return secret || 'dev-secret';
}

const SECRET = getSecret();
const EXPIRY = '30d';

export interface SessionPayload {
  userId: string;
  username: string;
  tokenVersion: number;
}

export function createToken(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

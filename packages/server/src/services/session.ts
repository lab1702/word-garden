import jwt from 'jsonwebtoken';

const SECRET = process.env.SESSION_SECRET || 'dev-secret';
const EXPIRY = '30d';

export interface SessionPayload {
  userId: string;
  username: string;
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

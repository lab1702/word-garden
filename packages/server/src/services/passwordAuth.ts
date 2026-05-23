import bcrypt from 'bcrypt';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;
export const BCRYPT_COST = 12;

// A valid bcrypt hash used only to spend comparable CPU time when the target
// account does not exist or has no password, so login latency cannot reveal
// whether a username exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_COST);

export async function verifyPassword(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH); // spend equivalent time
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}

export function passwordLengthError(password: string): string | null {
  if (typeof password !== 'string') {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return null;
}

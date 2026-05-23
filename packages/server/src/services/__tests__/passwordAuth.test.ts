import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcrypt', () => ({
  default: {
    hashSync: vi.fn(() => '$2b$12$dummderpdummderpdummderO'),
    compare: vi.fn(async (pw: string, hash: string) => pw === 'correct' && hash === 'realhash'),
  },
}));

let verifyPassword: typeof import('../passwordAuth.js').verifyPassword;
let passwordLengthError: typeof import('../passwordAuth.js').passwordLengthError;
// bcrypt types use named exports; at runtime we access the esm default interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bcrypt: typeof import('bcrypt');

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../passwordAuth.js');
  verifyPassword = mod.verifyPassword;
  passwordLengthError = mod.passwordLengthError;
  // vi.mock wraps bcrypt with a `default` key; grab the named-export-shaped object
  bcrypt = (await import('bcrypt') as unknown as { default: typeof import('bcrypt') }).default;
});

describe('verifyPassword', () => {
  it('runs bcrypt.compare even when the hash is null (constant-time)', async () => {
    const result = await verifyPassword(null, 'anything');
    expect(result).toBe(false);
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('returns true on a matching password', async () => {
    expect(await verifyPassword('realhash', 'correct')).toBe(true);
  });

  it('returns false on a non-matching password', async () => {
    expect(await verifyPassword('realhash', 'wrong')).toBe(false);
  });
});

describe('passwordLengthError', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(passwordLengthError('short')).toMatch(/at least 8/);
  });

  it('rejects passwords longer than 72 bytes (multibyte aware)', () => {
    expect(passwordLengthError('é'.repeat(40))).toMatch(/72 bytes/); // 80 bytes
  });

  it('accepts a valid password', () => {
    expect(passwordLengthError('password123')).toBeNull();
  });

  it('rejects a non-string password instead of throwing', () => {
    expect(passwordLengthError({ length: 100 } as any)).toMatch(/Password/);
    expect(passwordLengthError(12345678 as any)).toMatch(/Password/);
    expect(passwordLengthError(undefined as any)).toMatch(/Password/);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invalidateTokenVersion = vi.fn();
vi.mock('../tokenVersionCache.js', () => ({ invalidateTokenVersion }));

let mod: typeof import('../tokenVersionListener.js');

beforeEach(async () => {
  vi.clearAllMocks();
  mod = await import('../tokenVersionListener.js');
});

describe('handleTokenVersionNotification', () => {
  it('invalidates the cache for the userId in the payload', () => {
    mod.handleTokenVersionNotification({ channel: mod.TOKEN_VERSION_CHANNEL, payload: 'user-1' });
    expect(invalidateTokenVersion).toHaveBeenCalledWith('user-1');
  });

  it('ignores notifications on other channels', () => {
    mod.handleTokenVersionNotification({ channel: 'something_else', payload: 'user-1' });
    expect(invalidateTokenVersion).not.toHaveBeenCalled();
  });

  it('ignores notifications with no payload', () => {
    mod.handleTokenVersionNotification({ channel: mod.TOKEN_VERSION_CHANNEL });
    expect(invalidateTokenVersion).not.toHaveBeenCalled();
  });

  it('applies the new version from the payload so the monotonic guard blocks stale writes', () => {
    mod.handleTokenVersionNotification({ channel: mod.TOKEN_VERSION_CHANNEL, payload: 'user-1:5' });
    expect(invalidateTokenVersion).toHaveBeenCalledWith('user-1', 5);
  });
});

describe('notifyTokenVersionChanged', () => {
  it('issues pg_notify with the channel and userId', async () => {
    const executor = { query: vi.fn(async () => ({ rows: [] })) };
    await mod.notifyTokenVersionChanged(executor, 'user-7');
    expect(executor.query).toHaveBeenCalledWith(
      'SELECT pg_notify($1, $2)',
      [mod.TOKEN_VERSION_CHANNEL, 'user-7'],
    );
  });

  it('includes the new version in the payload when supplied', async () => {
    const executor = { query: vi.fn(async () => ({ rows: [] })) };
    await mod.notifyTokenVersionChanged(executor, 'user-7', 5);
    expect(executor.query).toHaveBeenCalledWith(
      'SELECT pg_notify($1, $2)',
      [mod.TOKEN_VERSION_CHANNEL, 'user-7:5'],
    );
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch error handling', () => {
  it('throws an ApiError carrying the HTTP status and server message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: () => Promise.resolve({ error: 'Username already taken' }),
    })));

    await expect(apiFetch('/auth/register/password', { method: 'POST', body: '{}' }))
      .rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch('/auth/register/password', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 409, message: 'Username already taken' });
  });

  it('falls back to statusText when the body has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    })));

    await expect(apiFetch('/auth/me'))
      .rejects.toMatchObject({ status: 500, message: 'Internal Server Error' });
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: '1', username: 'alice' }),
    })));

    const result = await apiFetch<{ id: string; username: string }>('/auth/me');
    expect(result).toEqual({ id: '1', username: 'alice' });
  });
});

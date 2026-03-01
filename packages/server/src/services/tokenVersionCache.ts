const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  version: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedTokenVersion(userId: string): number | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return entry.version;
}

export function setCachedTokenVersion(userId: string, version: number): void {
  cache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateTokenVersion(userId: string): void {
  cache.delete(userId);
}

export function startCacheCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(key);
    }
  }, 5 * 60 * 1000);
}

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
  const existing = cache.get(userId);
  // Only update if newer — prevents stale concurrent writes from overwriting a fresh invalidation
  if (existing && existing.version > version && Date.now() <= existing.expiresAt) return;
  cache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateTokenVersion(userId: string, newVersion?: number): void {
  if (newVersion !== undefined) {
    // Set the new version so the cache is immediately correct
    cache.set(userId, { version: newVersion, expiresAt: Date.now() + CACHE_TTL_MS });
  } else {
    cache.delete(userId);
  }
}

export function startCacheCleanup(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(key);
    }
  }, 5 * 60 * 1000);
}

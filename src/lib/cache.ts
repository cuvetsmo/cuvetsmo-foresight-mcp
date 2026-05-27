/**
 * Tiny in-memory TTL cache. Used by the polling pseudo-stream tool to avoid
 * spamming the data store between MCP calls.
 */

export interface CacheBackend {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCache implements CacheBackend {
  private store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async wrap<T>(
    key: string,
    ttlSec: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const fresh = await fetcher();
    await this.set(key, fresh, ttlSec);
    return fresh;
  }
}

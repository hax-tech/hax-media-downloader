import { db } from '../../database/repositories/memory-database.ts';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import crypto from 'crypto';

export class CacheService {
  private enabled: boolean = config.cache.enabled;
  private defaultTtl: number = config.cache.ttlSeconds;

  generateKey(prefix: string, identifier: string | Record<string, unknown>): string {
    const raw = typeof identifier === 'string' ? identifier : JSON.stringify(identifier);
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return `${prefix}:${hash}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const entry = await db.getCache<T>(key);
      if (!entry) return null;
      return entry.value;
    } catch (err) {
      logger.warn(`Cache get failed for key ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTtl): Promise<void> {
    if (!this.enabled) return;
    try {
      await db.setCache<T>(key, value, ttlSeconds);
    } catch (err) {
      logger.warn(`Cache set failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return await db.deleteCache(key);
    } catch {
      return false;
    }
  }

  async cleanupExpired(): Promise<number> {
    try {
      const nowIso = new Date().toISOString();
      return await db.deleteExpiredCache(nowIso);
    } catch (err) {
      logger.error(`Cache cleanup failed: ${(err as Error).message}`);
      return 0;
    }
  }

  async getStats(): Promise<{ count: number; activeCount: number; enabled: boolean }> {
    const stats = await db.getCacheStats();
    return {
      ...stats,
      enabled: this.enabled,
    };
  }
}

export const cacheService = new CacheService();

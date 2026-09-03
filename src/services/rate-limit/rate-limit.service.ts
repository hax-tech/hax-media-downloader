import { db } from '../../database/repositories/memory-database.ts';
import { config } from '../../config/index.ts';

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
  limit: number;
}

export class RateLimitService {
  async checkRateLimit(identifier: string, isAdmin = false): Promise<RateLimitStatus> {
    const limit = isAdmin ? config.rateLimit.adminMaxRequests : config.rateLimit.maxRequests;
    const windowMs = isAdmin ? config.rateLimit.adminWindowMs : config.rateLimit.windowMs;

    const key = `ratelimit:${isAdmin ? 'admin:' : 'user:'}${identifier}`;
    const result = await db.incrementRateLimit(key, windowMs);

    const remaining = Math.max(0, limit - result.count);
    const allowed = result.count <= limit;

    return {
      allowed,
      remaining,
      resetAt: result.resetAt,
      total: result.count,
      limit,
    };
  }

  async getStatus(identifier: string, isAdmin = false): Promise<RateLimitStatus> {
    const limit = isAdmin ? config.rateLimit.adminMaxRequests : config.rateLimit.maxRequests;
    const key = `ratelimit:${isAdmin ? 'admin:' : 'user:'}${identifier}`;
    const record = await db.getRateLimit(key);

    if (!record) {
      return {
        allowed: true,
        remaining: limit,
        resetAt: Date.now() + (isAdmin ? config.rateLimit.adminWindowMs : config.rateLimit.windowMs),
        total: 0,
        limit,
      };
    }

    return {
      allowed: record.count <= limit,
      remaining: Math.max(0, limit - record.count),
      resetAt: record.resetAt,
      total: record.count,
      limit,
    };
  }

  async reset(identifier: string, isAdmin = false): Promise<void> {
    const key = `ratelimit:${isAdmin ? 'admin:' : 'user:'}${identifier}`;
    await db.resetRateLimit(key);
  }

  async cleanupExpired(): Promise<number> {
    return db.cleanExpiredRateLimits(Date.now());
  }
}

export const rateLimitService = new RateLimitService();

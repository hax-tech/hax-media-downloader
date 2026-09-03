import { Request, Response, NextFunction } from 'express';
import { rateLimitService } from '../services/rate-limit/rate-limit.service.ts';
import { config } from '../config/index.ts';

export function createRateLimiter(options: { isAdmin?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const clientIp = rawIp.split(',')[0].trim();
    const userId = (req as Request & { userId?: string }).userId || clientIp;

    // Check if requester has valid admin key
    const adminHeader = req.headers['x-admin-key'] || req.headers['authorization'];
    const isAdmin = options.isAdmin || (adminHeader && adminHeader.toString().includes(config.adminApiKey));

    const status = await rateLimitService.checkRateLimit(userId, Boolean(isAdmin));

    res.setHeader('X-RateLimit-Limit', status.limit);
    res.setHeader('X-RateLimit-Remaining', status.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(status.resetAt / 1000));

    if (!status.allowed) {
      res.status(429).json({
        success: false,
        error: 'Too Many Requests: Rate limit exceeded.',
        limit: status.limit,
        remaining: 0,
        resetAt: new Date(status.resetAt).toISOString(),
        message: `Limit of ${status.limit} requests per window exceeded. Please wait until reset.`,
      });
      return;
    }

    next();
  };
}

export const downloadRateLimiter = createRateLimiter({ isAdmin: false });
export const adminRateLimiter = createRateLimiter({ isAdmin: true });

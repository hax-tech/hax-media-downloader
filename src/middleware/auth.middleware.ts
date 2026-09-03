import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.ts';

/**
 * Constant-time comparison preventing timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Constant time dummy comparison to mitigate length-based timing leaks
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates whether the given string matches the configured ADMIN_API_KEY.
 */
export function verifyAdminKey(providedKey?: string): boolean {
  if (!providedKey || !config.adminApiKey) return false;
  return timingSafeCompare(providedKey.trim(), config.adminApiKey);
}

/**
 * Validates whether the given string matches the configured CRON_SECRET.
 */
export function verifyCronSecret(providedKey?: string): boolean {
  if (!providedKey || !config.cronSecret) return false;
  return timingSafeCompare(providedKey.trim(), config.cronSecret);
}

function extractKeyFromHeaders(req: Request): string | undefined {
  const headerKey = req.headers['x-admin-key'] as string | undefined;
  const cronHeader = req.headers['x-cron-secret'] as string | undefined;
  const authHeader = req.headers['authorization'] as string | undefined;

  if (headerKey) return headerKey.trim();
  if (cronHeader) return cronHeader.trim();
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If ADMIN_API_KEY is not configured in the environment, admin endpoints are disabled safely
  if (!config.adminApiKey) {
    res.status(503).json({
      success: false,
      error: 'Admin endpoints are disabled because ADMIN_API_KEY is not configured in the server environment.',
    });
    return;
  }

  const providedKey = extractKeyFromHeaders(req);

  if (!providedKey || !verifyAdminKey(providedKey)) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid Admin API key required.',
      hint: 'Pass X-Admin-Key header or Authorization: Bearer <ADMIN_API_KEY>',
    });
    return;
  }

  next();
}

/**
 * Middleware for cron and cleanup endpoints:
 * Accepts either valid ADMIN_API_KEY or valid CRON_SECRET.
 */
export function cronAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If neither key is configured, fail safely
  if (!config.adminApiKey && !config.cronSecret) {
    res.status(503).json({
      success: false,
      error: 'Cleanup endpoint is disabled because neither ADMIN_API_KEY nor CRON_SECRET is configured.',
    });
    return;
  }

  const providedKey = extractKeyFromHeaders(req);

  const isValidAdmin = verifyAdminKey(providedKey);
  const isValidCron = verifyCronSecret(providedKey);

  if (!isValidAdmin && !isValidCron) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid X-Admin-Key, X-Cron-Secret, or Bearer token required.',
    });
    return;
  }

  next();
}

export function optionalUserAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers[config.apiKeyHeader] as string | undefined;
  if (apiKey) {
    (req as Request & { userId?: string }).userId = apiKey.trim();
  }
  next();
}


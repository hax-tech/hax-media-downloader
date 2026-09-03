import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.ts';

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerKey = req.headers['x-admin-key'] as string | undefined;
  const authHeader = req.headers['authorization'] as string | undefined;

  let providedKey: string | undefined;

  if (headerKey) {
    providedKey = headerKey.trim();
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey || providedKey !== config.adminApiKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Valid Admin API key required.',
      hint: 'Pass X-Admin-Key header or Authorization: Bearer <ADMIN_API_KEY>',
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

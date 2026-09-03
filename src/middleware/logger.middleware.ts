import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ip: typeof ip === 'string' ? ip.split(',')[0].trim() : String(ip),
      durationMs: duration,
    });
  });

  next();
}

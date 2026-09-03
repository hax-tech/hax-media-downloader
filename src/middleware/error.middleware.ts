import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';
import { DownloaderError } from '../utils/errors.ts';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const isDownloaderError = err instanceof DownloaderError;
  const statusCode = isDownloaderError ? err.statusCode : 500;
  const errorCode = isDownloaderError ? err.code : 'INTERNAL_ERROR';

  logger.error(`API Error [${errorCode}]: ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    statusCode,
    code: errorCode,
  });

  // Safe client response (no internal stack traces)
  res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected internal server error occurred.',
    code: errorCode,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
  });
}

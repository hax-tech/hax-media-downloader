import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  logger.error(`API Error: ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    stack: err.stack,
  });

  // Check common status codes
  let status = 500;
  if (err.message.includes('not found') || err.message.includes('Not Found')) {
    status = 404;
  } else if (err.message.includes('Validation') || err.message.includes('Unsupported URL') || err.message.includes('Invalid URL')) {
    status = 400;
  } else if (err.message.includes('Rate limit') || err.message.includes('Too Many Requests')) {
    status = 429;
  } else if (err.message.includes('unavailable') || err.message.includes('timed out') || err.message.includes('All providers failed')) {
    status = 503;
  }

  // Safe client response (strip stack trace)
  res.status(status).json({
    success: false,
    error: err.message || 'An unexpected internal server error occurred.',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
}

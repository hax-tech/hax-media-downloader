import express from 'express';
import apiRouter from './api/routes/index.ts';
import { requestLogger } from './middleware/logger.middleware.ts';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.ts';
import { config } from './config/index.ts';

export function createApp() {
  const app = express();

  // Basic security headers and CORS
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key, X-Api-Key');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Request size limits (1MB)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Structured request logging
  app.use(requestLogger);

  // Mount API endpoints under /api
  app.use('/api', apiRouter);

  return app;
}

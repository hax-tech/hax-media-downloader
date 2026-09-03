import path from 'path';
import express from 'express';
import { createApp } from './src/app.ts';
import { errorHandler, notFoundHandler } from './src/middleware/error.middleware.ts';
import { config } from './src/config/index.ts';
import { logger } from './src/utils/logger.ts';
import { providerManager } from './src/services/provider-manager/provider-manager.service.ts';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = createApp();
  const PORT = config.port;
  const HOST = config.host;

  // Background health assessment on startup
  providerManager.checkAllHealth().then((healths) => {
    logger.info('Initial provider health check completed', {
      providers: healths.map((h) => ({ name: h.provider, available: h.available })),
    });
  });

  // Vite Middleware for development OR static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      // Don't intercept /api routes that weren't found
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Handle unmatched API routes
  app.all('/api/*', notFoundHandler);

  // Centralized Error Middleware
  app.use(errorHandler);

  app.listen(PORT, HOST, () => {
    logger.info(`hax-media-downloader API server listening on http://${HOST}:${PORT}`);
    logger.info(`API Base URL: http://${HOST}:${PORT}/api`);
    logger.info(`Author: ${config.author} | Client Consumer: Tanu-xai`);
  });
}

startServer().catch((err) => {
  logger.error('Fatal error during server startup', { error: (err as Error).message });
  process.exit(1);
});

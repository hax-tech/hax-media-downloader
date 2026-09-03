import { Request, Response, NextFunction } from 'express';
import { downloadService } from '../../services/download/download.service.ts';
import { providerManager } from '../../services/provider-manager/provider-manager.service.ts';
import { config } from '../../config/index.ts';

export class DownloaderController {
  async getHealth(_req: Request, res: Response): Promise<void> {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: 'ok',
      service: config.appName,
      author: config.author,
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: config.env,
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
    });
  }

  async getProviders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthList = await providerManager.checkAllHealth();
      const providers = providerManager.getAllProviders().map((p) => {
        const h = healthList.find((item) => item.provider.toLowerCase() === p.name.toLowerCase());
        return {
          name: p.name,
          supportedPlatforms: p.supportedPlatforms,
          isAvailable: h?.available ?? false,
          latencyMs: h?.latencyMs,
          statusMessage: h?.statusMessage,
          version: h?.version,
        };
      });

      res.json({
        success: true,
        priorityOrder: config.providers.priority,
        providers,
      });
    } catch (err) {
      next(err);
    }
  }

  async getInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url } = req.body;
      const mediaInfo = await downloadService.getMediaInfo(url);
      res.json({
        success: true,
        data: mediaInfo,
      });
    } catch (err) {
      next(err);
    }
  }

  async postDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { url, type, quality, format } = req.body;
      const userId = (req as Request & { userId?: string }).userId;

      const result = await downloadService.processDownload(
        url,
        { type, quality, format },
        userId
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getJobById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await downloadService.getJob(id);

      if (!job) {
        res.status(404).json({
          success: false,
          error: `Download job '${id}' was not found or has expired.`,
        });
        return;
      }

      res.json({
        success: true,
        job,
      });
    } catch (err) {
      next(err);
    }
  }

  async postSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, platform } = req.body;
      const results = await providerManager.search(query, platform);
      res.json({
        success: true,
        count: results.length,
        results,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const downloaderController = new DownloaderController();

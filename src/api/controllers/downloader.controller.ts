import { Request, Response, NextFunction } from 'express';
import { downloadService } from '../../services/download/download.service.ts';
import { providerManager } from '../../services/provider-manager/provider-manager.service.ts';
import { storageService } from '../../services/storage/storage.service.ts';
import { config } from '../../config/index.ts';
import { DownloaderError } from '../../utils/errors.ts';

export class DownloaderController {
  async getHealth(_req: Request, res: Response): Promise<void> {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: 'ok',
      service: config.appName,
      author: config.author,
      version: '1.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: config.env,
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
      concurrency: {
        maxConcurrent: config.maxConcurrentDownloads,
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
      const { url, timeoutMs } = req.body;
      const mediaInfo = await downloadService.getMediaInfo(url, { timeoutMs });
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
      const { url, type, quality, format, sync } = req.body;
      const userId = (req as Request & { userId?: string }).userId;

      // If synchronous completion is requested
      if (sync === true || req.query.sync === 'true') {
        const result = await downloadService.processDownload(
          url,
          { type, quality, format },
          userId
        );
        res.json({
          success: true,
          data: {
            id: result.jobId,
            status: 'completed',
            title: result.title,
            mimeType: result.mimeType,
            size: result.size,
            downloadUrl: result.downloadUrl || result.url,
            progress: null,
          },
          ...result,
        });
        return;
      }

      // Default: asynchronous queued job
      const job = await downloadService.createDownloadJob(
        url,
        { type, quality, format },
        userId
      );

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          status: job.status,
        },
        jobId: job.id,
        status: job.status,
      });
    } catch (err) {
      next(err);
    }
  }

  async getJobById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await downloadService.getJob(id);

      if (!job) {
        throw DownloaderError.jobNotFound(id);
      }

      // Format response strictly adhering to WhatsApp bot Tanu-xai expectations
      res.json({
        success: true,
        data: {
          id: job.id,
          status: job.status,
          title: job.title,
          mimeType: job.mimeType,
          size: job.size,
          downloadUrl: job.downloadUrl || job.mediaUrl,
          progress: job.progress ?? null,
          format: job.format,
          quality: job.quality,
          thumbnail: job.thumbnail,
          duration: job.duration,
          createdAt: job.createdAt,
          expiresAt: job.expiresAt,
          error: job.error,
          errorCode: job.errorCode,
        },
        job,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMediaFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      const fileEntry = storageService.getFileByToken(token);

      if (!fileEntry) {
        throw DownloaderError.jobNotFound(`Media file with token '${token}' was not found or has expired.`);
      }

      storageService.serveFileWithRanges(
        fileEntry.filePath,
        fileEntry.mimeType,
        fileEntry.filename,
        req,
        res
      );
    } catch (err) {
      next(err);
    }
  }

  async getJobFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const job = await downloadService.getJob(id);

      if (!job) {
        throw DownloaderError.jobNotFound(id);
      }

      if (job.status !== 'completed' || !job.filePath) {
        res.status(400).json({
          success: false,
          error: `Job '${id}' is currently in state '${job.status}' and file is not ready.`,
          code: 'FILE_NOT_READY',
        });
        return;
      }

      const mimeType = job.mimeType || 'video/mp4';
      const ext = job.format || 'mp4';
      const filename = storageService.sanitizeFilename(job.title || 'media', ext);

      storageService.serveFileWithRanges(job.filePath, mimeType, filename, req, res);
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

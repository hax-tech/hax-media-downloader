import crypto from 'crypto';
import { db } from '../../database/repositories/memory-database.ts';
import { providerManager } from '../provider-manager/provider-manager.service.ts';
import { cacheService } from '../cache/cache.service.ts';
import { storageService } from '../storage/storage.service.ts';
import { validateMediaUrl } from '../../utils/url-validator.ts';
import { config } from '../../config/index.ts';
import {
  DownloadOptions,
  DownloadJob,
  MediaInfo,
  NormalizedDownloadResult,
  Platform,
} from '../../types/index.ts';
import { DownloaderError } from '../../utils/errors.ts';
import { logger } from '../../utils/logger.ts';

interface QueuedTask {
  jobId: string;
  url: string;
  options: DownloadOptions;
  userId?: string;
  resolve?: (result: NormalizedDownloadResult) => void;
  reject?: (err: Error) => void;
}

export class DownloadService {
  private activeDownloads = 0;
  private queue: QueuedTask[] = [];

  /**
   * Extracts media information with caching.
   */
  async getMediaInfo(url: string, options?: DownloadOptions): Promise<MediaInfo & { providerUsed: string }> {
    const validation = validateMediaUrl(url);
    if (!validation.isValid || !validation.normalizedUrl) {
      throw DownloaderError.invalidUrl(validation.error || 'Invalid URL supplied.');
    }

    const cleanUrl = validation.normalizedUrl;
    const cacheKey = cacheService.generateKey('info', { url: cleanUrl });
    const cached = await cacheService.get<MediaInfo & { providerUsed: string }>(cacheKey);

    if (cached) {
      logger.info(`Returning cached media info for ${cleanUrl}`);
      return cached;
    }

    const result = await providerManager.getInfo(cleanUrl, options);
    const combined = { ...result.info, providerUsed: result.providerUsed };

    // Cache info for configured TTL
    await cacheService.set(cacheKey, combined, config.cache.ttlSeconds);
    return combined;
  }

  /**
   * Creates an asynchronous download job and kicks off queue processing.
   */
  async createDownloadJob(
    url: string,
    options: DownloadOptions = {},
    userId?: string
  ): Promise<DownloadJob> {
    const validation = validateMediaUrl(url);
    if (!validation.isValid || !validation.normalizedUrl || !validation.platform) {
      throw DownloaderError.invalidUrl(validation.error || 'Invalid URL supplied for download.');
    }

    const cleanUrl = validation.normalizedUrl;
    const platform: Platform = validation.platform;

    // Check cache for identical completed download
    const cacheKey = cacheService.generateKey('download', {
      url: cleanUrl,
      type: options.type || 'video',
      quality: options.quality || '720p',
      format: options.format || 'mp4',
    });

    const cachedResult = await cacheService.get<NormalizedDownloadResult>(cacheKey);
    if (cachedResult && new Date(cachedResult.expiresAt).getTime() > Date.now()) {
      logger.info(`Returning cached download job for ${cleanUrl}`);
      const jobId = cachedResult.jobId || `job_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();

      const job: DownloadJob = {
        id: jobId,
        userId,
        sourceUrl: cleanUrl,
        platform,
        provider: cachedResult.provider,
        status: 'completed',
        title: cachedResult.title,
        mediaUrl: cachedResult.url,
        downloadUrl: cachedResult.downloadUrl || cachedResult.url,
        fileToken: cachedResult.fileToken,
        filePath: cachedResult.filePath,
        format: cachedResult.format,
        quality: cachedResult.quality,
        size: cachedResult.size,
        mimeType: cachedResult.mimeType,
        progress: null,
        createdAt: now,
        expiresAt: cachedResult.expiresAt,
      };

      await db.saveJob(job);
      return job;
    }

    const jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + config.cache.jobExpirationSeconds * 1000).toISOString();

    const job: DownloadJob = {
      id: jobId,
      userId,
      sourceUrl: cleanUrl,
      platform,
      provider: 'pending',
      status: 'queued',
      progress: null,
      format: options.format || (options.type === 'audio' ? 'mp3' : 'mp4'),
      quality: options.quality || '720p',
      createdAt: now,
      expiresAt,
    };

    await db.saveJob(job);

    // Enqueue task for execution
    this.queue.push({
      jobId,
      url: cleanUrl,
      options: { ...options, jobId },
      userId,
    });

    // Fire queue runner in background
    setImmediate(() => this.processNextQueueItem());

    return job;
  }

  /**
   * Processes the job queue while respecting concurrency limits.
   */
  private async processNextQueueItem(): Promise<void> {
    if (this.activeDownloads >= config.maxConcurrentDownloads) {
      return;
    }

    const task = this.queue.shift();
    if (!task) {
      return;
    }

    this.activeDownloads++;
    const { jobId, url, options, userId } = task;

    try {
      await db.updateJobStatus(jobId, 'processing', {
        provider: 'active',
        progress: null,
      });

      logger.info(`Starting execution for download job ${jobId} (Active: ${this.activeDownloads})`);
      const result = await providerManager.download(url, { ...options, jobId });

      const completedData: Partial<DownloadJob> = {
        status: 'completed',
        provider: result.provider,
        title: result.title,
        thumbnail: result.thumbnail,
        duration: result.duration,
        format: result.format,
        quality: result.quality,
        size: result.size,
        mimeType: result.mimeType,
        mediaUrl: result.url,
        downloadUrl: result.downloadUrl || result.url,
        fileToken: result.fileToken,
        filePath: result.filePath,
        expiresAt: result.expiresAt,
        progress: null,
        metadata: result.metadata,
      };

      await db.updateJobStatus(jobId, 'completed', completedData);

      // Cache result if applicable
      const cacheKey = cacheService.generateKey('download', {
        url,
        type: options.type || 'video',
        quality: options.quality || '720p',
        format: options.format || 'mp4',
      });
      await cacheService.set(cacheKey, result, config.cache.ttlSeconds);

      if (task.resolve) task.resolve(result);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      logger.error(`Download job ${jobId} failed: ${error.message}`, {
        jobId,
        code: error.code,
      });

      // Cleanup any temporary file if created
      if (options.jobId) {
        const tempFiles = await storageService.purgeExpiredFiles(0);
        logger.debug(`Cleaned up temp files for failed job: ${tempFiles}`);
      }

      await db.updateJobStatus(jobId, 'failed', {
        error: error.message || 'Download operation failed',
        errorCode: error.code || 'PROVIDER_FAILED',
        progress: null,
      });

      if (task.reject) task.reject(error);
    } finally {
      this.activeDownloads--;
      // Process next in line
      setImmediate(() => this.processNextQueueItem());
    }
  }

  /**
   * Synchronous / awaitable download processing (useful for testing and sync clients).
   */
  async processDownload(
    url: string,
    options: DownloadOptions = {},
    userId?: string
  ): Promise<NormalizedDownloadResult> {
    const job = await this.createDownloadJob(url, options, userId);

    if (job.status === 'completed') {
      return {
        success: true,
        platform: job.platform,
        provider: job.provider,
        title: job.title || 'Media',
        duration: job.duration || 0,
        format: job.format || 'mp4',
        quality: job.quality || '720p',
        url: job.downloadUrl || job.mediaUrl || '',
        downloadUrl: job.downloadUrl || job.mediaUrl || '',
        size: job.size,
        mimeType: job.mimeType,
        fileToken: job.fileToken,
        filePath: job.filePath,
        expiresAt: job.expiresAt,
        jobId: job.id,
      };
    }

    // Wait for job completion with timeout
    const timeoutMs = (options.timeoutMs as number) || config.providers.ytdlp.timeoutMs + 10000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 800));
      const current = await this.getJob(job.id);
      if (!current) throw DownloaderError.jobNotFound(job.id);

      if (current.status === 'completed') {
        return {
          success: true,
          platform: current.platform,
          provider: current.provider,
          title: current.title || 'Media',
          duration: current.duration || 0,
          format: current.format || 'mp4',
          quality: current.quality || '720p',
          url: current.downloadUrl || current.mediaUrl || '',
          downloadUrl: current.downloadUrl || current.mediaUrl || '',
          size: current.size,
          mimeType: current.mimeType,
          fileToken: current.fileToken,
          filePath: current.filePath,
          expiresAt: current.expiresAt,
          jobId: current.id,
        };
      }

      if (current.status === 'failed') {
        throw new DownloaderError(
          current.error || 'Download failed',
          (current.errorCode as any) || 'PROVIDER_FAILED'
        );
      }
    }

    throw DownloaderError.timeout('Download job timed out');
  }

  /**
   * Retrieves a job by ID and verifies expiration.
   */
  async getJob(id: string): Promise<DownloadJob | null> {
    const job = await db.getJobById(id);
    if (!job) return null;

    // Check expiration
    if (new Date(job.expiresAt).getTime() <= Date.now()) {
      if (job.status !== 'expired') {
        job.status = 'expired';
        await db.updateJobStatus(id, 'expired');
      }
    }

    return job;
  }
}

export const downloadService = new DownloadService();

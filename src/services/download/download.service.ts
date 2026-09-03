import crypto from 'crypto';
import { db } from '../../database/repositories/memory-database.ts';
import { providerManager } from '../provider-manager/provider-manager.service.ts';
import { cacheService } from '../cache/cache.service.ts';
import { validateMediaUrl } from '../../utils/url-validator.ts';
import { config } from '../../config/index.ts';
import {
  DownloadOptions,
  DownloadJob,
  MediaInfo,
  NormalizedDownloadResult,
  Platform,
} from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

export class DownloadService {
  /**
   * Extracts media information with caching.
   */
  async getMediaInfo(url: string, options?: DownloadOptions): Promise<MediaInfo & { providerUsed: string }> {
    const validation = validateMediaUrl(url);
    if (!validation.isValid || !validation.normalizedUrl) {
      throw new Error(validation.error || 'Invalid URL supplied.');
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
   * Processes a media download request, tracks the job lifecycle, and returns normalized result.
   */
  async processDownload(
    url: string,
    options: DownloadOptions = {},
    userId?: string
  ): Promise<NormalizedDownloadResult> {
    const validation = validateMediaUrl(url);
    if (!validation.isValid || !validation.normalizedUrl || !validation.platform) {
      throw new Error(validation.error || 'Invalid URL supplied for download.');
    }

    const cleanUrl = validation.normalizedUrl;
    const platform: Platform = validation.platform;

    // Check cache for identical download request
    const cacheKey = cacheService.generateKey('download', {
      url: cleanUrl,
      type: options.type || 'video',
      quality: options.quality || '720p',
      format: options.format || 'mp4',
    });

    const cachedResult = await cacheService.get<NormalizedDownloadResult>(cacheKey);
    if (cachedResult && new Date(cachedResult.expiresAt).getTime() > Date.now()) {
      logger.info(`Returning cached download result for ${cleanUrl}`);
      return cachedResult;
    }

    // Initialize Job in Database
    const jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + config.cache.jobExpirationSeconds * 1000).toISOString();

    const job: DownloadJob = {
      id: jobId,
      userId,
      sourceUrl: cleanUrl,
      platform,
      provider: 'pending',
      status: 'processing',
      createdAt: now,
      expiresAt,
    };

    await db.saveJob(job);

    try {
      const result = await providerManager.download(cleanUrl, options);

      // Finalize Job details
      const completedJob: Partial<DownloadJob> = {
        status: 'completed',
        provider: result.provider,
        title: result.title,
        mediaUrl: result.url,
        expiresAt: result.expiresAt || expiresAt,
        metadata: result.metadata,
      };

      await db.updateJobStatus(jobId, 'completed', completedJob);

      const normalized: NormalizedDownloadResult = {
        success: true,
        platform: result.platform || platform,
        provider: result.provider,
        title: result.title || `Media from ${platform}`,
        thumbnail: result.thumbnail,
        duration: result.duration || 0,
        format: result.format || (options.type === 'audio' ? 'mp3' : 'mp4'),
        quality: result.quality || options.quality || '720p',
        url: result.url,
        expiresAt: result.expiresAt || expiresAt,
        jobId,
        metadata: result.metadata,
      };

      // Cache normalized result for 15 minutes or until expiration
      const ttl = Math.min(
        config.cache.ttlSeconds,
        Math.floor((new Date(normalized.expiresAt).getTime() - Date.now()) / 1000)
      );
      if (ttl > 60) {
        await cacheService.set(cacheKey, normalized, ttl);
      }

      return normalized;
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Download operation failed';
      await db.updateJobStatus(jobId, 'failed', {
        error: errorMsg,
      });
      throw err;
    }
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

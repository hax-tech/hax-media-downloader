import { DownloaderProvider } from '../../providers/base/provider.interface.ts';
import { YtDlpProvider } from '../../providers/ytdlp/ytdlp.provider.ts';
import { CobaltProvider } from '../../providers/cobalt/cobalt.provider.ts';
import { ExternalApiProvider } from '../../providers/external/external.provider.ts';
import {
  Platform,
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  ProviderHealth,
  SearchResultItem,
} from '../../types/index.ts';
import { detectPlatform } from '../../utils/platform-detector.ts';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import { db } from '../../database/repositories/memory-database.ts';
import { DownloaderError } from '../../utils/errors.ts';

export class ProviderManager {
  private providers: Map<string, DownloaderProvider> = new Map();

  constructor() {
    this.registerProvider(new YtDlpProvider());
    this.registerProvider(new CobaltProvider());
    this.registerProvider(new ExternalApiProvider());
  }

  registerProvider(provider: DownloaderProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
    logger.info(`Registered media downloader provider: ${provider.name}`);
  }

  getProvider(name: string): DownloaderProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  getAllProviders(): DownloaderProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Resolves eligible providers for a URL ordered by configured priority (yt-dlp -> cobalt -> external-api).
   */
  getOrderedProvidersForUrl(url: string): DownloaderProvider[] {
    const platform = detectPlatform(url);
    if (!platform) return [];

    const available = this.getAllProviders().filter((p) => p.isSupported(url));

    // Priority map from config
    const priorityList = config.providers.priority.map((p) => {
      const lower = p.toLowerCase();
      if (lower === 'ytdlp' || lower === 'yt-dlp') return 'yt-dlp';
      if (lower === 'external' || lower === 'external-api') return 'external-api';
      return lower;
    });

    return available.sort((a, b) => {
      const idxA = priorityList.indexOf(a.name.toLowerCase());
      const idxB = priorityList.indexOf(b.name.toLowerCase());
      const rankA = idxA === -1 ? 999 : idxA;
      const rankB = idxB === -1 ? 999 : idxB;
      return rankA - rankB;
    });
  }

  /**
   * Fetches media info by trying providers in priority order with deterministic fallback.
   */
  async getInfo(url: string, options?: DownloadOptions): Promise<{ info: MediaInfo; providerUsed: string }> {
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(
        'Unsupported URL. Valid platforms are: YouTube, Instagram, TikTok, Facebook, Pinterest, X/Twitter.'
      );
    }

    const orderedProviders = this.getOrderedProvidersForUrl(url);
    if (orderedProviders.length === 0) {
      throw DownloaderError.providerUnavailable(`No downloader providers configured to handle platform: ${platform}`);
    }

    const failureLogs: Array<{ provider: string; error: string; code?: string }> = [];

    for (const provider of orderedProviders) {
      const start = Date.now();
      try {
        logger.info(`Attempting info extraction with provider: ${provider.name} for ${platform}`);
        const info = await provider.getInfo(url, options);
        const duration = Date.now() - start;

        await db.recordProviderCall(provider.name, true, duration);
        return { info, providerUsed: provider.name };
      } catch (err: unknown) {
        const duration = Date.now() - start;
        const error = err as Error & { code?: string };
        const msg = error.message;

        logger.warn(`Provider ${provider.name} failed getInfo`, {
          provider: provider.name,
          error: msg,
          code: error.code,
        });
        await db.recordProviderCall(provider.name, false, duration, msg);

        // If error is an invalid URL or unsupported format, do NOT fallback to other providers
        if (error instanceof DownloaderError && (error.code === 'INVALID_URL' || error.code === 'UNSUPPORTED_PLATFORM')) {
          throw error;
        }

        failureLogs.push({ provider: provider.name, error: msg, code: error.code });
      }
    }

    const summary = failureLogs.map((f) => `${f.provider}: ${f.error}`).join(' | ');
    throw DownloaderError.providerFailed(`All providers failed to extract media info. (${summary})`, {
      attempts: failureLogs,
    });
  }

  /**
   * Executes download by trying providers in priority order with deterministic fallback.
   */
  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(
        'Unsupported URL. Valid platforms are: YouTube, Instagram, TikTok, Facebook, Pinterest, X/Twitter.'
      );
    }

    const orderedProviders = this.getOrderedProvidersForUrl(url);
    if (orderedProviders.length === 0) {
      throw DownloaderError.providerUnavailable(`No providers available for platform: ${platform}`);
    }

    const failureLogs: Array<{ provider: string; error: string; code?: string }> = [];

    for (const provider of orderedProviders) {
      const start = Date.now();
      try {
        logger.info(`Attempting download with provider: ${provider.name} for ${platform}`);
        const result = await provider.download(url, options);
        const duration = Date.now() - start;

        await db.recordProviderCall(provider.name, true, duration);

        result.provider = provider.name;
        result.platform = platform;
        return result;
      } catch (err: unknown) {
        const duration = Date.now() - start;
        const error = err as Error & { code?: string };
        const msg = error.message;

        logger.warn(`Provider ${provider.name} failed download`, {
          provider: provider.name,
          error: msg,
          code: error.code,
        });
        await db.recordProviderCall(provider.name, false, duration, msg);

        // Do not fallback on user input errors
        if (error instanceof DownloaderError && (error.code === 'INVALID_URL' || error.code === 'UNSUPPORTED_PLATFORM')) {
          throw error;
        }

        failureLogs.push({ provider: provider.name, error: msg, code: error.code });
      }
    }

    const summary = failureLogs.map((f) => `${f.provider}: ${f.error}`).join(' | ');
    throw DownloaderError.providerFailed(`All providers failed to download media. (${summary})`, {
      attempts: failureLogs,
    });
  }

  /**
   * Runs health checks across all registered providers.
   */
  async checkAllHealth(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];
    for (const provider of this.getAllProviders()) {
      try {
        const health = await provider.healthCheck();
        results.push(health);
        await db.updateProviderStatus(provider.name, {
          isAvailable: health.available,
          supportedPlatforms: provider.supportedPlatforms,
          lastError: health.available ? undefined : health.statusMessage,
        });
      } catch (err: unknown) {
        results.push({
          provider: provider.name,
          available: false,
          statusMessage: (err as Error).message,
        });
      }
    }
    return results;
  }

  /**
   * Multi-provider search (YouTube via yt-dlp).
   */
  async search(query: string, platform?: Platform): Promise<SearchResultItem[]> {
    for (const provider of this.getAllProviders()) {
      if (typeof provider.search === 'function') {
        try {
          const items = await provider.search(query, platform);
          if (items && items.length > 0) {
            return items;
          }
        } catch {
          // fallback to next provider
        }
      }
    }
    return [];
  }
}

export const providerManager = new ProviderManager();

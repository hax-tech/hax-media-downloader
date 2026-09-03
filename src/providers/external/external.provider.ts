import { BaseProvider } from '../base/base.provider.ts';
import {
  Platform,
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  ProviderHealth,
} from '../../types/index.ts';
import { config } from '../../config/index.ts';
import { detectPlatform } from '../../utils/platform-detector.ts';

export class ExternalApiProvider extends BaseProvider {
  readonly name = 'external-api';
  readonly supportedPlatforms: Platform[] = ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest'];

  private getBaseUrl(): string | null {
    const url = config.providers.external.apiUrl;
    if (!url || !url.startsWith('http')) return null;
    return url.replace(/\/+$/, '');
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!config.providers.external.enabled) {
      return {
        provider: this.name,
        available: false,
        statusMessage: 'External API provider is disabled in configuration',
      };
    }

    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return {
        provider: this.name,
        available: false,
        statusMessage: 'EXTERNAL_API_URL is not configured in environment',
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (config.providers.external.apiKey) {
        headers[config.providers.external.apiHeader] = config.providers.external.apiKey;
      }

      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      }).catch(() =>
        fetch(baseUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        })
      );

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (res && res.ok) {
        return {
          provider: this.name,
          available: true,
          latencyMs,
          statusMessage: `External API service reachable at ${baseUrl}`,
        };
      }

      return {
        provider: this.name,
        available: false,
        latencyMs,
        statusMessage: `External API returned status ${res?.status ?? 'unavailable'}`,
      };
    } catch (err: unknown) {
      return {
        provider: this.name,
        available: false,
        statusMessage: `External API unreachable: ${(err as Error).message}`,
      };
    }
  }

  async getInfo(url: string, options?: DownloadOptions): Promise<MediaInfo> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('External API provider is not configured (EXTERNAL_API_URL missing).');
    }

    const platform = detectPlatform(url) || 'youtube';
    const timeoutMs = options?.timeoutMs || config.providers.external.timeoutMs;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.providers.external.apiKey) {
      headers[config.providers.external.apiHeader] = config.providers.external.apiKey;
    }

    try {
      const res = await fetch(`${baseUrl}/info`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`External API info error: ${res.status}`);
      }

      const data = await res.json();
      return {
        id: data.id || Buffer.from(url).toString('base64').slice(0, 16),
        title: data.title || 'Untitled Media',
        thumbnail: data.thumbnail,
        duration: data.duration || 0,
        author: data.author || data.creator || 'Creator',
        platform,
        url,
        originalUrl: url,
        availableQualities: data.qualities || ['720p', '1080p'],
        availableFormats: data.formats || ['mp4', 'mp3'],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('External API provider is not configured (EXTERNAL_API_URL missing).');
    }

    const platform = detectPlatform(url) || 'youtube';
    const timeoutMs = options?.timeoutMs || config.providers.external.timeoutMs;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.providers.external.apiKey) {
      headers[config.providers.external.apiHeader] = config.providers.external.apiKey;
    }

    try {
      const res = await fetch(`${baseUrl}/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url,
          type: options?.type || 'video',
          quality: options?.quality || '720p',
          format: options?.format || 'mp4',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`External API download error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const mediaUrl = data.url || data.downloadUrl || data.mediaUrl;
      if (!mediaUrl) {
        throw new Error('External API response did not contain a valid media URL');
      }

      return {
        success: true,
        platform,
        provider: this.name,
        title: data.title || `Media from ${platform}`,
        thumbnail: data.thumbnail,
        duration: data.duration || 0,
        format: options?.format || data.format || 'mp4',
        quality: options?.quality || data.quality || '720p',
        url: mediaUrl,
        expiresAt: data.expiresAt || new Date(Date.now() + 3600 * 1000).toISOString(),
        jobId: '',
        metadata: data.metadata || {},
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

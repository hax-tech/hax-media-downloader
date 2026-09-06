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
import { DownloaderError } from '../../utils/errors.ts';

export class CobaltProvider extends BaseProvider {
  readonly name = 'cobalt';
  readonly supportedPlatforms: Platform[] = ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest', 'twitter'];

  private getBaseUrl(): string | null {
    const url = config.providers.cobalt.apiUrl;
    if (!url || !url.startsWith('http')) return null;
    return url.replace(/\/+$/, '');
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!config.providers.cobalt.enabled) {
      return {
        provider: this.name,
        available: false,
        statusMessage: 'Cobalt provider is disabled in configuration',
      };
    }

    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return {
        provider: this.name,
        available: false,
        statusMessage: 'COBALT_API_URL is not configured in environment',
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (config.providers.cobalt.apiKey) {
        headers['Authorization'] = `Api-Key ${config.providers.cobalt.apiKey}`;
      }

      // Check serverInfo or root
      const res = await fetch(`${baseUrl}/api/serverInfo`, {
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
        let version = 'unknown';
        try {
          const body = await res.json();
          version = body.version || body.cobalt?.version || 'connected';
        } catch {
          version = 'reachable';
        }

        return {
          provider: this.name,
          available: true,
          latencyMs,
          version,
          statusMessage: `Cobalt service healthy at ${baseUrl}`,
        };
      }

      return {
        provider: this.name,
        available: false,
        latencyMs,
        statusMessage: `Cobalt API returned status ${res?.status ?? 'failed'}`,
      };
    } catch (err: unknown) {
      return {
        provider: this.name,
        available: false,
        statusMessage: `Cobalt connection failed: ${(err as Error).message}`,
      };
    }
  }

  async getInfo(url: string, options?: DownloadOptions): Promise<MediaInfo> {
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(`Unsupported platform for URL: ${url}`);
    }

    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw DownloaderError.cobaltUnavailable('Cobalt provider is unavailable: COBALT_API_URL is not configured.');
    }

    // Call Cobalt to extract download details
    const result = await this.download(url, { ...options, type: 'video' });
    return {
      id: Buffer.from(url).toString('base64').slice(0, 16),
      title: result.title,
      uploader: 'Cobalt Media Source',
      author: 'Cobalt Media Source',
      thumbnail: result.thumbnail,
      duration: result.duration,
      platform,
      url,
      webpageUrl: url,
      originalUrl: url,
      availableQualities: ['360p', '480p', '720p', '1080p', 'best'],
      availableFormats: ['mp4', 'mp3', 'm4a', 'webm'],
    };
  }

  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(`Unsupported platform for URL: ${url}`);
    }

    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw DownloaderError.cobaltUnavailable('Cobalt provider is unavailable: COBALT_API_URL is not configured.');
    }

    const timeoutMs = options?.timeoutMs || config.providers.cobalt.timeoutMs;
    const isAudio = options?.type === 'audio';

    // Map quality to Cobalt API v7/v10 syntax
    let vQuality = '720';
    if (options?.quality) {
      const match = options.quality.match(/\d+/);
      if (match) vQuality = match[0];
      if (options.quality.toLowerCase() === 'best' || options.quality.toLowerCase() === 'max') {
        vQuality = 'max';
      }
    }

    const payload: Record<string, unknown> = {
      url,
      videoQuality: vQuality,
      downloadMode: isAudio ? 'audio' : 'auto',
      audioFormat: options?.format || 'mp3',
      filenameStyle: 'pretty',
      youtubeVideoCodec: 'h264',
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.providers.cobalt.apiKey) {
      headers['Authorization'] = `Api-Key ${config.providers.cobalt.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.status === 404) {
        response = await fetch(`${baseUrl}/api/json`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw DownloaderError.providerFailed(`Cobalt API error (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();

      let directUrl = '';
      if (data.status === 'stream' || data.status === 'tunnel' || data.status === 'redirect') {
        directUrl = data.url;
      } else if (data.status === 'picker' && Array.isArray(data.picker) && data.picker[0]) {
        directUrl = data.picker[0].url;
      } else if (data.url) {
        directUrl = data.url;
      }

      if (!directUrl) {
        const errMsg = data.error?.code || data.code || data.text || data.message || 'Cobalt returned no media stream URL';
        throw DownloaderError.providerFailed(`Cobalt error: ${errMsg}`);
      }

      const cleanTitle = data.filename || `media_${platform}`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      return {
        success: true,
        platform,
        provider: this.name,
        title: cleanTitle,
        thumbnail: undefined,
        duration: 0,
        format: options?.format || (isAudio ? 'mp3' : 'mp4'),
        quality: options?.quality || `${vQuality}p`,
        url: directUrl,
        downloadUrl: directUrl,
        expiresAt,
        jobId: (options?.jobId as string) || '',
        metadata: {
          cobaltStatus: data.status,
        },
      };
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        throw DownloaderError.timeout(`Cobalt request timed out after ${timeoutMs}ms`);
      }
      if (err instanceof DownloaderError) throw err;
      throw DownloaderError.providerFailed(`Cobalt failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

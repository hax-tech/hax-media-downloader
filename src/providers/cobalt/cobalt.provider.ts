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

export class CobaltProvider extends BaseProvider {
  readonly name = 'cobalt';
  readonly supportedPlatforms: Platform[] = ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest'];

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
        headers['Authorization'] = `Bearer ${config.providers.cobalt.apiKey}`;
      }

      // Try /api/serverInfo or base url
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
    const platform = detectPlatform(url) || 'youtube';
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('Cobalt provider is unavailable: COBALT_API_URL is not configured.');
    }

    // Attempt normalized extraction through Cobalt or fallback
    const result = await this.download(url, { ...options, type: 'video' });
    return {
      id: Buffer.from(url).toString('base64').slice(0, 16),
      title: result.title,
      thumbnail: result.thumbnail,
      duration: result.duration,
      platform,
      url,
      originalUrl: url,
      availableQualities: ['360p', '480p', '720p', '1080p', '1440p', '2160p'],
      availableFormats: ['mp4', 'mp3', 'webm', 'ogg'],
    };
  }

  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    const platform = detectPlatform(url) || 'youtube';
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('Cobalt provider is unavailable: COBALT_API_URL is not configured.');
    }

    const timeoutMs = options?.timeoutMs || config.providers.cobalt.timeoutMs;
    const isAudio = options?.type === 'audio';

    // Map quality to Cobalt syntax: 'max', '4320', '2160', '1440', '1080', '720', '480', '360'
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
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.providers.cobalt.apiKey) {
      headers['Authorization'] = `Bearer ${config.providers.cobalt.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Cobalt v7+ uses POST / or /api/json
      let response = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.status === 404) {
        // Try fallback route /api/json
        response = await fetch(`${baseUrl}/api/json`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cobalt API error (${response.status}): ${errorText.slice(0, 200)}`);
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
        throw new Error(data.text || data.message || 'Cobalt returned an invalid or empty download URL');
      }

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      return {
        success: true,
        platform,
        provider: this.name,
        title: data.filename || `Downloaded from ${platform}`,
        thumbnail: undefined,
        duration: 0,
        format: options?.format || (isAudio ? 'mp3' : 'mp4'),
        quality: options?.quality || `${vQuality}p`,
        url: directUrl,
        expiresAt,
        jobId: '',
        metadata: {
          cobaltStatus: data.status,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

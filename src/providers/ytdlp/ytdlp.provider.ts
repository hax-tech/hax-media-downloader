import { BaseProvider } from '../base/base.provider.ts';
import {
  Platform,
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  ProviderHealth,
  SearchResultItem,
} from '../../types/index.ts';
import { config } from '../../config/index.ts';
import { YtDlpBinaryManager } from './ytdlp.binary.ts';
import { detectPlatform } from '../../utils/platform-detector.ts';

export class YtDlpProvider extends BaseProvider {
  readonly name = 'yt-dlp';
  readonly supportedPlatforms: Platform[] = ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest'];

  async healthCheck(): Promise<ProviderHealth> {
    if (!config.providers.ytdlp.enabled) {
      return {
        provider: this.name,
        available: false,
        statusMessage: 'yt-dlp provider is disabled in configuration',
      };
    }

    const start = Date.now();
    try {
      const binary = await YtDlpBinaryManager.resolveBinary();
      const latencyMs = Date.now() - start;

      if (!binary.available) {
        return {
          provider: this.name,
          available: false,
          latencyMs,
          statusMessage: 'yt-dlp executable was not found on the host system or configured path',
        };
      }

      return {
        provider: this.name,
        available: true,
        latencyMs,
        version: binary.version,
        statusMessage: `yt-dlp is available (version ${binary.version})`,
      };
    } catch (err: unknown) {
      return {
        provider: this.name,
        available: false,
        statusMessage: (err as Error).message,
      };
    }
  }

  async getInfo(url: string, options?: DownloadOptions): Promise<MediaInfo> {
    const platform = detectPlatform(url) || 'youtube';
    const timeout = options?.timeoutMs || config.providers.ytdlp.timeoutMs;

    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-call-home',
      '--no-playlist',
      '--skip-download',
      url,
    ];

    const execPromise = YtDlpBinaryManager.executeCommand(args, timeout);
    const { stdout } = await this.withTimeout(execPromise, timeout, 'yt-dlp getInfo');

    const data = JSON.parse(stdout);

    const availableQualities: string[] = [];
    const availableFormats: string[] = [];

    if (Array.isArray(data.formats)) {
      for (const fmt of data.formats) {
        if (fmt.format_note && !availableQualities.includes(fmt.format_note)) {
          availableQualities.push(fmt.format_note);
        } else if (fmt.height && !availableQualities.includes(`${fmt.height}p`)) {
          availableQualities.push(`${fmt.height}p`);
        }
        if (fmt.ext && !availableFormats.includes(fmt.ext)) {
          availableFormats.push(fmt.ext);
        }
      }
    }

    return {
      id: data.id || 'media',
      title: data.title || 'Untitled Media',
      thumbnail: data.thumbnail,
      duration: data.duration ? Math.round(data.duration) : 0,
      author: data.uploader || data.channel || data.creator || 'Unknown Creator',
      platform,
      availableQualities: availableQualities.slice(0, 10),
      availableFormats: availableFormats.slice(0, 8),
      url: data.webpage_url || url,
      originalUrl: url,
    };
  }

  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    const platform = detectPlatform(url) || 'youtube';
    const timeout = options?.timeoutMs || config.providers.ytdlp.timeoutMs;
    const isAudio = options?.type === 'audio';
    const requestedQuality = options?.quality || '720p';
    const requestedFormat = options?.format || (isAudio ? 'mp3' : 'mp4');

    // Build format selector
    let formatSelector = 'bestvideo+bestaudio/best';
    if (isAudio) {
      formatSelector = 'bestaudio/best';
    } else if (options?.quality) {
      const height = parseInt(options.quality.replace(/\D/g, ''), 10);
      if (!isNaN(height)) {
        formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
      }
    }

    const args = [
      '-j', // output json with direct stream URLs
      '-f',
      formatSelector,
      '--no-playlist',
      '--no-warnings',
      '--no-call-home',
      url,
    ];

    const execPromise = YtDlpBinaryManager.executeCommand(args, timeout);
    const { stdout } = await this.withTimeout(execPromise, timeout, 'yt-dlp download resolution');

    const lines = stdout.trim().split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    const data = JSON.parse(lastLine);

    // Direct stream or media URL
    const mediaUrl = data.url || (data.formats && data.formats[0]?.url) || '';
    if (!mediaUrl) {
      throw new Error('yt-dlp could not extract a direct stream/media URL for this content.');
    }

    const duration = data.duration ? Math.round(data.duration) : 0;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour TTL for media stream

    return {
      success: true,
      platform,
      provider: this.name,
      title: data.title || 'Downloaded Media',
      thumbnail: data.thumbnail,
      duration,
      format: requestedFormat,
      quality: requestedQuality,
      url: mediaUrl,
      expiresAt,
      jobId: '', // Filled by DownloadService
      metadata: {
        extractor: data.extractor,
        viewCount: data.view_count,
        likeCount: data.like_count,
      },
    };
  }

  override async search(query: string, platform?: Platform): Promise<SearchResultItem[]> {
    if (platform && platform !== 'youtube') {
      return [];
    }

    try {
      const args = [
        `ytsearch5:${query}`,
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
      ];
      const { stdout } = await YtDlpBinaryManager.executeCommand(args, 12000);
      const data = JSON.parse(stdout);
      if (!data.entries || !Array.isArray(data.entries)) return [];

      return data.entries.map((entry: Record<string, unknown>) => ({
        id: String(entry.id || ''),
        title: String(entry.title || 'Untitled'),
        url: entry.url ? String(entry.url) : `https://www.youtube.com/watch?v=${entry.id}`,
        thumbnail: entry.thumbnails ? (entry.thumbnails as Array<{ url: string }>)[0]?.url : undefined,
        duration: entry.duration ? Math.round(Number(entry.duration)) : undefined,
        platform: 'youtube',
        author: String(entry.uploader || ''),
      }));
    } catch {
      return [];
    }
  }
}

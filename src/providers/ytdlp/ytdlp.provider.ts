import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BaseProvider } from '../base/base.provider.ts';
import {
  Platform,
  DownloadOptions,
  MediaInfo,
  MediaFormatInfo,
  NormalizedDownloadResult,
  ProviderHealth,
  SearchResultItem,
} from '../../types/index.ts';
import { config } from '../../config/index.ts';
import { YtDlpBinaryManager } from './ytdlp.binary.ts';
import { detectPlatform } from '../../utils/platform-detector.ts';
import { storageService } from '../../services/storage/storage.service.ts';
import { DownloaderError } from '../../utils/errors.ts';
import { logger } from '../../utils/logger.ts';

/**
 * Builds format selection string according to media type, quality, container preference, and FFmpeg presence.
 */
export function buildYtDlpFormatSelector(options?: DownloadOptions, hasFfmpeg = true): { selector: string; extraArgs: string[] } {
  const isAudio = options?.type === 'audio';
  const requestedQuality = (options?.quality || '720p').toLowerCase();
  const requestedFormat = (options?.format || (isAudio ? 'mp3' : 'mp4')).toLowerCase();
  const extraArgs: string[] = [];

  if (isAudio) {
    if (requestedFormat === 'm4a') {
      return {
        selector: 'bestaudio[ext=m4a]/bestaudio/best',
        extraArgs: hasFfmpeg ? ['-x', '--audio-format', 'm4a'] : [],
      };
    }
    // Default MP3
    if (!hasFfmpeg && requestedFormat === 'mp3') {
      // Without FFmpeg, we cannot convert streams to MP3; fallback to best native audio
      return {
        selector: 'bestaudio/best',
        extraArgs: [],
      };
    }
    return {
      selector: 'bestaudio/best',
      extraArgs: ['-x', '--audio-format', requestedFormat || 'mp3'],
    };
  }

  // Video quality selector
  let heightLimit: number | null = null;
  if (requestedQuality === '360p' || requestedQuality === '360') heightLimit = 360;
  else if (requestedQuality === '480p' || requestedQuality === '480') heightLimit = 480;
  else if (requestedQuality === '720p' || requestedQuality === '720') heightLimit = 720;
  else if (requestedQuality === '1080p' || requestedQuality === '1080') heightLimit = 1080;
  else if (requestedQuality.match(/^\d+p?$/)) {
    const parsed = parseInt(requestedQuality.replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) heightLimit = parsed;
  }

  let selector: string;
  if (hasFfmpeg) {
    if (heightLimit) {
      selector = `bestvideo[height<=${heightLimit}][vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[height<=${heightLimit}]+bestaudio/best[height<=${heightLimit}]/best`;
    } else {
      selector = 'bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best';
    }
    extraArgs.push('--merge-output-format', 'mp4');
  } else {
    // Single stream fallback when FFmpeg is not present
    if (heightLimit) {
      selector = `best[height<=${heightLimit}][ext=mp4]/best[height<=${heightLimit}]/best`;
    } else {
      selector = 'best[ext=mp4]/best';
    }
  }

  return { selector, extraArgs };
}

/**
 * Parses yt-dlp JSON output safely handling deprecation messages or stdout preambles.
 */
export function parseYtDlpJson(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw DownloaderError.ytdlpFailed('yt-dlp returned unparseable or non-JSON output', { raw: trimmed.slice(0, 300) });
  }

  const jsonSnippet = trimmed.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(jsonSnippet);
  } catch (err) {
    throw DownloaderError.ytdlpFailed(`Failed to parse yt-dlp output JSON: ${(err as Error).message}`, { raw: jsonSnippet.slice(0, 300) });
  }
}

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
          statusMessage: 'YTDLP_NOT_FOUND: yt-dlp executable was not found on the host system or configured path',
        };
      }

      const hasFfmpeg = await YtDlpBinaryManager.checkFfmpeg();
      const jsRuntime = await YtDlpBinaryManager.resolveJsRuntime();

      const details: string[] = [`version ${binary.version}`];
      if (hasFfmpeg) {
        details.push('ffmpeg active');
      } else {
        details.push('ffmpeg missing');
      }

      if (jsRuntime.available) {
        details.push(`js-runtime: ${jsRuntime.name} ${jsRuntime.version || ''}`.trim());
      } else if (jsRuntime.warning) {
        details.push(`js-runtime warning: ${jsRuntime.warning}`);
      }

      if (config.providers.ytdlp.ejsSource && config.providers.ytdlp.ejsSource !== 'none') {
        details.push(`ejs: ${config.providers.ytdlp.ejsSource}`);
      }

      return {
        provider: this.name,
        available: true,
        latencyMs,
        version: binary.version,
        statusMessage: `yt-dlp is available (${details.join(', ')})`,
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
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(`Unsupported URL: ${url}`);
    }

    const binary = await YtDlpBinaryManager.resolveBinary();
    if (!binary.available) {
      throw DownloaderError.ytdlpNotFound();
    }

    const timeout = options?.timeoutMs || config.providers.ytdlp.timeoutMs;
    const jsRuntimeArgs = await YtDlpBinaryManager.getJsRuntimeArgs();
    const ejsArgs = YtDlpBinaryManager.getEjsArgs();

    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      ...jsRuntimeArgs,
      ...ejsArgs,
      '--',
      url,
    ];

    const { stdout } = await YtDlpBinaryManager.executeCommand(args, timeout);
    const data = parseYtDlpJson(stdout);

    const availableQualities: string[] = [];
    const availableFormats: string[] = [];
    const formats: MediaFormatInfo[] = [];

    if (Array.isArray(data.formats)) {
      for (const fmt of data.formats) {
        const ext = String(fmt.ext || '');
        const height = typeof fmt.height === 'number' ? fmt.height : undefined;
        const resolution = fmt.resolution ? String(fmt.resolution) : height ? `${height}p` : undefined;
        const note = fmt.format_note ? String(fmt.format_note) : undefined;
        const filesize = typeof fmt.filesize === 'number' ? fmt.filesize : typeof fmt.filesize_approx === 'number' ? fmt.filesize_approx : undefined;

        if (resolution && !availableQualities.includes(resolution)) {
          availableQualities.push(resolution);
        } else if (note && !availableQualities.includes(note)) {
          availableQualities.push(note);
        }

        if (ext && !availableFormats.includes(ext)) {
          availableFormats.push(ext);
        }

        formats.push({
          formatId: String(fmt.format_id || ''),
          ext,
          resolution,
          height,
          filesize,
          note,
          vcodec: fmt.vcodec ? String(fmt.vcodec) : undefined,
          acodec: fmt.acodec ? String(fmt.acodec) : undefined,
        });
      }
    }

    const uploader = String(data.uploader || data.channel || data.creator || 'Unknown');
    const title = String(data.title || 'Untitled Media');
    const duration = typeof data.duration === 'number' ? Math.round(data.duration) : 0;
    const thumbnail = typeof data.thumbnail === 'string' ? data.thumbnail : undefined;
    const webpageUrl = typeof data.webpage_url === 'string' ? data.webpage_url : url;

    return {
      id: String(data.id || 'media'),
      title,
      uploader,
      author: uploader,
      thumbnail,
      duration,
      platform,
      webpageUrl,
      url: webpageUrl,
      originalUrl: url,
      availableQualities: availableQualities.slice(0, 10),
      availableFormats: availableFormats.slice(0, 8),
      formats: formats.slice(0, 25),
    };
  }

  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(`Unsupported URL for download: ${url}`);
    }

    const binary = await YtDlpBinaryManager.resolveBinary();
    if (!binary.available) {
      throw DownloaderError.ytdlpNotFound();
    }

    const isAudio = options?.type === 'audio';
    const requestedQuality = options?.quality || '720p';
    const requestedFormat = options?.format || (isAudio ? 'mp3' : 'mp4');
    const timeout = options?.timeoutMs || config.providers.ytdlp.timeoutMs;
    const jobId = (options?.jobId as string) || `job_${crypto.randomBytes(6).toString('hex')}`;

    // Use isolated per-job directory
    const jobDir = storageService.createJobDirectory(jobId);
    const outputTemplate = path.join(jobDir, '%(title).100B_%(id)s.%(ext)s');

    const hasFfmpeg = await YtDlpBinaryManager.checkFfmpeg();
    const { selector, extraArgs } = buildYtDlpFormatSelector(options, hasFfmpeg);
    const jsRuntimeArgs = await YtDlpBinaryManager.getJsRuntimeArgs();
    const ejsArgs = YtDlpBinaryManager.getEjsArgs();

    const args = [
      '-f',
      selector,
      '--no-playlist',
      '--no-warnings',
      ...jsRuntimeArgs,
      ...ejsArgs,
      '--max-filesize',
      config.providers.ytdlp.maxFileSize,
      '-o',
      outputTemplate,
      '--print',
      'after_move:filepath',
      ...extraArgs,
      '--',
      url,
    ];

    logger.info(`Executing yt-dlp download for job ${jobId}`, { platform, requestedFormat, requestedQuality });
    try {
      const { stdout } = await YtDlpBinaryManager.executeCommand(args, timeout);

      // Find the printed final filepath or scan job directory for matching output
      const outputLines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      let downloadedFilePath = outputLines[outputLines.length - 1] || '';

      if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        // Fallback: search job directory for any created file
        const files = await fs.promises.readdir(jobDir);
        if (files.length > 0) {
          downloadedFilePath = path.join(jobDir, files[0]);
        }
      }

      if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        await storageService.cleanupJob(jobId);
        throw DownloaderError.ytdlpFailed('yt-dlp finished but output media file was not found in storage');
      }

      // Validate the resulting file
      const validation = await storageService.validateDownloadedFile(downloadedFilePath, requestedFormat);
      if (!validation.isValid) {
        await storageService.cleanupJob(jobId);
        throw DownloaderError.invalidMedia(validation.error || 'Downloaded media failed validation');
      }

      const fileToken = `tok_${crypto.randomBytes(16).toString('hex')}`;
      const cleanTitle = path.basename(downloadedFilePath).replace(/\.[^.]+$/, '');
      const userFilename = storageService.sanitizeFilename(cleanTitle, validation.extension);

      // Register token in storage service
      storageService.registerFileToken(
        fileToken,
        jobId,
        downloadedFilePath,
        validation.mimeType,
        userFilename,
        config.cache.jobExpirationSeconds
      );

      const downloadUrl = `/api/media/${fileToken}`;
      const expiresAt = new Date(Date.now() + config.cache.jobExpirationSeconds * 1000).toISOString();

      return {
        success: true,
        platform,
        provider: this.name,
        title: cleanTitle,
        duration: 0,
        format: validation.extension,
        quality: requestedQuality,
        size: validation.size,
        mimeType: validation.mimeType,
        url: downloadUrl,
        downloadUrl,
        filePath: downloadedFilePath,
        fileToken,
        expiresAt,
        jobId,
      };
    } catch (err) {
      await storageService.cleanupJob(jobId).catch(() => {});
      throw err;
    }
  }

  override async search(query: string, platform?: Platform): Promise<SearchResultItem[]> {
    if (platform && platform !== 'youtube') {
      return [];
    }

    const binary = await YtDlpBinaryManager.resolveBinary();
    if (!binary.available) {
      return [];
    }

    try {
      const cleanQuery = query.trim().slice(0, 100);
      const args = [
        '--dump-single-json',
        '--flat-playlist',
        '--no-warnings',
        '--skip-download',
        '--',
        `ytsearch5:${cleanQuery}`,
      ];
      const { stdout } = await YtDlpBinaryManager.executeCommand(args, 15000);
      const data = parseYtDlpJson(stdout);
      if (!data.entries || !Array.isArray(data.entries)) return [];

      return data.entries.map((entry: Record<string, unknown>) => {
        const id = String(entry.id || '');
        const title = String(entry.title || 'Untitled');
        const url = entry.url ? String(entry.url) : `https://www.youtube.com/watch?v=${id}`;
        const uploader = String(entry.uploader || entry.channel || '');
        const duration = typeof entry.duration === 'number' ? Math.round(entry.duration) : undefined;
        let thumbnail: string | undefined;
        if (Array.isArray(entry.thumbnails) && entry.thumbnails[0]?.url) {
          thumbnail = String(entry.thumbnails[0].url);
        }

        return {
          id,
          title,
          url,
          webpageUrl: url,
          thumbnail,
          duration,
          platform: 'youtube' as Platform,
          uploader,
          author: uploader,
        };
      });
    } catch {
      return [];
    }
  }
}

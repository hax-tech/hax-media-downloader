import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BaseProvider } from '../base/base.provider.ts';
import {
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  Platform,
  ProviderHealth,
  MediaFormatInfo,
} from '../../types/index.ts';
import { detectPlatform } from '../../utils/platform-detector.ts';
import { DownloaderError } from '../../utils/errors.ts';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import { YtDlpBinaryManager, FfmpegInfo } from './ytdlp.binary.ts';
import { storageService } from '../../services/storage/storage.service.ts';

/**
 * Builds safe yt-dlp format selector arguments.
 * Properly handles audio extraction and video remuxing with FFmpeg.
 */
export function buildYtDlpFormatSelector(
  options?: DownloadOptions,
  ffmpegInfo?: boolean | FfmpegInfo
): { selector: string; extraArgs: string[] } {
  const isAudio = options?.type === 'audio';
  const requestedFormat = options?.format?.toLowerCase();
  const requestedQuality = (options?.quality || '720p').toLowerCase();
  const hasFfmpeg = typeof ffmpegInfo === 'boolean' ? ffmpegInfo : Boolean(ffmpegInfo?.available);

  const extraArgs: string[] = [];

  // Audio format selector
  if (isAudio) {
    if (requestedFormat === 'm4a') {
      return {
        selector: 'bestaudio[ext=m4a]/bestaudio/best',
        extraArgs: hasFfmpeg ? ['-x', '--audio-format', 'm4a'] : [],
      };
    }

    const audioFmt = requestedFormat === 'wav' || requestedFormat === 'ogg' || requestedFormat === 'aac'
      ? requestedFormat
      : 'mp3';

    return {
      selector: 'bestaudio/best',
      extraArgs: hasFfmpeg ? ['-x', '--audio-format', audioFmt] : [],
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
    // Single-stream fallback when FFmpeg is not installed
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
    throw DownloaderError.ytdlpFailed(`Failed to parse yt-dlp output JSON: ${(err as Error).message}`, {
      raw: jsonSnippet.slice(0, 300),
    });
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

      if (!binary.available || !binary.path) {
        return {
          provider: this.name,
          available: false,
          latencyMs,
          statusMessage: 'YTDLP_NOT_FOUND: yt-dlp executable was not found on host system or configured path',
        };
      }

      const ffmpeg = await YtDlpBinaryManager.checkFfmpeg();
      const jsRuntime = await YtDlpBinaryManager.resolveJsRuntime();

      let available = true;
      const statusParts = [`yt-dlp v${binary.version}`];

      if (ffmpeg.available) {
        statusParts.push(`FFmpeg active (${ffmpeg.version || 'detected'})`);
      } else {
        statusParts.push('FFmpeg missing');
      }

      if (jsRuntime.available && jsRuntime.isSupported) {
        statusParts.push(`JS runtime: ${jsRuntime.name} v${jsRuntime.version || 'detected'}`);
      } else {
        available = false;
        statusParts.push(jsRuntime.warning || 'JS runtime missing or unsupported (requires Deno 2.x or Node 22+)');
      }

      const ejsConfig = config.providers.ytdlp.remoteComponents;
      if (ejsConfig && ejsConfig !== 'none') {
        statusParts.push(`EJS: ${ejsConfig}`);
      }

      return {
        provider: this.name,
        available,
        latencyMs,
        version: binary.version,
        statusMessage: statusParts.join(' | '),
      };
    } catch (err) {
      return {
        provider: this.name,
        available: false,
        latencyMs: Date.now() - start,
        statusMessage: `yt-dlp health check failed: ${(err as Error).message}`,
      };
    }
  }

  async getInfo(url: string, options?: DownloadOptions): Promise<MediaInfo> {
    const platform = detectPlatform(url);
    if (!platform) {
      throw DownloaderError.unsupportedPlatform(`Unsupported URL for metadata extraction: ${url}`);
    }

    const binary = await YtDlpBinaryManager.resolveBinary();
    if (!binary.available) {
      throw DownloaderError.ytdlpNotFound();
    }

    const timeout = options?.timeoutMs || config.providers.ytdlp.timeoutMs;
    const jsRuntimeArgs = await YtDlpBinaryManager.getJsRuntimeArgs();
    const ejsArgs = YtDlpBinaryManager.getEjsArgs();

    // Strict argument array (no shell interpolation, no deprecated --no-call-home)
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
        const filesize = typeof fmt.filesize === 'number'
          ? fmt.filesize
          : typeof fmt.filesize_approx === 'number'
          ? fmt.filesize_approx
          : undefined;

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

    // Use isolated unique per-job directory
    const jobDir = storageService.createJobDirectory(jobId);
    // Safe internal filename inside isolated per-job directory (never trust remote filename)
    const outputTemplate = path.join(jobDir, 'media.%(ext)s');

    const ffmpegInfo = await YtDlpBinaryManager.checkFfmpeg();
    const { selector, extraArgs } = buildYtDlpFormatSelector(options, ffmpegInfo);
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
      'title',
      '--print',
      'after_move:filepath',
      ...extraArgs,
      '--',
      url,
    ];

    logger.info(`Executing yt-dlp download for job ${jobId}`, {
      platform,
      requestedFormat,
      requestedQuality,
      jobDir,
    });

    try {
      const { stdout } = await YtDlpBinaryManager.executeCommand(args, timeout);

      // Parse printed output:
      // Line 1: Title
      // Line 2: Final Filepath
      const outputLines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      let parsedTitle = 'Media';
      let downloadedFilePath = '';

      if (outputLines.length >= 2) {
        parsedTitle = outputLines[outputLines.length - 2];
        downloadedFilePath = outputLines[outputLines.length - 1];
      } else if (outputLines.length === 1) {
        downloadedFilePath = outputLines[0];
      }

      // If downloadedFilePath is not on disk, scan isolated jobDir
      if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        const files = await fs.promises.readdir(jobDir);
        const mediaFile = files.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (mediaFile) {
          downloadedFilePath = path.join(jobDir, mediaFile);
        }
      }

      if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        await storageService.cleanupJob(jobId);
        throw DownloaderError.ytdlpFailed('yt-dlp finished but output media file was not found in storage');
      }

      // Validate the resulting file (size, non-empty, allowed extension, magic bytes)
      const validation = await storageService.validateDownloadedFile(downloadedFilePath, requestedFormat);
      if (!validation.isValid) {
        await storageService.cleanupJob(jobId);
        throw DownloaderError.invalidMedia(validation.error || 'Downloaded media failed validation');
      }

      // Clean up any other auxiliary / intermediate files in the job directory on success
      try {
        const remainingFiles = await fs.promises.readdir(jobDir);
        for (const file of remainingFiles) {
          const fullPath = path.join(jobDir, file);
          if (fullPath !== downloadedFilePath) {
            await fs.promises.rm(fullPath, { force: true }).catch(() => {});
          }
        }
      } catch {
        // Non-fatal cleanup
      }

      const fileToken = `tok_${crypto.randomBytes(16).toString('hex')}`;
      const userFilename = storageService.sanitizeFilename(parsedTitle, validation.extension);

      // Register safe file token
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
        title: parsedTitle,
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
      // Clean up isolated job directory on failure
      await storageService.cleanupJob(jobId).catch(() => {});
      throw err;
    }
  }

  async search(query: string, platform: Platform): Promise<MediaInfo[]> {
    if (platform !== 'youtube') {
      return [];
    }

    const binary = await YtDlpBinaryManager.resolveBinary();
    if (!binary.available) {
      throw DownloaderError.ytdlpNotFound();
    }

    const cleanQuery = query.replace(/[^\w\s-]/g, '').trim();
    if (!cleanQuery) return [];

    const jsRuntimeArgs = await YtDlpBinaryManager.getJsRuntimeArgs();
    const ejsArgs = YtDlpBinaryManager.getEjsArgs();

    const args = [
      `ytsearch5:${cleanQuery}`,
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--skip-download',
      ...jsRuntimeArgs,
      ...ejsArgs,
    ];

    try {
      const { stdout } = await YtDlpBinaryManager.executeCommand(args, 15000);
      const data = parseYtDlpJson(stdout);
      const results: MediaInfo[] = [];

      if (Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (!entry || !entry.id) continue;
          const videoId = String(entry.id);
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const title = String(entry.title || 'Untitled');
          const duration = typeof entry.duration === 'number' ? Math.round(entry.duration) : 0;
          const uploader = String(entry.uploader || entry.channel || 'Unknown');

          results.push({
            id: videoId,
            title,
            uploader,
            author: uploader,
            duration,
            platform: 'youtube',
            webpageUrl: videoUrl,
            url: videoUrl,
            originalUrl: videoUrl,
          });
        }
      }

      return results;
    } catch (err) {
      logger.warn('yt-dlp search operation failed', { error: (err as Error).message });
      return [];
    }
  }
}

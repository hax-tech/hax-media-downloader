import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import { DownloaderError } from '../../utils/errors.ts';

const execFileAsync = promisify(execFile);

export class YtDlpBinaryManager {
  private static cachedPath: string | null = null;
  private static lastCheckTime = 0;
  private static isAvailable = false;
  private static version = 'unknown';
  private static ffmpegChecked = false;
  private static ffmpegAvailable = false;

  /**
   * Finds the best available path to the yt-dlp executable.
   * Priority:
   * 1. Configured YTDLP_PATH
   * 2. Local ./bin/yt-dlp (or ./bin/yt-dlp.exe) in workspace
   * 3. System installed PATH binary (/usr/local/bin/yt-dlp, /usr/bin/yt-dlp, yt-dlp)
   */
  static async resolveBinary(): Promise<{ available: boolean; path?: string; version?: string }> {
    const now = Date.now();
    // Cache check for 30 seconds
    if (this.cachedPath && now - this.lastCheckTime < 30000) {
      return {
        available: this.isAvailable,
        path: this.cachedPath,
        version: this.version,
      };
    }

    const isWin = process.platform === 'win32';
    const binaryExt = isWin ? '.exe' : '';

    const candidatePaths = [
      config.providers.ytdlp.binaryPath,
      path.join(process.cwd(), 'bin', `yt-dlp${binaryExt}`),
      path.join(process.cwd(), 'bin', 'yt-dlp'),
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      'yt-dlp',
    ];

    for (const candidate of candidatePaths) {
      if (!candidate) continue;

      try {
        // If candidate is a relative or absolute file path, check if it exists
        if (candidate.includes('/') || candidate.includes('\\')) {
          if (!fs.existsSync(candidate)) {
            continue;
          }
        }

        const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: 5000 });
        const ver = stdout.trim().split('\n').pop()?.trim() || 'unknown';
        if (ver) {
          this.cachedPath = candidate;
          this.isAvailable = true;
          this.version = ver;
          this.lastCheckTime = now;
          logger.info(`Resolved yt-dlp binary at: ${candidate} (version: ${ver})`);
          return { available: true, path: candidate, version: ver };
        }
      } catch {
        // Continue checking next candidate
      }
    }

    this.isAvailable = false;
    this.cachedPath = null;
    this.version = 'not found';
    this.lastCheckTime = now;
    return { available: false, version: 'not found' };
  }

  /**
   * Checks if FFmpeg is installed and accessible on host.
   */
  static async checkFfmpeg(): Promise<boolean> {
    if (this.ffmpegChecked) return this.ffmpegAvailable;
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
      this.ffmpegAvailable = true;
    } catch {
      this.ffmpegAvailable = false;
    }
    this.ffmpegChecked = true;
    return this.ffmpegAvailable;
  }

  /**
   * Executes a command using execFile with argument arrays (no shell interpolation).
   */
  static async executeCommand(args: string[], timeoutMs = 45000): Promise<{ stdout: string; stderr: string }> {
    const binary = await this.resolveBinary();
    if (!binary.available || !binary.path) {
      throw DownloaderError.ytdlpNotFound('YTDLP_NOT_FOUND: yt-dlp binary is not installed or available on this system.');
    }

    try {
      return await execFileAsync(binary.path, args, {
        timeout: timeoutMs,
        maxBuffer: 25 * 1024 * 1024, // 25MB output buffer
      });
    } catch (err: unknown) {
      const error = err as { code?: string | number; killed?: boolean; message: string; stderr?: string };
      if (error.killed || error.message.includes('TIMEDOUT') || error.message.includes('timed out')) {
        throw DownloaderError.timeout(`yt-dlp command timed out after ${timeoutMs}ms`);
      }
      const stderr = error.stderr || error.message;
      if (stderr.includes('Unsupported URL') || stderr.includes('is not a valid URL')) {
        throw DownloaderError.invalidUrl(stderr.trim());
      }
      if (stderr.includes('Private video') || stderr.includes('Sign in') || stderr.includes('login required')) {
        throw DownloaderError.ytdlpFailed('Content requires authentication or is private', { raw: stderr });
      }
      if (stderr.includes('Video unavailable') || stderr.includes('This video has been removed')) {
        throw DownloaderError.ytdlpFailed('Content is unavailable or removed on host platform', { raw: stderr });
      }
      throw DownloaderError.ytdlpFailed(`yt-dlp execution failed: ${stderr.slice(0, 300)}`, { raw: stderr });
    }
  }
}

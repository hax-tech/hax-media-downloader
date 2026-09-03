import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import { DownloaderError } from '../../utils/errors.ts';

const execFileAsync = promisify(execFile);

export interface JsRuntimeInfo {
  available: boolean;
  name: 'deno' | 'node' | 'none';
  version?: string;
  path?: string;
  isSupported: boolean;
  warning?: string;
}

export interface FfmpegInfo {
  available: boolean;
  version?: string;
}

export class YtDlpBinaryManager {
  private static cachedPath: string | null = null;
  private static lastCheckTime = 0;
  private static isAvailable = false;
  private static version = 'unknown';

  private static ffmpegChecked = false;
  private static ffmpegInfo: FfmpegInfo = { available: false };

  private static jsRuntimeInfo: JsRuntimeInfo | null = null;
  private static lastJsCheckTime = 0;

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
   * Resolves supported JavaScript runtime for YouTube challenge solving.
   * Prefers Deno 2.x, or Node.js 22+. Explicitly rejects Node <= 20.
   */
  static async resolveJsRuntime(): Promise<JsRuntimeInfo> {
    const now = Date.now();
    if (this.jsRuntimeInfo && now - this.lastJsCheckTime < 60000) {
      return this.jsRuntimeInfo;
    }

    const preferred = config.providers.ytdlp.jsRuntime;

    if (preferred === 'none') {
      this.jsRuntimeInfo = {
        available: false,
        name: 'none',
        isSupported: false,
        warning: 'JS runtime explicitly disabled in configuration',
      };
      this.lastJsCheckTime = now;
      return this.jsRuntimeInfo;
    }

    // Check Deno if preferred or 'auto' (Recommended by yt-dlp docs)
    if (preferred === 'deno' || preferred === 'auto') {
      try {
        const { stdout } = await execFileAsync('deno', ['--version'], { timeout: 4000 });
        const firstLine = stdout.trim().split('\n')[0] || '';
        const verMatch = firstLine.match(/deno\s+([0-9.]+)/i);
        const version = verMatch ? verMatch[1] : firstLine;
        this.jsRuntimeInfo = {
          available: true,
          name: 'deno',
          version,
          isSupported: true,
        };
        this.lastJsCheckTime = now;
        return this.jsRuntimeInfo;
      } catch {
        // Deno not available, fall through
      }
    }

    // Check Node.js if preferred or 'auto'
    if (preferred === 'node' || preferred === 'auto') {
      try {
        const { stdout } = await execFileAsync('node', ['--version'], { timeout: 4000 });
        const version = stdout.trim();
        const majorMatch = version.match(/^v?(\d+)/);
        const major = majorMatch ? parseInt(majorMatch[1], 10) : 0;

        if (major >= 22) {
          this.jsRuntimeInfo = {
            available: true,
            name: 'node',
            version,
            isSupported: true,
          };
        } else if (major > 0) {
          // Node 20 or lower is NOT supported for yt-dlp EJS runtime
          this.jsRuntimeInfo = {
            available: false,
            name: 'node',
            version,
            isSupported: false,
            warning: `Node.js ${version} is below version 22. Deno 2.x or Node 22+ is required for yt-dlp YouTube challenge solving.`,
          };
        }
        this.lastJsCheckTime = now;
        if (this.jsRuntimeInfo) return this.jsRuntimeInfo;
      } catch {
        // Node not available on PATH
      }
    }

    this.jsRuntimeInfo = {
      available: false,
      name: 'none',
      isSupported: false,
      warning: 'No supported JavaScript runtime (Deno 2.x or Node 22+) detected on host system.',
    };
    this.lastJsCheckTime = now;
    return this.jsRuntimeInfo;
  }

  /**
   * Returns command arguments for JS runtime configuration.
   */
  static async getJsRuntimeArgs(): Promise<string[]> {
    const runtime = await this.resolveJsRuntime();
    if (runtime.available && runtime.isSupported && (runtime.name === 'deno' || runtime.name === 'node')) {
      return ['--js-runtimes', runtime.name];
    }
    return [];
  }

  /**
   * Returns command arguments for remote EJS components if configured.
   */
  static getEjsArgs(): string[] {
    const raw = config.providers.ytdlp.remoteComponents || config.providers.ytdlp.ejsSource;
    if (!raw || raw === 'none' || raw === 'false') {
      return [];
    }

    if (raw.startsWith('ejs:')) {
      return ['--remote-components', raw];
    }

    if (raw === 'github') {
      return ['--remote-components', 'ejs:github'];
    }

    if (raw === 'npm') {
      return ['--remote-components', 'ejs:npm'];
    }

    return ['--remote-components', raw];
  }

  /**
   * Checks if FFmpeg is installed and accessible on host.
   */
  static async checkFfmpeg(): Promise<FfmpegInfo> {
    if (this.ffmpegChecked) return this.ffmpegInfo;
    try {
      const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
      const firstLine = stdout.trim().split('\n')[0] || '';
      const verMatch = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
      const version = verMatch ? verMatch[1] : firstLine;
      this.ffmpegInfo = { available: true, version };
    } catch {
      this.ffmpegInfo = { available: false };
    }
    this.ffmpegChecked = true;
    return this.ffmpegInfo;
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

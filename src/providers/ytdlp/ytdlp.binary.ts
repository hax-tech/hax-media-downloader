import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class YtDlpBinaryManager {
  private static cachedPath: string | null = null;
  private static lastCheckTime = 0;
  private static isAvailable = false;
  private static version = 'unknown';

  /**
   * Finds the best available path to the yt-dlp executable.
   * Priority:
   * 1. Configured YTDLP_PATH
   * 2. Local ./bin/yt-dlp in workspace
   * 3. System installed PATH binary
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

    const candidatePaths = [
      config.providers.ytdlp.binaryPath,
      path.join(process.cwd(), 'bin', 'yt-dlp'),
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      'yt-dlp',
    ];

    for (const candidate of candidatePaths) {
      if (!candidate) continue;

      try {
        // If it's a file path, check if it exists on disk
        if (candidate.includes('/') || candidate.includes('\\')) {
          if (!fs.existsSync(candidate)) {
            continue;
          }
        }

        const { stdout } = await execAsync(`"${candidate}" --version`, { timeout: 4000 });
        const ver = stdout.trim();
        if (ver) {
          this.cachedPath = candidate;
          this.isAvailable = true;
          this.version = ver;
          this.lastCheckTime = now;
          logger.info(`Resolved yt-dlp binary at: ${candidate} (version: ${ver})`);
          return { available: true, path: candidate, version: ver };
        }
      } catch {
        // Continue checking other candidate paths
      }
    }

    this.isAvailable = false;
    this.cachedPath = null;
    this.version = 'not found';
    this.lastCheckTime = now;
    return { available: false, version: 'not found' };
  }

  static async executeCommand(args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {
    const binary = await this.resolveBinary();
    if (!binary.available || !binary.path) {
      throw new Error('yt-dlp binary is not installed or available on this system.');
    }

    return execFileAsync(binary.path, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
  }
}

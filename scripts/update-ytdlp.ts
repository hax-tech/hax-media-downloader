import { exec } from 'child_process';
import { promisify } from 'util';
import { YtDlpBinaryManager } from '../src/providers/ytdlp/ytdlp.binary.ts';
import { logger } from '../src/utils/logger.ts';

const execAsync = promisify(exec);

/**
 * Script to safely verify and upgrade yt-dlp to latest official release.
 * Only targets official channels / self-updater.
 */
export async function updateYtDlp() {
  console.log('[yt-dlp Updater] Checking current yt-dlp installation...');
  const resolution = await YtDlpBinaryManager.resolveBinary();

  if (!resolution.available || !resolution.path) {
    console.log('[yt-dlp Updater] No existing yt-dlp binary found on this system.');
    console.log('To install the official release on Linux/macOS:');
    console.log('  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp');
    console.log('  sudo chmod a+rx /usr/local/bin/yt-dlp');
    return;
  }

  console.log(`[yt-dlp Updater] Found binary at: ${resolution.path} (version: ${resolution.version})`);
  console.log('[yt-dlp Updater] Executing official updater: yt-dlp -U ...');

  try {
    const { stdout, stderr } = await execAsync(`"${resolution.path}" -U`);
    console.log(stdout || stderr);
    console.log('[yt-dlp Updater] Update check completed.');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('installed via') || msg.includes('permission denied')) {
      console.warn('[yt-dlp Updater] Notice: Self-update is restricted by package manager permissions. Update using system package manager.');
    } else {
      logger.error('[yt-dlp Updater] Update error:', { error: msg });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateYtDlp();
}

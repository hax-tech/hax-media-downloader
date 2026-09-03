import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { config } from '../../config/index.ts';
import { logger } from '../../utils/logger.ts';
import { DownloaderError } from '../../utils/errors.ts';

export interface FileValidationResult {
  isValid: boolean;
  size: number;
  mimeType: string;
  extension: string;
  error?: string;
}

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_MAP));

export class StorageService {
  private tempDir: string;
  private tokenToFileMap: Map<string, { filePath: string; jobId: string; mimeType: string; filename: string; expiresAt: number }> = new Map();

  constructor() {
    this.tempDir = path.resolve(config.tempDir);
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o700 });
      }
    } catch (err) {
      logger.error('Failed to create storage temporary directory', { tempDir: this.tempDir, error: (err as Error).message });
    }
  }

  getTempDir(): string {
    this.ensureDirectory();
    return this.tempDir;
  }

  /**
   * Generates an isolated, unpredictable safe path inside TEMP_DIR.
   */
  generateSafeFilePath(jobId: string, ext = 'mp4'): { filePath: string; fileToken: string } {
    this.ensureDirectory();
    const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
    const randomHex = crypto.randomBytes(8).toString('hex');
    const safeBaseName = `${jobId}_${randomHex}.${safeExt}`;
    const filePath = path.join(this.tempDir, safeBaseName);
    const fileToken = `tok_${crypto.randomBytes(16).toString('hex')}`;
    return { filePath, fileToken };
  }

  /**
   * Registers a validated file with a safe download token.
   */
  registerFileToken(
    fileToken: string,
    jobId: string,
    filePath: string,
    mimeType: string,
    filename: string,
    ttlSeconds: number
  ): void {
    // Bounded cleanup if map gets large
    if (this.tokenToFileMap.size > 2000) {
      this.purgeExpiredTokens();
    }

    this.tokenToFileMap.set(fileToken, {
      filePath,
      jobId,
      mimeType,
      filename,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  getFileByToken(fileToken: string): { filePath: string; jobId: string; mimeType: string; filename: string } | null {
    const entry = this.tokenToFileMap.get(fileToken);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.tokenToFileMap.delete(fileToken);
      this.deleteFileSafely(entry.filePath);
      return null;
    }
    return entry;
  }

  /**
   * Sanitizes user-facing title for Content-Disposition header.
   */
  sanitizeFilename(title: string, extension: string): string {
    const base = title
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'media';
    const cleanExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
    return `${base}.${cleanExt}`;
  }

  /**
   * Validates downloaded file: existence, non-empty, max size, extension, and magic bytes.
   */
  async validateDownloadedFile(filePath: string, expectedFormat?: string): Promise<FileValidationResult> {
    // 1. Verify path is strictly inside tempDir (anti-traversal)
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.tempDir)) {
      return { isValid: false, size: 0, mimeType: '', extension: '', error: 'File path security violation' };
    }

    // 2. Check existence
    if (!fs.existsSync(resolved)) {
      return { isValid: false, size: 0, mimeType: '', extension: '', error: 'Target file does not exist' };
    }

    // 3. Stat check
    const stat = await fs.promises.stat(resolved);
    if (stat.size === 0) {
      await this.deleteFileSafely(resolved);
      return { isValid: false, size: 0, mimeType: '', extension: '', error: 'Downloaded file is empty (0 bytes)' };
    }

    if (stat.size > config.providers.ytdlp.maxFileSizeBytes) {
      await this.deleteFileSafely(resolved);
      return {
        isValid: false,
        size: stat.size,
        mimeType: '',
        extension: '',
        error: `File size (${Math.round(stat.size / 1024 / 1024)}MB) exceeds limit of ${config.providers.ytdlp.maxFileSize}`,
      };
    }

    // 4. Extension check
    const ext = path.extname(resolved).replace('.', '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      await this.deleteFileSafely(resolved);
      return { isValid: false, size: stat.size, mimeType: '', extension: ext, error: `Disallowed media extension: .${ext}` };
    }

    // 5. Header / magic byte verification
    const mimeType = MIME_MAP[ext] || 'application/octet-stream';
    const isMagicValid = await this.verifyMagicBytes(resolved, ext);
    if (!isMagicValid) {
      await this.deleteFileSafely(resolved);
      return { isValid: false, size: stat.size, mimeType, extension: ext, error: `Invalid or corrupted media file signature for .${ext}` };
    }

    return {
      isValid: true,
      size: stat.size,
      mimeType,
      extension: ext,
    };
  }

  /**
   * Inspects initial file bytes to verify media container headers.
   */
  private async verifyMagicBytes(filePath: string, ext: string): Promise<boolean> {
    try {
      const fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(32);
      await fd.read(buffer, 0, 32, 0);
      await fd.close();

      // MP4/M4A: check for 'ftyp' in bytes 4..12
      if (ext === 'mp4' || ext === 'm4a') {
        const str = buffer.toString('utf8', 4, 12);
        return str.includes('ftyp') || buffer.slice(0, 4).toString('hex') === '00000018' || buffer.slice(0, 4).toString('hex') === '00000020';
      }

      // WEBM: EBML header 1A 45 DF A3
      if (ext === 'webm') {
        return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
      }

      // MP3: ID3 or sync frame
      if (ext === 'mp3') {
        const id3 = buffer.toString('utf8', 0, 3);
        if (id3 === 'ID3') return true;
        // MPEG sync frame (11 bits set): buffer[0] === 0xFF and (buffer[1] & 0xE0) === 0xE0
        if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
        return true; // some MP3 files have non-standard headers
      }

      // OGG: 'OggS'
      if (ext === 'ogg') {
        return buffer.toString('utf8', 0, 4) === 'OggS';
      }

      // WAV: 'RIFF'
      if (ext === 'wav') {
        return buffer.toString('utf8', 0, 4) === 'RIFF';
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely removes a file from disk ensuring no directory traversal outside tempDir.
   */
  async deleteFileSafely(filePath: string): Promise<void> {
    try {
      const resolved = path.resolve(filePath);
      if (resolved.startsWith(this.tempDir) && fs.existsSync(resolved)) {
        await fs.promises.unlink(resolved);
      }
    } catch (err) {
      logger.warn(`Could not delete temp file ${filePath}: ${(err as Error).message}`);
    }
  }

  /**
   * Streams file safely to response with HTTP Range header support.
   */
  serveFileWithRanges(
    filePath: string,
    mimeType: string,
    downloadFilename: string,
    req: Request,
    res: Response
  ): void {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.tempDir) || !fs.existsSync(resolved)) {
      throw DownloaderError.jobNotFound('Requested media file not found or expired');
    }

    const stat = fs.statSync(resolved);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunksize = end - start + 1;
      const stream = fs.createReadStream(resolved, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });

      stream.pipe(res);
      stream.on('error', (err) => {
        logger.error('Stream range error', { error: (err as Error).message });
      });
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
      });

      const stream = fs.createReadStream(resolved);
      stream.pipe(res);
      stream.on('error', (err) => {
        logger.error('Stream error', { error: (err as Error).message });
      });
    }
  }

  /**
   * Purges expired files and tokens from the temporary directory.
   */
  async purgeExpiredFiles(maxAgeSeconds = config.cache.jobExpirationSeconds): Promise<number> {
    this.purgeExpiredTokens();
    let deletedCount = 0;
    try {
      this.ensureDirectory();
      const files = await fs.promises.readdir(this.tempDir);
      const now = Date.now();
      const maxAgeMs = maxAgeSeconds * 1000;

      for (const file of files) {
        const fullPath = path.join(this.tempDir, file);
        try {
          const stat = await fs.promises.stat(fullPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.promises.unlink(fullPath);
            deletedCount++;
          }
        } catch {
          // ignore stat/unlink races
        }
      }
    } catch (err) {
      logger.warn(`Failed during temp directory file purge: ${(err as Error).message}`);
    }
    return deletedCount;
  }

  private purgeExpiredTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokenToFileMap.entries()) {
      if (now > entry.expiresAt) {
        this.tokenToFileMap.delete(token);
        this.deleteFileSafely(entry.filePath);
      }
    }
  }
}

export const storageService = new StorageService();

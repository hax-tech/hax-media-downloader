import { DownloaderProvider } from './provider.interface.ts';
import {
  Platform,
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  ProviderHealth,
  SearchResultItem,
} from '../../types/index.ts';
import { detectPlatform } from '../../utils/platform-detector.ts';

export abstract class BaseProvider implements DownloaderProvider {
  abstract readonly name: string;
  abstract readonly supportedPlatforms: Platform[];

  isSupported(url: string): boolean {
    const detected = detectPlatform(url);
    if (!detected) return false;
    return this.supportedPlatforms.includes(detected);
  }

  abstract getInfo(url: string, options?: DownloadOptions): Promise<MediaInfo>;
  abstract download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult>;
  abstract healthCheck(): Promise<ProviderHealth>;

  async search?(query: string, platform?: Platform): Promise<SearchResultItem[]> {
    return [];
  }

  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName = 'Operation'
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`[${this.name}] ${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

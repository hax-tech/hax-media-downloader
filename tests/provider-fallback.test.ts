import assert from 'assert';
import { BaseProvider } from '../src/providers/base/base.provider.ts';
import { ProviderManager } from '../src/services/provider-manager/provider-manager.service.ts';
import {
  Platform,
  DownloadOptions,
  MediaInfo,
  NormalizedDownloadResult,
  ProviderHealth,
} from '../src/types/index.ts';

class FailingMockProvider extends BaseProvider {
  readonly name = 'yt-dlp'; // Match highest priority
  readonly supportedPlatforms: Platform[] = ['youtube'];

  async healthCheck(): Promise<ProviderHealth> {
    return { provider: this.name, available: false, statusMessage: 'Simulated failure' };
  }
  async getInfo(): Promise<MediaInfo> {
    throw new Error('yt-dlp binary crashed');
  }
  async download(): Promise<NormalizedDownloadResult> {
    throw new Error('yt-dlp download failed');
  }
}

class WorkingFallbackProvider extends BaseProvider {
  readonly name = 'cobalt'; // Next priority
  readonly supportedPlatforms: Platform[] = ['youtube'];

  async healthCheck(): Promise<ProviderHealth> {
    return { provider: this.name, available: true, statusMessage: 'Healthy' };
  }
  async getInfo(url: string): Promise<MediaInfo> {
    return {
      id: 'mock_123',
      title: 'Fallback Media Title',
      platform: 'youtube',
      url,
      originalUrl: url,
    };
  }
  async download(url: string, options?: DownloadOptions): Promise<NormalizedDownloadResult> {
    return {
      success: true,
      platform: 'youtube',
      provider: this.name,
      title: 'Fallback Media Title',
      duration: 120,
      format: options?.format || 'mp4',
      quality: options?.quality || '720p',
      url: 'https://cdn.example.com/fallback-stream.mp4',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      jobId: 'mock_job',
    };
  }
}

export async function runProviderFallbackTests() {
  console.log('--- Testing Provider Fallback Mechanism ---');

  const customManager = new ProviderManager();
  // Override with our controlled test providers
  customManager.registerProvider(new FailingMockProvider());
  customManager.registerProvider(new WorkingFallbackProvider());

  const testUrl = 'https://www.youtube.com/watch?v=fallback_test';

  // 1. Test getInfo fallback
  const infoRes = await customManager.getInfo(testUrl);
  assert.strictEqual(infoRes.providerUsed, 'cobalt', 'Should successfully fall back to cobalt on getInfo');
  assert.strictEqual(infoRes.info.title, 'Fallback Media Title');

  // 2. Test download fallback
  const downloadRes = await customManager.download(testUrl, { quality: '720p' });
  assert.strictEqual(downloadRes.success, true);
  assert.strictEqual(downloadRes.provider, 'cobalt', 'Should fall back to cobalt for download');
  assert.strictEqual(downloadRes.url, 'https://cdn.example.com/fallback-stream.mp4');

  console.log('✓ Provider fallback tests passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProviderFallbackTests();
}

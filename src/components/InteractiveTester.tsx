import React, { useState } from 'react';
import { Play, Copy, Check, Info, ArrowDownCircle, Smartphone } from 'lucide-react';

export const InteractiveTester: React.FC<{ onJobCreated?: () => void }> = ({ onJobCreated }) => {
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [endpoint, setEndpoint] = useState<'download' | 'info'>('download');
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const [quality, setQuality] = useState('720p');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const sampleLinks = [
    { label: 'YouTube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { label: 'Instagram Reel', url: 'https://www.instagram.com/reel/C8xyz123/' },
    { label: 'TikTok', url: 'https://www.tiktok.com/@creator/video/7182938472918237182' },
    { label: 'Facebook Watch', url: 'https://fb.watch/kL9832_abc/' },
    { label: 'Pinterest', url: 'https://pin.it/7a8b9c0' },
  ];

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setResponse(null);
    setStatusCode(null);

    try {
      const targetPath = endpoint === 'download' ? '/api/download' : '/api/info';
      const body =
        endpoint === 'download'
          ? { url: url.trim(), type: mediaType, quality, format: mediaType === 'audio' ? 'mp3' : 'mp4' }
          : { url: url.trim() };

      const res = await fetch(targetPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setStatusCode(res.status);
      const data = await res.json();
      setResponse(data);
      if (onJobCreated) onJobCreated();
    } catch (err: unknown) {
      setStatusCode(500);
      setResponse({
        success: false,
        error: (err as Error).message || 'Network request failed',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="interactive-tester-card" className="bg-white rounded-xl border border-zinc-200/80 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-zinc-900 text-white">
            <Play className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Interactive API Console</h2>
            <p className="text-xs text-zinc-500">Live testing for Tanu-xai WhatsApp bot queries</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setEndpoint('download')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              endpoint === 'download'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            POST /api/download
          </button>
          <button
            type="button"
            onClick={() => setEndpoint('info')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              endpoint === 'info'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            POST /api/info
          </button>
        </div>
      </div>

      <form onSubmit={handleTest} className="mt-4 space-y-4">
        <div>
          <label htmlFor="media-url-input" className="block text-xs font-medium text-zinc-700 mb-1">
            Target Media URL
          </label>
          <div className="flex gap-2">
            <input
              id="media-url-input"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 font-mono text-zinc-800"
              required
            />
            <button
              id="btn-submit-test"
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-sm font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              {loading ? (
                <span>Executing...</span>
              ) : (
                <>
                  <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
                  <span>Send Request</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Sample Links */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Quick samples:</span>
          {sampleLinks.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setUrl(s.url)}
              className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium transition"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Options for /api/download */}
        {endpoint === 'download' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-zinc-50 border border-zinc-100 text-xs">
            <div>
              <label className="block text-zinc-500 mb-1">Media Type</label>
              <select
                id="media-type-select"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as 'video' | 'audio')}
                className="w-full bg-white border border-zinc-300 rounded px-2 py-1.5 text-zinc-800"
              >
                <option value="video">Video (MP4)</option>
                <option value="audio">Audio (MP3)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-500 mb-1">Quality Target</label>
              <select
                id="quality-select"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded px-2 py-1.5 text-zinc-800"
              >
                <option value="1080p">1080p (Full HD)</option>
                <option value="720p">720p (Standard HD)</option>
                <option value="480p">480p (SD)</option>
                <option value="360p">360p (Light)</option>
                <option value="best">Best Available</option>
              </select>
            </div>

            <div className="col-span-2 sm:col-span-1 flex flex-col justify-end">
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Info className="w-3 h-3 text-zinc-400" />
                Fallback auto-resolves if primary provider lacks format
              </span>
            </div>
          </div>
        )}
      </form>

      {/* Response Display */}
      {response && (
        <div className="mt-5 pt-4 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-zinc-700">API Response</span>
              {statusCode && (
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                    statusCode >= 200 && statusCode < 300
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  HTTP {statusCode}
                </span>
              )}
            </div>

            <button
              onClick={copyToClipboard}
              className="inline-flex items-center space-x-1 text-xs text-zinc-500 hover:text-zinc-800 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>

          <pre
            id="response-json-viewer"
            className="p-3.5 bg-zinc-900 text-zinc-100 rounded-lg text-xs font-mono overflow-x-auto max-h-72"
          >
            {JSON.stringify(response, null, 2)}
          </pre>

          {/* Tanu-xai WhatsApp Bot Simulation */}
          <div className="mt-3 p-3 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-xs">
            <div className="flex items-center space-x-1.5 font-medium text-emerald-900 mb-1">
              <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
              <span>Tanu-xai Bot WhatsApp Dispatcher</span>
            </div>
            <p className="text-emerald-800">
              {(response as any)?.url
                ? `Bot ready to pipe stream to user via sock.sendMessage(chatId, { video: { url: "${(response as any)?.url?.slice(0, 45)}..." } })`
                : 'Bot receives structured error message or status code and replies safely to the WhatsApp user.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

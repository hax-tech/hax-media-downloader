import React from 'react';
import { HardDrive, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

export interface ProviderItem {
  name: string;
  supportedPlatforms: string[];
  isAvailable: boolean;
  latencyMs?: number;
  statusMessage?: string;
  version?: string;
  successCount?: number;
  failureCount?: number;
}

interface ProviderCardProps {
  providers: ProviderItem[];
  priorityOrder: string[];
  loading: boolean;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  providers,
  priorityOrder,
  loading,
}) => {
  return (
    <div id="providers-status-card" className="bg-white rounded-xl border border-zinc-200/80 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-100 gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-zinc-100 text-zinc-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Downloader Provider Adapters</h2>
            <p className="text-xs text-zinc-500">Auto-fallback chain & health check results</p>
          </div>
        </div>

        <div className="flex items-center space-x-1 text-xs text-zinc-500">
          <span>Priority:</span>
          <span className="font-mono font-medium text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded">
            {priorityOrder.join(' ➔ ') || 'ytdlp ➔ cobalt ➔ external'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-4">
        {providers.map((p, idx) => {
          return (
            <div
              key={p.name}
              id={`provider-box-${p.name}`}
              className="p-3.5 rounded-lg border border-zinc-200/80 bg-zinc-50/50 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-700 text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-900 capitalize">{p.name}</h3>
                  </div>

                  {p.isAvailable ? (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Unconfigured</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-600 line-clamp-2 min-h-[32px]">
                  {p.statusMessage || (p.isAvailable ? 'Adapter ready to process queries' : 'Provider not configured or unavailable')}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-200/60 text-xs text-zinc-500 flex justify-between items-center">
                <span>
                  Latency: <strong className="text-zinc-700">{p.latencyMs !== undefined ? `${p.latencyMs}ms` : '—'}</strong>
                </span>
                <span>
                  Calls: <strong className="text-emerald-700">{p.successCount || 0}</strong> / <strong className="text-rose-700">{p.failureCount || 0}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

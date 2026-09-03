import React from 'react';
import { Download, ShieldCheck, Terminal } from 'lucide-react';

interface HeaderProps {
  uptimeSeconds?: number;
  environment?: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  uptimeSeconds = 0,
  environment = 'production',
  onRefresh,
  isRefreshing,
}) => {
  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${s}s`;
    if (mins > 0) return `${mins}m ${s}s`;
    return `${s}s`;
  };

  return (
    <header id="dashboard-header" className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-sm">
            <Download className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">hax-media-downloader</h1>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Author: <span className="font-medium text-zinc-700">Hamza</span> &bull; Consumer: <span className="font-medium text-zinc-700">Tanu-xai Bot</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/80">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Public Media Only</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/80">
            <Terminal className="w-3.5 h-3.5 text-zinc-500" />
            <span>Uptime: {formatUptime(uptimeSeconds)}</span>
          </div>

          <button
            id="btn-refresh-dashboard"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {isRefreshing ? 'Syncing...' : 'Refresh Status'}
          </button>
        </div>
      </div>
    </header>
  );
};

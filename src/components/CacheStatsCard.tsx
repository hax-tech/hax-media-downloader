import React, { useState } from 'react';
import { Database, Trash2, CheckCircle2, Clock } from 'lucide-react';

interface CacheStatsCardProps {
  cache?: {
    count: number;
    activeCount: number;
    enabled: boolean;
  } | null;
  onCleanupTriggered: () => void;
}

export const CacheStatsCard: React.FC<CacheStatsCardProps> = ({ cache, onCleanupTriggered }) => {
  const [cleaning, setCleaning] = useState(false);
  const [lastStats, setLastStats] = useState<{
    expiredJobsDeleted: number;
    staleCacheEntriesRemoved: number;
    abandonedJobsMarkedExpired: number;
  } | null>(null);
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('hax_admin_key') || '');
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const saveKeyToSession = (key: string) => {
    setAdminKey(key);
    if (key.trim()) {
      sessionStorage.setItem('hax_admin_key', key.trim());
    } else {
      sessionStorage.removeItem('hax_admin_key');
    }
  };

  const handleCleanup = async () => {
    const keyToUse = adminKey.trim() || sessionStorage.getItem('hax_admin_key') || '';
    if (!keyToUse) {
      setShowAdminInput(true);
      setErrorMessage('Admin API Key or Cron Secret required to trigger cleanup.');
      return;
    }

    setCleaning(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch('/api/admin/cache/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': keyToUse,
        },
      });

      const data = await res.json();
      if (res.ok && data.success && data.stats) {
        setLastStats(data.stats);
        setInfoMessage('Garbage collector executed successfully.');
        onCleanupTriggered();
      } else {
        setErrorMessage(data.error || 'Cleanup unauthorized. Please check your Admin API Key or CRON_SECRET.');
      }
    } catch {
      setErrorMessage('Network error while connecting to cleanup endpoint.');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div id="cache-stats-card" className="bg-white rounded-xl border border-zinc-200/80 p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-zinc-100 text-zinc-700">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Metadata Cache & Storage</h2>
              <p className="text-xs text-zinc-500">In-memory TTL cache with auto garbage collection</p>
            </div>
          </div>

          <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-100 text-zinc-700">
            {cache?.enabled !== false ? 'Active (TTL 1800s)' : 'Disabled'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4">
          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
            <span className="text-xs text-zinc-500">Total Entries</span>
            <p className="text-lg font-semibold text-zinc-900 mt-1">{cache?.count ?? 0}</p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
            <span className="text-xs text-zinc-500">Unexpired Active</span>
            <p className="text-lg font-semibold text-emerald-700 mt-1">{cache?.activeCount ?? 0}</p>
          </div>
        </div>

        {lastStats && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-50 text-emerald-900 text-xs border border-emerald-200/60">
            <div className="flex items-center space-x-1 font-semibold mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Last Cleanup Statistics:</span>
            </div>
            <p>• Expired jobs removed: {lastStats.expiredJobsDeleted}</p>
            <p>• Stale cache entries purged: {lastStats.staleCacheEntriesRemoved}</p>
            <p>• Abandoned jobs marked: {lastStats.abandonedJobsMarkedExpired}</p>
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-rose-50 text-rose-800 text-xs border border-rose-200">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200">
            {infoMessage}
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-zinc-100">
        {showAdminInput && (
          <div className="mb-2 space-y-1">
            <input
              type="password"
              placeholder="Enter ADMIN_API_KEY or CRON_SECRET"
              value={adminKey}
              onChange={(e) => saveKeyToSession(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded font-mono"
            />
            <p className="text-[11px] text-zinc-400">Stored in browser session for authenticated actions.</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdminInput(!showAdminInput)}
            className="text-[11px] text-zinc-500 hover:text-zinc-800 underline"
          >
            {showAdminInput ? 'Hide Admin Key' : (adminKey ? 'Edit Admin Key' : 'Enter Admin Key')}
          </button>

          <button
            id="btn-trigger-cleanup"
            onClick={handleCleanup}
            disabled={cleaning}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{cleaning ? 'Purging...' : 'Run Garbage Collector'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

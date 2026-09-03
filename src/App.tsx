import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { HealthCard } from './components/HealthCard.tsx';
import { ProviderCard, ProviderItem } from './components/ProviderCard.tsx';
import { InteractiveTester } from './components/InteractiveTester.tsx';
import { CacheStatsCard } from './components/CacheStatsCard.tsx';
import { JobsTable } from './components/JobsTable.tsx';
import { DownloadJob } from './types/index.ts';

export default function App() {
  const [health, setHealth] = useState<any>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [priorityOrder, setPriorityOrder] = useState<string[]>(['ytdlp', 'cobalt', 'external']);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      // 1. Health check
      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealth(hData);
      }

      // 2. Providers
      const provRes = await fetch('/api/providers');
      if (provRes.ok) {
        const pData = await provRes.json();
        if (pData.providers) setProviders(pData.providers);
        if (pData.priorityOrder) setPriorityOrder(pData.priorityOrder);
      }

      // 3. Admin stats & jobs (using default key or gracefully falling back)
      const adminHeaders = {
        'X-Admin-Key': 'hax-admin-super-secret-key-change-in-prod',
      };

      const statsRes = await fetch('/api/admin/stats', { headers: adminHeaders });
      if (statsRes.ok) {
        const sData = await statsRes.json();
        if (sData.cache) setCacheStats(sData.cache);
      }

      const jobsRes = await fetch('/api/admin/jobs?limit=25', { headers: adminHeaders });
      if (jobsRes.ok) {
        const jData = await jobsRes.json();
        if (jData.jobs) setJobs(jData.jobs);
      }
    } catch {
      // Graceful fallback for offline or loading state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-zinc-900 selection:text-white">
      <Header
        uptimeSeconds={health?.uptimeSeconds}
        environment={health?.environment}
        onRefresh={handleManualRefresh}
        isRefreshing={refreshing}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Tier: System Health & Provider Adapters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HealthCard health={health} loading={loading} />
          <CacheStatsCard cache={cacheStats} onCleanupTriggered={fetchDashboardData} />
        </div>

        {/* Middle Tier: Downloader Providers Status */}
        <ProviderCard
          providers={providers}
          priorityOrder={priorityOrder}
          loading={loading}
        />

        {/* Interactive Testing Console for WhatsApp Bot Simulation */}
        <InteractiveTester onJobCreated={fetchDashboardData} />

        {/* Bottom Tier: Active & Recent Jobs Table */}
        <JobsTable jobs={jobs} loading={loading} />
      </main>

      <footer className="border-t border-zinc-200 bg-white py-4 text-center text-xs text-zinc-500">
        <p>
          <strong>hax-media-downloader</strong> &bull; Crafted for Hamza & WhatsApp bot <strong>Tanu-xai</strong> &bull; Zero DRM Bypass &bull; Public Media Only
        </p>
      </footer>
    </div>
  );
}

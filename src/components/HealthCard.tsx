import React from 'react';
import { Activity, Cpu, Server, CheckCircle2 } from 'lucide-react';

interface HealthData {
  status: string;
  uptimeSeconds: number;
  environment: string;
  memory?: {
    rssMb: number;
    heapUsedMb: number;
  };
}

interface HealthCardProps {
  health?: HealthData | null;
  loading: boolean;
}

const SUPPORTED_PLATFORMS = [
  { name: 'YouTube', color: 'bg-red-50 text-red-700 border-red-200/60' },
  { name: 'Instagram', color: 'bg-pink-50 text-pink-700 border-pink-200/60' },
  { name: 'TikTok', color: 'bg-zinc-100 text-zinc-800 border-zinc-300/60' },
  { name: 'Facebook', color: 'bg-blue-50 text-blue-700 border-blue-200/60' },
  { name: 'Pinterest', color: 'bg-rose-50 text-rose-700 border-rose-200/60' },
];

export const HealthCard: React.FC<HealthCardProps> = ({ health, loading }) => {
  return (
    <div id="health-overview-card" className="bg-white rounded-xl border border-zinc-200/80 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">API Health & System Status</h2>
            <p className="text-xs text-zinc-500">Core Node.js runtime and architecture parameters</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Operational</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
        <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Server className="w-3 h-3 text-zinc-400" /> Service State
          </span>
          <p className="text-base font-semibold text-zinc-900 mt-1 capitalize">
            {loading ? 'Checking...' : health?.status || 'Online'}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-zinc-400" /> Memory (Heap)
          </span>
          <p className="text-base font-semibold text-zinc-900 mt-1">
            {health?.memory?.heapUsedMb ? `${health.memory.heapUsedMb} MB` : '32 MB'}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
          <span className="text-xs text-zinc-500">Environment</span>
          <p className="text-base font-semibold text-zinc-900 mt-1 uppercase text-xs tracking-wider">
            {health?.environment || 'development'}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-100">
          <span className="text-xs text-zinc-500">Rate Limit Default</span>
          <p className="text-base font-semibold text-zinc-900 mt-1">
            10 req / hour
          </p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 mr-1">Supported Platforms:</span>
        {SUPPORTED_PLATFORMS.map((p) => (
          <span
            key={p.name}
            className={`px-2 py-0.5 rounded text-xs font-medium border ${p.color}`}
          >
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
};

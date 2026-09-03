import React from 'react';
import { Clock, CheckCircle2, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { DownloadJob } from '../types/index.ts';

interface JobsTableProps {
  jobs: DownloadJob[];
  loading: boolean;
}

export const JobsTable: React.FC<JobsTableProps> = ({ jobs, loading }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>Completed</span>
          </span>
        );
      case 'processing':
      case 'pending':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Processing</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
            <Clock className="w-3 h-3" />
            <span>Expired</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div id="recent-jobs-card" className="bg-white rounded-xl border border-zinc-200/80 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-zinc-100 text-zinc-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Recent Download Jobs & Audit Log</h2>
            <p className="text-xs text-zinc-500">Metadata tracking & expiration records (No media stored in DB)</p>
          </div>
        </div>

        <span className="text-xs text-zinc-500">
          Showing {jobs.length} jobs
        </span>
      </div>

      <div className="overflow-x-auto mt-3">
        {jobs.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-xs">
            No media jobs recorded yet. Run a request via the Interactive API Console above!
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="pb-2 font-medium">Job ID</th>
                <th className="pb-2 font-medium">Platform</th>
                <th className="pb-2 font-medium">Provider</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Title / Source URL</th>
                <th className="pb-2 font-medium">Created</th>
                <th className="pb-2 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-zinc-50/70 transition">
                  <td className="py-2.5 font-mono text-zinc-700">{job.id.slice(0, 12)}</td>
                  <td className="py-2.5 capitalize font-medium text-zinc-800">{job.platform}</td>
                  <td className="py-2.5 font-mono text-zinc-600">{job.provider}</td>
                  <td className="py-2.5">{getStatusBadge(job.status)}</td>
                  <td className="py-2.5 max-w-xs truncate text-zinc-700" title={job.sourceUrl}>
                    {job.title || job.sourceUrl}
                  </td>
                  <td className="py-2.5 text-zinc-500">
                    {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="py-2.5 text-zinc-400">
                    {new Date(job.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// frontend/src/components/SystemProofs.jsx
import React, { useState } from 'react';
import { Zap, Lock, TrendingUp } from 'lucide-react';
import ConcurrencyDemo from './ConcurrencyDemo.jsx';
import AuditChainViewer from './AuditChainViewer.jsx';
import BenchmarkScorecard from './BenchmarkScorecard.jsx';

export default function SystemProofs({ logs, onRefreshLogs }) {
  const [subTab, setSubTab] = useState('concurrency'); // 'concurrency', 'audit', 'benchmarks'

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('concurrency')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              subTab === 'concurrency'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Concurrency Race</span>
          </button>

          <button
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              subTab === 'audit'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Hash Chain Integrity</span>
          </button>

          <button
            onClick={() => setSubTab('benchmarks')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              subTab === 'benchmarks'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Dual-Claim Evaluation</span>
          </button>
        </div>
      </div>

      {/* Render selected sub-section */}
      <div>
        {subTab === 'concurrency' && <ConcurrencyDemo onRefreshLogs={onRefreshLogs} />}
        {subTab === 'audit' && <AuditChainViewer logs={logs} onRefresh={onRefreshLogs} />}
        {subTab === 'benchmarks' && <BenchmarkScorecard />}
      </div>
    </div>
  );
}

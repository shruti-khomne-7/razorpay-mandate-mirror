// frontend/src/components/ConcurrencyDemo.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { Zap, CheckCircle2, XCircle, ShieldCheck, Play, RefreshCw, Layers } from 'lucide-react';

export default function ConcurrencyDemo({ onRefreshLogs }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/v1/evaluation/concurrency-race');
      setResult(res.data);
      if (onRefreshLogs) onRefreshLogs();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Concurrency race failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-white">
            Concurrency Race
          </h2>
        </div>

        <button
          onClick={runDemo}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {loading ? 'Race In Progress...' : 'Launch 20-Thread Race'}
        </button>
      </div>

      {/* Scenario Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-[11px]">
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 block">Mandate Total Cap</span>
          <span className="text-white font-bold text-sm">₹5,000</span>
          <span className="text-slate-500 block text-[10px]">500,000 paise</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 block">Pre-Spent</span>
          <span className="text-amber-400 font-bold text-sm">₹4,800</span>
          <span className="text-slate-500 block text-[10px]">₹200 remaining</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 block">Each Request</span>
          <span className="text-rose-400 font-bold text-sm">₹150</span>
          <span className="text-slate-500 block text-[10px]">15,000 paise</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 block">Expected Outcome</span>
          <span className="text-emerald-400 font-bold text-sm">1 win, 19 rejected</span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results View */}
      {result && (
        <div className="space-y-4">
          {/* Proof Banner */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            result.proof_passed
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-rose-950/20 border-rose-500/30'
          }`}>
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-5 h-5 ${result.proof_passed ? 'text-emerald-400' : 'text-rose-400'}`} />
              <span className={`text-sm font-bold ${result.proof_passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.proof_passed
                  ? 'PROOF PASSED: Exactly 1 winner, 19 rejected, cumulative cap preserved.'
                  : 'PROOF FAILED: Double-spend detected!'}
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              mandate: {result.mandate_id?.substring(0, 20)}…
            </span>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Concurrent Threads</span>
              <div className="text-2xl font-extrabold text-white mt-1">{result.total_concurrent_requests}</div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-center">
              <span className="text-[10px] text-emerald-400 block uppercase font-mono">Winners</span>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> {result.winners_count}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-center">
              <span className="text-[10px] text-rose-400 block uppercase font-mono">Rejected</span>
              <div className="text-2xl font-extrabold text-rose-400 mt-1 flex items-center justify-center gap-2">
                <XCircle className="w-5 h-5" /> {result.rejected_count}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 text-center">
              <span className="text-[10px] text-indigo-400 block uppercase font-mono">Final Spend</span>
              <div className="text-xl font-extrabold text-indigo-300 mt-1">
                ₹{((result.final_cumulative_spend_paise || 0) / 100).toFixed(0)}
              </div>
              <span className="text-[10px] text-indigo-400/80 font-mono block">
                of ₹{((result.cumulative_cap_paise || 0) / 100).toFixed(0)} cap
              </span>
            </div>
          </div>

          {/* Thread Breakdown Grid */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Thread-by-Thread Execution Breakdown
            </h4>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-1.5 font-mono text-xs">
              {result.thread_results?.map((t, i) => {
                const isWinner = t.status === 'WINNER_CLEAR';
                return (
                  <div
                    key={i}
                    className={`p-2 rounded-lg border text-center ${
                      isWinner
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="text-[9px] uppercase">T{t.thread_id}</div>
                    <div className="text-[10px] mt-0.5">{isWinner ? '✓ WON' : '✗'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

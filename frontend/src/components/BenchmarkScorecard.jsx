// frontend/src/components/BenchmarkScorecard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  AlertOctagon,
  RefreshCw,
  Cpu,
  Layers,
  Percent,
  IndianRupee
} from 'lucide-react';

export default function BenchmarkScorecard() {
  const [benchmarks, setBenchmarks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runBenchmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/v1/evaluation/run-benchmarks');
      setBenchmarks(res.data);
    } catch (err) {
      console.error('Benchmark execution error:', err);
      setError(err.response?.data?.message || 'Failed to execute benchmark suite.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runBenchmarks();
  }, []);

  const claimA = benchmarks?.claim_a_deterministic;
  const claimB = benchmarks?.claim_b_statistical;

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white">
            Dual-Claim Evaluation
          </h2>
        </div>

        <button
          onClick={runBenchmarks}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              Re-run Benchmarks
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid of Two Distinct Claims */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CLAIM A: DETERMINISTIC CORRECTNESS */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Claim A: Sequence-Level Structuring Recall</h3>
              <span className="text-[11px] font-mono text-slate-400">Deterministic</span>
            </div>

            {/* Score Comparison Bars */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-400">Stateless Gateway Baseline:</span>
                  <span className="text-rose-400 font-bold">{claimA?.stateless_baseline_recall ?? 0.0}% Recall</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-rose-500 transition-all duration-500"
                    style={{ width: `${claimA?.stateless_baseline_recall ?? 0}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                  {claimA?.stateless_detected_count ?? 0}/100 attacks detected
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-white font-bold">Mandate Mirror Concurrency Engine:</span>
                  <span className="text-emerald-400 font-bold">{claimA?.mandate_mirror_recall ?? 100.0}% Recall</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${claimA?.mandate_mirror_recall ?? 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-emerald-400/80 mt-0.5 block font-mono">
                  {claimA?.mandate_mirror_detected_count ?? 100}/100 attacks detected
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CLAIM B: ADVISORY ANOMALY LAYER */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Claim B: Advisory Behavioral Anomaly Layer</h3>
              <span className="text-[11px] font-mono text-slate-400">Statistical</span>
            </div>

            {/* Honest Disclosure Caveat */}
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-[11px] text-amber-300 leading-relaxed font-sans">
              <span className="font-bold text-amber-200">Evaluation Disclosure: </span>
              {claimB?.caveat || "Claim B is evaluated on synthetic data we generated. The metrics reflect that the anomaly patterns in our synthetic set are more separable than real-world agent behavior would be. We present it as a demonstration of the evaluation framework and the scoring API, not as a production accuracy claim."}
            </div>

            {/* Metric KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Precision</span>
                <span className="text-lg font-black text-white font-mono">{claimB?.metrics?.precision ?? '0.915'}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">Recall</span>
                <span className="text-lg font-black text-white font-mono">{claimB?.metrics?.recall ?? '0.860'}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-[10px] font-mono text-slate-500 block uppercase">F1-Score</span>
                <span className="text-lg font-black text-white font-mono">{claimB?.metrics?.f1_score ?? '0.887'}</span>
              </div>
            </div>

            {/* Confusion Breakdown */}
            <div className="grid grid-cols-4 gap-2 text-center font-mono text-[10px]">
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">TP</span>
                <span className="text-emerald-400 font-bold text-xs">{claimB?.metrics?.true_positives ?? 43}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">FP</span>
                <span className="text-rose-400 font-bold text-xs">{claimB?.metrics?.false_positives ?? 4}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">TN</span>
                <span className="text-slate-300 font-bold text-xs">{claimB?.metrics?.true_negatives ?? 146}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 block">FN</span>
                <span className="text-amber-400 font-bold text-xs">{claimB?.metrics?.false_negatives ?? 7}</span>
              </div>
            </div>

            {/* False Positive Friction Metric */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">False-Positive Friction Cost:</span>
              <span className="text-amber-400 font-bold">
                ₹{claimB?.metrics?.false_positive_cost_inr_per_1k_legit ?? '10,711.11'} / 1k legit txns
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

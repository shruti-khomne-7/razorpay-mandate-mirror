// frontend/src/components/AgentTraceModal.jsx
import React from 'react';
import { X, ShieldCheck, ShieldAlert, Cpu, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export default function AgentTraceModal({ session, onClose }) {
  if (!session) return null;

  const decisionBadge = {
    'CLEAR': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'STEP-UP': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'ESCALATE': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'HARD-BLOCK': 'bg-rose-500/20 text-rose-400 border-rose-500/30'
  }[session.final_decision] || 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg text-white">Session Deep-Dive</h3>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-400">
                  {session.session_id}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Timestamp: {new Date(session.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${decisionBadge}`}>
              {session.final_decision}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          
          {/* Top Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-xs text-slate-400 block mb-1">Transaction</span>
              <div className="text-lg font-bold text-white">
                ₹{session.transaction?.amount_paise ? (session.transaction.amount_paise / 100).toFixed(2) : '0.00'}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {session.transaction?.category || 'N/A'}
                </span>
                <span>• {session.transaction?.merchant || 'Direct'}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-xs text-slate-400 block mb-1">Investigator Agent Output</span>
              <div className="text-base font-semibold text-slate-200">
                Rec: <span className="font-mono text-indigo-400">{session.agent_recommendation || 'N/A'}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {session.override_applied ? (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Deterministic Override Applied
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified without Override
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-xs text-slate-400 block mb-1">Downstream Razorpay Status</span>
              {session.transaction?.razorpay_order ? (
                <div>
                  <span className="text-xs font-mono text-emerald-400 block truncate">
                    {session.transaction.razorpay_order.order_id}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Mode: {session.transaction.razorpay_order.provider}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic mt-1">
                  No gateway call (Transaction not CLEAR)
                </div>
              )}
            </div>
          </div>

          {/* Reasoning Section */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Decision Reasoning & Forensic Narrative
            </h4>
            <p className="text-slate-300 leading-relaxed font-mono text-xs bg-slate-900/90 p-3 rounded-lg border border-slate-800/60">
              {session.reasoning}
            </p>
          </div>

          {/* Agent Tool Execution Trace */}
          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Investigator Agent Tool Execution Trace ({session.layer2_agent_trace?.length || 0} Tools Invocations)
            </h4>
            
            <div className="space-y-3">
              {session.layer2_agent_trace && session.layer2_agent_trace.length > 0 ? (
                session.layer2_agent_trace.map((t, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-xs flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <code className="text-xs font-bold text-indigo-300">
                          {t.tool}()
                        </code>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono">
                        read-only
                      </span>
                    </div>

                    <pre className="text-[11px] p-2.5 rounded-lg bg-slate-900 text-slate-300 overflow-x-auto border border-slate-800/60">
                      {JSON.stringify(t.result, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic p-4 text-center rounded-xl bg-slate-950 border border-slate-800/60">
                  {session.final_decision === 'HARD-BLOCK' 
                    ? 'Gate 1 Fast-Fail: Request blocked by deterministic rules before invoking agent.'
                    : 'No tool traces recorded.'}
                </div>
              )}
            </div>
          </div>

          {/* Cryptographic Hash Evidence */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
            <span className="font-semibold text-slate-400 block uppercase tracking-wider text-[11px]">
              Cryptographic Audit Chain Proof
            </span>
            <div className="flex flex-col gap-1 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-24">Prev Hash:</span>
                <span className="text-slate-400 truncate">{session.prev_entry_hash}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-indigo-400 w-24 font-bold">Entry Hash:</span>
                <span className="text-indigo-300 font-semibold truncate">{session.entry_hash}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
          >
            Close Trace
          </button>
        </div>

      </div>
    </div>
  );
}

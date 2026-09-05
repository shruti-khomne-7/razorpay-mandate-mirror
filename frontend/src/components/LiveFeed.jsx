// frontend/src/components/LiveFeed.jsx
import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, AlertOctagon, Eye, ArrowUpRight, CheckCircle2 } from 'lucide-react';

export default function LiveFeed({ logs, onSelectSession }) {
  const getBadge = (decision) => {
    switch (decision) {
      case 'CLEAR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> CLEAR
          </span>
        );
      case 'STEP-UP':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> STEP-UP
          </span>
        );
      case 'ESCALATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <ShieldAlert className="w-3 h-3" /> ESCALATE
          </span>
        );
      case 'HARD-BLOCK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="w-3 h-3" /> HARD-BLOCK
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {decision || 'UNKNOWN'}
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        <div>
          <h2 className="text-base font-semibold text-white">Live Pre-Authorization Feed</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Streaming real-time purchasing agent pre-auth evaluation stream
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-slate-400 font-mono">Live Sync</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 font-semibold tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-6">Timestamp / Session</th>
              <th className="py-3.5 px-6">Agent & Principal</th>
              <th className="py-3.5 px-6">Amount & Category</th>
              <th className="py-3.5 px-6">Decision</th>
              <th className="py-3.5 px-6">Reasoning Summary</th>
              <th className="py-3.5 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {logs && logs.length > 0 ? (
              logs.map((log) => (
                <tr
                  key={log.session_id}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  onClick={() => onSelectSession(log)}
                >
                  <td className="py-3.5 px-6">
                    <div className="font-mono text-xs text-slate-200">{log.session_id}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </td>

                  <td className="py-3.5 px-6">
                    <div className="font-medium text-slate-200 text-xs">
                      {log.claimed_mandate?.agent_id || 'unidentified_agent'}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {log.claimed_mandate?.principal_id || 'N/A'}
                    </div>
                  </td>

                  <td className="py-3.5 px-6">
                    <div className="font-semibold text-slate-200">
                      ₹{log.transaction?.amount_paise ? (log.transaction.amount_paise / 100).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono capitalize">
                      {log.transaction?.category || 'general'}
                    </div>
                  </td>

                  <td className="py-3.5 px-6">
                    {getBadge(log.final_decision)}
                    {log.override_applied && (
                      <span className="block text-[10px] text-rose-400 font-mono mt-0.5">
                        [verifier-override]
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-6 max-w-md truncate">
                    <p className="text-xs text-slate-400 truncate" title={log.reasoning}>
                      {log.reasoning}
                    </p>
                  </td>

                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSession(log);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Trace
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="py-12 text-center text-slate-500 text-sm">
                  No authorization events logged yet. Trigger an authorization test or live demo!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

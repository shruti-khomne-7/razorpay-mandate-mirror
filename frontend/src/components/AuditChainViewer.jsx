// frontend/src/components/AuditChainViewer.jsx
import React, { useState } from 'react';
import axios from 'axios';
import {
  Link as LinkIcon,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Hash,
  Clock,
  ArrowDown,
  Terminal,
  Bug
} from 'lucide-react';

export default function AuditChainViewer({ logs, onRefresh }) {
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [corrupting, setCorrupting] = useState(false);
  const [corruptedIndex, setCorruptedIndex] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [showDevTools, setShowDevTools] = useState(false);
  const [searchIndex, setSearchIndex] = useState('');

  // Call /api/v1/audit/verify to replay SHA-256 chain verification
  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await axios.get('/api/v1/audit/verify');
      setVerificationResult(res.data);
    } catch (err) {
      console.error('Failed to verify chain:', err);
      setVerificationResult({
        valid: false,
        reason: 'VERIFICATION_REQUEST_FAILED',
        error: err.message
      });
    } finally {
      setVerifying(false);
    }
  };

  // Demo-Only: Trigger in-memory corruption in Dev Tools
  const handleCorruptDemo = async () => {
    if (!logs || logs.length === 0) return;
    setCorrupting(true);
    try {
      const res = await axios.post('/api/v1/audit/corrupt-demo');
      setCorruptedIndex(res.data.tampered_index);
      if (onRefresh) await onRefresh();
      // Immediately verify to pinpoint the tampered record
      const verifyRes = await axios.get('/api/v1/audit/verify');
      setVerificationResult(verifyRes.data);
    } catch (err) {
      console.error('Failed to corrupt demo record:', err);
    } finally {
      setCorrupting(false);
    }
  };

  // Chronological order (latest entries at the bottom or filtered)
  const allLogs = [...(logs || [])].reverse();
  const filteredLogs = searchIndex.trim()
    ? allLogs.filter(e => String(e.index).includes(searchIndex.trim()) || e.entry_hash?.toLowerCase().includes(searchIndex.toLowerCase()))
    : allLogs.slice(0, visibleCount);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-white">
            Hash Chain Integrity
          </h2>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {verifying ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Replaying Hash Chain...
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                Verify Chain
              </>
            )}
          </button>

          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh Logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {verificationResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in duration-200 ${
            verificationResult.valid
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          {verificationResult.valid ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}

          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs">
                {verificationResult.valid
                  ? 'SHA-256 Cryptographic Chain Integrity Verified'
                  : 'TAMPERING DETECTED: Hash Chain Verification Failed'}
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-current">
                {verificationResult.valid ? 'INTEGRITY VALID' : 'COMPROMISED'}
              </span>
            </div>

            <p className="text-xs opacity-90 leading-relaxed font-sans">
              {verificationResult.valid
                ? `All ${verificationResult.count} sequential audit records successfully recomputed and validated against the cryptographic hash chain.`
                : `Tampering localized at Record Index [${verificationResult.tampered_at_index}]. Reason: ${verificationResult.reason}. Expected hash mismatch.`}
            </p>

            {verificationResult.latest_hash && (
              <div className="text-[10px] font-mono opacity-70 pt-1">
                Tip Hash: {verificationResult.latest_hash}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notice & Search Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono">
        <div>
          <span>Showing <strong className="text-white">{filteredLogs.length}</strong> of <strong className="text-white">{allLogs.length}</strong> chained records</span>
          <span className="text-slate-600 block sm:inline sm:ml-2">Genesis: 0000...0000</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search by Index # or Hash..."
            value={searchIndex}
            onChange={(e) => setSearchIndex(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full sm:w-56"
          />
          {searchIndex && (
            <button
              onClick={() => setSearchIndex('')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Sequential Hash Chain Feed */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            {searchIndex ? 'No audit records matching search filter.' : 'No audit records created yet.'}
          </div>
        ) : (
          filteredLogs.map((entry, idx) => {
            const isCorruptedTarget = corruptedIndex !== null && entry.index === corruptedIndex;

            return (
              <div key={idx} className="space-y-2">
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    isCorruptedTarget
                      ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-950/50'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2.5 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        Index #{entry.index ?? idx}
                      </span>
                      <span className="text-xs font-bold text-white font-mono">
                        {entry.event || 'AUDIT_EVENT'}
                      </span>
                      {isCorruptedTarget && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          TAMPERED RECORD
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        entry.result === 'CLEAR' || entry.result === 'OK' || entry.result === 'PASS'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : entry.result === 'HARD-BLOCK'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {entry.result || entry.final_decision || 'LOGGED'}
                      </span>
                      <span className="text-slate-500 text-[11px]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Hash Chain Links */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono mb-2">
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80 truncate">
                      <span className="text-slate-500 block">Previous Hash (parent link):</span>
                      <span className="text-slate-400 truncate">{entry.prev_entry_hash || 'GENESIS'}</span>
                    </div>

                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800/80 truncate">
                      <span className="text-indigo-400/80 block">Current Entry SHA-256 Hash:</span>
                      <span className="text-emerald-400 font-bold truncate">{entry.entry_hash || 'PENDING'}</span>
                    </div>
                  </div>

                  {/* Payload Details */}
                  {entry.details && (
                    <pre className="text-[11px] font-mono text-slate-400 bg-slate-900/40 p-2 rounded border border-slate-900 overflow-x-auto">
                      {typeof entry.details === 'object' ? JSON.stringify(entry.details, null, 2) : entry.details}
                    </pre>
                  )}
                </div>

                {/* Chain Link Indicator */}
                {idx < filteredLogs.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-500/50" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Load More */}
      {!searchIndex && allLogs.length > visibleCount && (
        <div className="text-center pt-2">
          <button
            onClick={() => setVisibleCount(c => c + 15)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            Load 15 More Entries ({allLogs.length - visibleCount} remaining)
          </button>
        </div>
      )}

    </div>
  );
}

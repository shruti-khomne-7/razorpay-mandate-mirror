// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Activity,
  CreditCard,
  Layers,
  Lock,
  Search,
  RotateCcw,
  Plus,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Database,
  Cpu,
  RefreshCw,
  Eye,
  Sliders,
  Terminal,
  ShoppingBag,
  Clock
} from 'lucide-react';

import LiveBuyerAgent from './components/LiveBuyerAgent.jsx';
import MandateIssuance from './components/MandateIssuance.jsx';
import SystemProofs from './components/SystemProofs.jsx';
import AgentTraceModal from './components/AgentTraceModal.jsx';
import AuthorizeSimulator from './components/AuthorizeSimulator.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'buyer', 'mandates', 'proofs'
  const [mandates, setMandates] = useState([]);
  const [selectedMandateIndex, setSelectedMandateIndex] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeBucket, setActiveBucket] = useState(null);
  const [filterDecision, setFilterDecision] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [showSimModal, setShowSimModal] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mongoConnected, setMongoConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());

  // Fetch real mandates and audit logs from MongoDB backend
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [mandatesRes, logsRes] = await Promise.all([
        axios.get('/api/v1/mandates'),
        axios.get('/api/v1/audit/logs')
      ]);

      const fetchedMandates = mandatesRes.data.mandates || [];
      setMandates(fetchedMandates);
      setAuditLogs(logsRes.data.logs || []);
      setMongoConnected(true);
      setLastUpdated(new Date().toLocaleTimeString());

      // Fetch snapshot of active mandate
      if (fetchedMandates.length > 0) {
        const activeM = fetchedMandates[selectedMandateIndex] || fetchedMandates[0];
        try {
          const snapRes = await axios.get(`/api/v1/mandates/${activeM.mandate_id}`);
          setActiveBucket(snapRes.data.state);
        } catch {
          // ignore if snapshot endpoint fails
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setMongoConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [selectedMandateIndex]);

  // Derived real metrics
  const activeMandate = mandates.length > 0 ? (mandates[selectedMandateIndex] || mandates[0]) : null;

  const totalCapPaise = activeMandate ? (activeMandate.cumulative_cap || 0) : 0;
  const spentPaise = activeBucket?.cumulative_spend || 0;
  const pendingPaise = activeBucket?.pending_spend || 0;
  const remainingPaise = activeMandate ? Math.max(0, totalCapPaise - spentPaise - pendingPaise) : 0;

  const totalEvents = auditLogs.length;
  const clearCount = auditLogs.filter(l => l.result === 'CLEAR' || l.final_decision === 'CLEAR').length;
  const blockedCount = auditLogs.filter(l => 
    l.result === 'HARD-BLOCK' || 
    l.result === 'PER_TXN_CAP_EXCEEDED' || 
    l.result === 'CUMULATIVE_CAP_EXCEEDED' || 
    l.result === 'REPLAY_NONCE_DETECTED' || 
    l.final_decision === 'HARD-BLOCK'
  ).length;
  const stepUpCount = auditLogs.filter(l => l.result === 'STEP_UP' || l.result === 'ESCALATE' || l.final_decision === 'STEP_UP').length;

  // Filtered decisions for the recent transactions table
  const filteredLogs = auditLogs
    .filter(l => {
      if (filterDecision === 'CLEAR') return l.result === 'CLEAR' || l.final_decision === 'CLEAR';
      if (filterDecision === 'BLOCKED') return l.result === 'HARD-BLOCK' || l.final_decision === 'HARD-BLOCK' || l.result?.includes('EXCEEDED');
      if (filterDecision === 'STEP_UP') return l.result === 'STEP_UP' || l.result === 'ESCALATE' || l.final_decision === 'STEP_UP';
      return true;
    })
    .filter(l => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        l.mandate_id?.toLowerCase().includes(q) ||
        l.session_id?.toLowerCase().includes(q) ||
        l.event?.toLowerCase().includes(q) ||
        l.result?.toLowerCase().includes(q)
      );
    })
    .slice(0, 15);

  return (
    <div className="min-h-screen bg-[#121212] text-[#e6e6e6] p-3 sm:p-5 lg:p-7 flex items-center justify-center">
      
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* MASTER APPLICATION FRAME (Ethereal Dark Luxury Rounded Container) */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[1520px] ethereal-frame p-5 lg:p-7 relative overflow-hidden flex flex-col gap-6">

        {/* 1. TOP HEADER: MINIMAL TITLE, NAVIGATION, AND REFRESH */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800/80 relative z-10">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight text-white">
              Mandate Mirror
            </span>
          </div>

          {/* Navigation Switcher */}
          <nav className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'dashboard'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('buyer')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'buyer'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Live Buyer Agent</span>
            </button>

            <button
              onClick={() => setActiveTab('mandates')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'mandates'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Issue Mandate</span>
            </button>

            <button
              onClick={() => setActiveTab('proofs')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'proofs'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>System Proofs</span>
            </button>
          </nav>

          {/* Right Controls: Only Refresh Icon */}
          <div className="flex items-center">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Data"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </header>

        {/* ────────────────────────────────────────────────────────────────────── */}
        {/* 2. BODY CONTENT: STRICTLY 4 TOP-LEVEL SECTIONS */}
        {/* ────────────────────────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">

            {/* TOP ROW: 3 HERO METRIC CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              
              {/* CARD 1: REMAINING SPEND CAPACITY */}
              <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-400">
                    Remaining Spend Capacity
                  </div>
                  {activeMandate ? (
                    <>
                      <div className="text-3xl font-bold text-white tracking-tight">
                        ₹{(remainingPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-slate-400 pt-0.5">
                        of ₹{(totalCapPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} cap
                      </div>
                    </>
                  ) : (
                    <div className="py-2">
                      <div className="text-xl font-bold text-slate-200">
                        No mandate issued yet
                      </div>
                    </div>
                  )}
                </div>

                {/* Single Primary Action Button */}
                <div className="pt-6">
                  {activeMandate ? (
                    <button
                      onClick={() => setActiveTab('buyer')}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>Authorize with Buyer Agent</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab('mandates')}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>Issue Mandate</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* CARD 2: DECISION SPLIT & VERDICT GAUGE */}
              <div className="md:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-slate-400">
                    Decision Split
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {totalEvents} total
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 py-1">
                  {/* SVG Donut Ring */}
                  {totalEvents > 0 ? (
                    <div className="relative flex items-center justify-center shrink-0">
                      <svg className="w-20 h-20" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
                        <circle
                          cx="60" cy="60" r="45" fill="none"
                          stroke="#34d399" strokeWidth="12"
                          strokeDasharray={`${Math.round((clearCount / Math.max(1, totalEvents)) * 282)} 282`}
                          strokeDashoffset="0"
                          strokeLinecap="round"
                        />
                        <circle
                          cx="60" cy="60" r="45" fill="none"
                          stroke="#f43f5e" strokeWidth="12"
                          strokeDasharray={`${Math.round((blockedCount / Math.max(1, totalEvents)) * 282)} 282`}
                          strokeDashoffset={`-${Math.round((clearCount / Math.max(1, totalEvents)) * 282)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center text-center">
                        <span className="text-base font-bold text-white">{totalEvents}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full border border-dashed border-slate-800 flex items-center justify-center shrink-0">
                      <span className="text-[11px] text-slate-500 font-mono">0</span>
                    </div>
                  )}

                  {/* Metrics Stack */}
                  <div className="flex-1 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400">Cleared</span>
                      <span className="text-emerald-400 font-bold">{clearCount}</span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400">Blocked</span>
                      <span className="text-rose-400 font-bold">{blockedCount}</span>
                    </div>
                    {stepUpCount > 0 && (
                      <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800">
                        <span className="text-slate-400">Step-Up</span>
                        <span className="text-amber-400 font-bold">{stepUpCount}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 pt-2 font-mono truncate">
                  {totalEvents > 0 ? `${Math.round((clearCount / totalEvents) * 100)}% clearance rate` : 'Awaiting evaluations'}
                </div>
              </div>

              {/* CARD 3: ACTIVE MANDATES PREVIEW */}
              <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <span>Active Mandates</span>
                    <span className="text-xs font-bold text-white">
                      ({mandates.length})
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('mandates')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                  >
                    + Issue
                  </button>
                </div>

                {/* Minimal Mandate Preview */}
                {activeMandate ? (
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-white font-medium truncate max-w-[140px]">
                        {activeMandate.mandate_id}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-400">
                        Active
                      </span>
                    </div>

                    <div className="text-xs text-slate-300">
                      Cap: ₹{(activeMandate.cumulative_cap / 100).toLocaleString('en-IN')}
                    </div>
                  </div>
                ) : (
                  <div className="h-20 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-center p-2">
                    <p className="text-xs text-slate-400">0 active mandates</p>
                  </div>
                )}

                <div className="text-[11px] text-slate-500 pt-2 font-mono truncate">
                  {activeMandate ? `Agent: ${activeMandate.agent_id}` : 'No active delegation'}
                </div>
              </div>

            </div>

            {/* BOTTOM ROW: RECENT PRE-AUTHORIZATION DECISIONS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-semibold text-white">
                  Recent Decisions
                </h3>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 text-xs">
                  {['ALL', 'CLEAR', 'BLOCKED', 'STEP_UP'].map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterDecision(type)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                        filterDecision === type
                          ? 'bg-white text-[#0c0d12]'
                          : 'bg-white/5 text-[#8e95a5] hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table or Empty State */}
              {filteredLogs.length === 0 ? (
                <div className="py-14 text-center text-[#8e95a5] space-y-3">
                  <Activity className="w-9 h-9 mx-auto opacity-30 text-[#86efac]" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">No decisions recorded yet</p>
                    <p className="text-xs text-[#8e95a5]">Dispatch the buyer agent to evaluate and record your first authorization decision in MongoDB.</p>
                  </div>
                  <div>
                    <button
                      onClick={() => setActiveTab('buyer')}
                      className="px-4 py-2 rounded-xl bg-[#86efac]/10 text-[#86efac] border border-[#86efac]/30 text-xs font-semibold hover:bg-[#86efac]/20 transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Dispatch Buyer Agent</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log, idx) => {
                    const isClear = log.result === 'CLEAR' || log.final_decision === 'CLEAR';
                    const isBlocked = log.result === 'HARD-BLOCK' || log.final_decision === 'HARD-BLOCK' || log.result?.includes('EXCEEDED') || log.result?.includes('REPLAY');

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedSession(log.session_id)}
                        className="ethereal-row p-3.5 flex items-center justify-between gap-4 text-xs cursor-pointer group"
                      >
                        {/* Event & Session Info */}
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            isClear ? 'bg-[#86efac]/10 text-[#86efac]' :
                            isBlocked ? 'bg-rose-500/10 text-rose-400' :
                            'bg-amber-400/10 text-amber-400'
                          }`}>
                            {isClear ? <CheckCircle2 className="w-4 h-4" /> :
                             isBlocked ? <XCircle className="w-4 h-4" /> :
                             <AlertTriangle className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="font-semibold text-white group-hover:text-[#86efac] transition-colors">
                              {log.event || 'PRE_AUTH_EVALUATION'}
                            </div>
                            <div className="text-[10px] font-mono text-[#8e95a5] truncate max-w-[180px]">
                              {log.session_id || log.mandate_id || 'System Event'}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider ${
                            isClear ? 'bg-[#86efac]/15 text-[#86efac] border border-[#86efac]/30' :
                            isBlocked ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                            'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                          }`}>
                            {log.result || log.final_decision || 'PROCESSED'}
                          </span>
                        </div>

                        {/* Details / Scope */}
                        <div className="hidden md:block max-w-xs text-[11px] text-[#8e95a5] truncate">
                          {typeof log.details === 'string'
                            ? log.details
                            : log.details?.reason || JSON.stringify(log.details) || 'Decision recorded'}
                        </div>

                        {/* Timestamp */}
                        <div className="text-[10px] font-mono text-[#8e95a5] whitespace-nowrap">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Just now'}
                        </div>

                        {/* Action link */}
                        <div className="flex items-center gap-1.5 text-[#86efac] text-[11px] font-semibold group-hover:translate-x-0.5 transition-transform">
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

          </div>
        )}

        {/* TAB 2: MERGED LIVE BUYER AGENT + INVESTIGATOR TRACE */}
        {activeTab === 'buyer' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#86efac]"></span>
                <h3 className="text-base font-bold text-white">Live Buyer Agent & Investigator Reasoning</h3>
              </div>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="text-xs text-[#8e95a5] hover:text-white cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            </div>
            <LiveBuyerAgent onPurchaseCompleted={fetchData} />
          </div>
        )}

        {/* TAB 3: ISSUE MANDATE */}
        {activeTab === 'mandates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#86efac]"></span>
                <h3 className="text-base font-bold text-white">Issue Natural Language Mandate</h3>
              </div>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="text-xs text-[#8e95a5] hover:text-white cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            </div>
            <MandateIssuance onMandateCreated={fetchData} />
          </div>
        )}

        {/* TAB 4: SYSTEM PROOFS (Concurrency Race, Hash Chain, Evaluation) */}
        {activeTab === 'proofs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc]"></span>
                <h3 className="text-base font-bold text-white">System Proofs & Technical Guarantees</h3>
              </div>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="text-xs text-[#8e95a5] hover:text-white cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            </div>
            <SystemProofs logs={auditLogs} onRefreshLogs={fetchData} />
          </div>
        )}

      </div>

      {/* Forensic Agent Trace Modal */}
      {selectedSession && (
        <AgentTraceModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}

    </div>
  );
}

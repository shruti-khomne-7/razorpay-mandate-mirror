// frontend/src/components/BuyerAgentPanel.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ShoppingBag,
  Bot,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  HelpCircle,
  Layers,
  Store
} from 'lucide-react';

export default function BuyerAgentPanel({ onPurchaseCompleted }) {
  const [mandates, setMandates] = useState([]);
  const [selectedMandateId, setSelectedMandateId] = useState('');
  const [goal, setGoal] = useState('Buy fresh vegetables and organic groceries for the week, around ₹450.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Fetch available mandates
  const loadMandates = async () => {
    try {
      const res = await axios.get('/api/v1/mandates');
      const list = res.data.mandates || [];
      setMandates(list);
      if (list.length > 0 && !selectedMandateId) {
        setSelectedMandateId(list[0].mandate_id);
      }
    } catch (err) {
      console.error('Failed to load mandates:', err);
    }
  };

  useEffect(() => {
    loadMandates();
  }, []);

  const goalScenarios = [
    {
      title: 'Scenario 1: Conforming Grocery Order (CLEAR)',
      badge: 'Will Clear',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      goal: 'Buy fresh vegetables and pantry milk for ₹450 from Blinkit.'
    },
    {
      title: 'Scenario 2: Out-of-Scope Electronics (HARD-BLOCK)',
      badge: 'Category Breach',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      goal: 'Buy an Anker 30W USB-C phone charger for ₹1,299 from Amazon.'
    },
    {
      title: 'Scenario 3: High-Value Luxury Hamper (CAP BREACH)',
      badge: 'Cap Exceeded',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      goal: 'Order premium artisanal truffle oil and saffron set for ₹4,800.'
    }
  ];

  const handleShop = async () => {
    if (!goal.trim() || !selectedMandateId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.post('/api/v1/buyer/shop', {
        goal,
        mandate_id: selectedMandateId
      });

      setResult(res.data);
      if (onPurchaseCompleted) {
        onPurchaseCompleted(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Buyer agent execution failed.');
    } finally {
      setLoading(false);
    }
  };

  const selectedMandate = mandates.find(m => m.mandate_id === selectedMandateId);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Autonomous Buyer Agent Sandbox
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                M3a • Consumer-Facing AI Client
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              The Buyer Agent receives a shopping goal, autonomously formulates an order, and transacts against Mandate Mirror via HTTP. When blocked, it translates the structured defense into an actionable plain-language explanation.
            </p>
          </div>
        </div>

        <button
          onClick={loadMandates}
          title="Refresh Mandates"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Configuration & Input Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Goal & Scenarios */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-300">
                Shopping Goal for the Buyer Agent
              </label>
              <span className="text-[11px] text-slate-500">
                AI Agent will decide items, pricing & checkout parameters
              </span>
            </div>
            <textarea
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Buy groceries for dinner tonight under ₹500..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 leading-relaxed font-sans"
            />
          </div>

          {/* Quick Scenario Buttons */}
          <div>
            <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
              Example Goals:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {goalScenarios.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setGoal(s.goal)}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition-all cursor-pointer flex flex-col justify-between"
                >
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border w-fit mb-1.5 ${s.badgeColor}`}>
                    {s.badge}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-200 line-clamp-2">
                    {s.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Mandate Selection & Summary */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-300 block">
              Active Delegated Mandate
            </label>

            {mandates.length === 0 ? (
              <div className="text-xs text-amber-400 bg-amber-950/20 p-3 rounded-lg border border-amber-500/20">
                No active mandates found. Please issue and confirm a mandate first under the "Issue Mandate" tab.
              </div>
            ) : (
              <select
                value={selectedMandateId}
                onChange={(e) => setSelectedMandateId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {mandates.map((m) => (
                  <option key={m.mandate_id} value={m.mandate_id}>
                    {m.mandate_id} ({m.agent_id})
                  </option>
                ))}
              </select>
            )}

            {selectedMandate && (
              <div className="space-y-1.5 text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-900">
                <div className="flex justify-between">
                  <span>Per-Txn Cap:</span>
                  <span className="text-emerald-400 font-bold">₹{(selectedMandate.spend_cap_per_txn / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cumulative Cap:</span>
                  <span className="text-emerald-400 font-bold">₹{(selectedMandate.cumulative_cap / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Scope Categories:</span>
                  <span className="text-slate-300 truncate max-w-[130px]">{selectedMandate.allowed_categories?.join(', ')}</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleShop}
            disabled={loading || !goal.trim() || !selectedMandateId}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Buyer Agent Transacting...
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                Dispatch Buyer Agent
              </>
            )}
          </button>
        </div>

      </div>

      {/* RESULT SECTION: What the agent decided + Gate Outcome + Explanation */}
      {result && (
        <div className="space-y-4 pt-4 border-t border-slate-800 animate-in fade-in duration-300">
          
          {/* Top Result Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3">
              {result.auth_outcome?.decision === 'CLEAR' ? (
                <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-rose-500/20 text-rose-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              )}
              <div>
                <span className="text-xs text-slate-400 block">Pre-Authorization Gate Decision</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-sm font-extrabold font-mono px-2.5 py-0.5 rounded ${
                    result.auth_outcome?.decision === 'CLEAR'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {result.auth_outcome?.decision || 'REJECTED'}
                  </span>
                  {result.auth_outcome?.rule_cited && (
                    <span className="text-[11px] font-mono text-slate-500">
                      [{result.auth_outcome.rule_cited}]
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Price & Merchant Tag */}
            <div className="flex items-center gap-3 text-right">
              <div>
                <span className="text-xs text-slate-400 block">Planned Amount</span>
                <span className="text-base font-bold font-mono text-white">
                  ₹{(result.purchase_plan?.amount_paise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Dual Columns: Call 1 (Autonomous Plan) vs Call 2 (Plain-Language Explanation) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Call 1: Purchase Decision */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Store className="w-4 h-4 text-cyan-400" />
                <span>Call 1: Autonomous Purchase Decision</span>
              </div>
              
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1.5 text-xs font-mono">
                <div className="text-slate-200 font-bold">{result.purchase_plan?.item_name}</div>
                <div className="flex gap-2 text-[11px]">
                  <span className="text-slate-400">Category: <span className="text-indigo-300">{result.purchase_plan?.category}</span></span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400">Merchant: <span className="text-cyan-300">{result.purchase_plan?.merchant_id}</span></span>
                </div>
                <p className="text-[11px] font-sans text-slate-400 pt-1 border-t border-slate-800">
                  {result.purchase_plan?.reasoning}
                </p>
              </div>
            </div>

            {/* Call 2: Principal Explanation */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span>Call 2: Plain-Language Explanation for Principal</span>
              </div>

              <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
                result.auth_outcome?.decision === 'CLEAR'
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
              }`}>
                {result.principal_explanation}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}

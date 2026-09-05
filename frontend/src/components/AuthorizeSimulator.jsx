// frontend/src/components/AuthorizeSimulator.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { Send, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function AuthorizeSimulator({ onAuthorized }) {
  const [mandateId, setMandateId] = useState('mandate_grocery_001');
  const [amountRupees, setAmountRupees] = useState(450);
  const [category, setCategory] = useState('grocery');
  const [merchant, setMerchant] = useState('blinkit');
  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);

  const triggerAuth = async (customOverrides = {}) => {
    setLoading(true);
    setLastResponse(null);

    const amount = customOverrides.amount !== undefined ? customOverrides.amount : amountRupees;
    const cat = customOverrides.category !== undefined ? customOverrides.category : category;
    const merch = customOverrides.merchant !== undefined ? customOverrides.merchant : merchant;

    const payload = {
      session_id: `sess_sim_${Date.now().toString().slice(-6)}`,
      mandate: {
        mandate_id: mandateId,
        principal_id: 'principal_alice',
        agent_id: 'agent_grocery_bot',
        spend_cap_per_txn: 80000,   // ₹800
        cumulative_cap: 500000,     // ₹5,000
        allowed_categories: ['grocery', 'food_delivery'],
        merchant_allowlist: ['blinkit', 'zepto', 'swiggy_instamart'],
        cumulative_window: 'P30D',
        mandate_version: 1
      },
      transaction: {
        amount_paise: Math.round(Number(amount) * 100),
        category: cat,
        merchant: merch,
        timestamp: new Date().toISOString()
      }
    };

    try {
      const res = await axios.post('/api/v1/authorize', payload);
      setLastResponse(res.data);
      if (onAuthorized) onAuthorized();
    } catch (err) {
      if (err.response?.data) {
        setLastResponse(err.response.data);
        if (onAuthorized) onAuthorized();
      } else {
        alert('Network or Server Error: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Interactive Agent Authorization Sandbox
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulate purchasing agent requests against active spend mandates in real-time.
          </p>
        </div>
      </div>

      {/* Preset Quick Scenarios */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-slate-500 py-1 font-semibold">Quick Presets:</span>
        <button
          onClick={() => triggerAuth({ amount: 350, category: 'grocery', merchant: 'blinkit' })}
          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all font-mono"
        >
          ✓ Valid Grocery (₹350)
        </button>
        <button
          onClick={() => triggerAuth({ amount: 950, category: 'grocery', merchant: 'blinkit' })}
          className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all font-mono"
        >
          ✗ Per-Txn Exceeded (₹950 &gt; ₹800)
        </button>
        <button
          onClick={() => triggerAuth({ amount: 400, category: 'electronics', merchant: 'croma' })}
          className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all font-mono"
        >
          ✗ Category Scope Drift (Electronics)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1 font-medium">Amount (INR)</label>
          <input
            type="number"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-semibold text-white outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1 font-medium">Category</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-300 outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1 font-medium">Merchant ID</label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-300 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <button
        onClick={() => triggerAuth()}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        {loading ? 'Evaluating Pre-Authorization Gate...' : 'Submit Agent Authorization Request'}
      </button>

      {lastResponse && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-400">Authorization Response:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold font-mono ${
                lastResponse.decision === 'CLEAR'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {lastResponse.decision}
            </span>
          </div>
          <p className="text-slate-300 font-mono">{lastResponse.reason || lastResponse.reasoning}</p>
        </div>
      )}
    </div>
  );
}

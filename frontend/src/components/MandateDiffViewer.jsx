// frontend/src/components/MandateDiffViewer.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { GitCompare, ArrowRight, CheckCircle2, Shield } from 'lucide-react';

export default function MandateDiffViewer() {
  const [oldMandate, setOldMandate] = useState(JSON.stringify({
    mandate_id: "mandate_grocery_001",
    mandate_version: 1,
    spend_cap_per_txn: 80000,
    cumulative_cap: 500000,
    allowed_categories: ["grocery"],
    merchant_allowlist: ["blinkit", "zepto"]
  }, null, 2));

  const [newMandate, setNewMandate] = useState(JSON.stringify({
    mandate_id: "mandate_grocery_001",
    mandate_version: 2,
    spend_cap_per_txn: 150000,
    cumulative_cap: 800000,
    allowed_categories: ["grocery", "pharmacy"],
    merchant_allowlist: ["blinkit", "zepto", "apollo_pharmacy"]
  }, null, 2));

  const [diffResult, setDiffResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculateDiff = async () => {
    setLoading(true);
    try {
      const parsedOld = JSON.parse(oldMandate);
      const parsedNew = JSON.parse(newMandate);
      const res = await axios.post('/api/v1/mandates/diff', {
        old_mandate: parsedOld,
        new_mandate: parsedNew
      });
      setDiffResult(res.data);
    } catch (err) {
      alert('Error parsing JSON or calculating diff: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <GitCompare className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">Mandate Scope & Version Diff Inspector</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Natural-language and structured change inspection when a principal amends an agent's spend mandate.
            </p>
          </div>
        </div>

        <button
          onClick={calculateDiff}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
        >
          {loading ? 'Analyzing...' : 'Calculate Plain-Text Diff'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">
            Prior Mandate Specification (v1):
          </label>
          <textarea
            rows={10}
            value={oldMandate}
            onChange={(e) => setOldMandate(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 outline-none focus:border-purple-500 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-1">
            Amended Mandate Specification (v2):
          </label>
          <textarea
            rows={10}
            value={newMandate}
            onChange={(e) => setNewMandate(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 outline-none focus:border-purple-500 transition-colors resize-none"
          />
        </div>
      </div>

      {diffResult && (
        <div className="p-5 rounded-xl bg-slate-950 border border-purple-500/30 space-y-4 animate-in fade-in">
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
            <Shield className="w-4 h-4" />
            Plain-English Authority Diff Summary:
          </div>

          <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono leading-relaxed">
            {diffResult.plain_language_summary}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              Structured Changes:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              {diffResult.changes.map((c, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                  <span className="text-slate-500 block text-[10px] uppercase">{c.field}</span>
                  <div className="text-slate-200 mt-1 flex items-center gap-2">
                    <span className="text-rose-400 line-through">
                      {typeof c.old === 'number' ? `₹${(c.old/100).toFixed(2)}` : JSON.stringify(c.old || c.removed)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-emerald-400 font-bold">
                      {typeof c.new === 'number' ? `₹${(c.new/100).toFixed(2)}` : JSON.stringify(c.new || c.added)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// frontend/src/components/MandateIssuance.jsx
import React, { useState } from 'react';
import axios from 'axios';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Edit3,
  ShieldCheck,
  FileCode,
  Check,
  RefreshCw
} from 'lucide-react';

export default function MandateIssuance({ onMandateCreated }) {
  const [step, setStep] = useState(1); // 1 = Input text, 2 = Review & Confirm, 3 = Activated
  const [naturalText, setNaturalText] = useState(
    'Let my grocery agent spend up to ₹5,000 a month, max ₹800 per order, only on groceries from BigBasket and Swiggy Instamart.'
  );
  const [principalId, setPrincipalId] = useState('principal_alice');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [confirmedResult, setConfirmedResult] = useState(null);

  const presets = [
    {
      label: 'Weekly Grocery Agent',
      text: 'Allow grocery_bot to spend ₹5,000 monthly, ceiling ₹800 per order, strictly for groceries on BigBasket, Blinkit, and Zepto.'
    },
    {
      label: 'Daily Food Delivery',
      text: 'Let food_agent order food up to ₹1,200 per day, max ₹400 per order, from Swiggy and Zomato.'
    },
    {
      label: 'Ambiguous Intent (Test Warnings)',
      text: 'Let my agent buy some books and groceries up to ₹3,000.'
    }
  ];

  // Step 1: Call LLM to Parse Intent
  const handleParse = async () => {
    if (!naturalText.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await axios.post('/api/v1/mandates/parse', {
        natural_text: naturalText,
        principal_id: principalId
      });

      setParsedData(res.data);
      setStep(2); // Advance to confirmation step
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to parse delegation intent.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Explicit Confirmation & Cryptographic Signing
  const handleConfirmAndSign = async () => {
    if (!parsedData?.structured_mandate) return;
    setLoading(true);
    setError(null);

    try {
      const res = await axios.post('/api/v1/mandates/confirm', {
        structured_mandate: parsedData.structured_mandate,
        principal_id: principalId
      });

      setConfirmedResult(res.data);
      setStep(3); // Mandate is live and signed
      if (onMandateCreated) {
        onMandateCreated(res.data.mandate);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm and activate mandate.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setParsedData(null);
    setConfirmedResult(null);
    setError(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-base font-bold text-white">
          Natural Language Mandate Issuance
        </h2>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Intent Input */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Principal Identity
            </label>
            <input
              type="text"
              value={principalId}
              onChange={(e) => setPrincipalId(e.target.value)}
              className="w-full sm:w-72 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-slate-600"
              placeholder="principal_alice"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Natural Language Delegation Intent
            </label>
            <textarea
              rows={3}
              value={naturalText}
              onChange={(e) => setNaturalText(e.target.value)}
              placeholder="e.g. Allow my agent to spend ₹3,000 per month on books, up to ₹500 per book..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-slate-600 leading-relaxed font-sans"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleParse}
              disabled={loading || !naturalText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Parse into Mandate Schema
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Structured Review & Confirmation Checkpoint */}
      {step === 2 && parsedData && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-300 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Human Confirmation Checkpoint</span>
              Review the structured boundaries parsed from your text. The mandate will only be signed and activated once you click "Confirm & Sign".
            </div>
          </div>

          {/* Warnings Banner (If any defaulted or inferred fields) */}
          {parsedData.warnings && parsedData.warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>AI Inference Warnings ({parsedData.warnings.length}):</span>
              </div>
              <ul className="space-y-1 pl-6 list-disc text-xs text-amber-200/90">
                {parsedData.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-400/80 pt-1">
                Notice: Inferred defaults are flagged so you never approve unintended permissions.
              </p>
            </div>
          )}

          {/* Field by Field Inspection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Financial Caps</div>
              
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Single Txn Ceiling:</span>
                <span className="font-mono font-bold text-emerald-400">
                  ₹{(parsedData.structured_mandate.spend_cap_per_txn / 100).toFixed(2)}
                  <span className="text-[10px] text-slate-500 ml-1">({parsedData.structured_mandate.spend_cap_per_txn} paise)</span>
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Cumulative Cap:</span>
                <span className="font-mono font-bold text-emerald-400">
                  ₹{(parsedData.structured_mandate.cumulative_cap / 100).toFixed(2)}
                  <span className="text-[10px] text-slate-500 ml-1">({parsedData.structured_mandate.cumulative_cap} paise)</span>
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-400">Period Window:</span>
                <span className="font-mono text-indigo-300">
                  {parsedData.structured_mandate.cumulative_window || 'P1M'} (Calendar Bucket)
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Delegation Identities</div>
              
              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Principal:</span>
                <span className="font-mono text-white">{parsedData.structured_mandate.principal_id}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-900">
                <span className="text-slate-400">Assigned Agent:</span>
                <span className="font-mono text-indigo-400">{parsedData.structured_mandate.agent_id}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-400">Generated ID:</span>
                <span className="font-mono text-slate-500 text-[10px]">{parsedData.structured_mandate.mandate_id}</span>
              </div>
            </div>

            {/* Allowed Categories */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Authorized Categories</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(parsedData.structured_mandate.allowed_categories || []).map((c, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 font-mono text-[11px]">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Merchant Allowlist */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Merchant Allowlist</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {parsedData.structured_mandate.merchant_allowlist && parsedData.structured_mandate.merchant_allowlist.length > 0 ? (
                  parsedData.structured_mandate.merchant_allowlist.map((m, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-[11px]">
                      {m}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-[11px] italic">Any merchant within allowed categories</span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Intent
            </button>

            <button
              onClick={handleConfirmAndSign}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Signing & Registering...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Confirm & Cryptographically Sign
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Live Mandate Activated */}
      {step === 3 && confirmedResult && (
        <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Mandate Cryptographically Signed & Live</h3>
              <p className="text-xs text-slate-400">
                The mandate has been committed to the Concurrency-Safe State Machine. The Buyer Agent can now transact against it.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Mandate ID:</span>
              <span className="text-indigo-400 font-bold">{confirmedResult.mandate.mandate_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">HMAC-SHA256 Signature:</span>
              <span className="text-emerald-400 truncate max-w-xs">{confirmedResult.mandate.signature}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Period Bucket:</span>
              <span className="text-slate-300">{confirmedResult.config.period_type}</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Issue Another Mandate
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

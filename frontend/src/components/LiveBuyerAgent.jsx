// frontend/src/components/LiveBuyerAgent.jsx
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
  Cpu,
  Layers,
  Store,
  Terminal,
  Play,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Eye,
  Activity
} from 'lucide-react';

export default function LiveBuyerAgent({ onPurchaseCompleted }) {
  const [mandates, setMandates] = useState([]);
  const [selectedMandateId, setSelectedMandateId] = useState('');
  const [goal, setGoal] = useState('Buy fresh vegetables and organic groceries for the week, around ₹450.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Live SSE stream state for Investigator reasoning
  const [events, setEvents] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamFinal, setStreamFinal] = useState(null);
  const [showDevTools, setShowDevTools] = useState(false);

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

  // Dispatch live Buyer Agent shopping request and stream investigator events
  const handleDispatchAgent = async () => {
    if (!goal.trim() || !selectedMandateId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEvents([]);
    setStreamFinal(null);
    setIsStreaming(true);

    try {
      // Step 1: Call live Buyer Agent route
      const res = await axios.post('/api/v1/buyer/shop', {
        goal,
        mandate_id: selectedMandateId
      });

      setResult(res.data);
      const authOutcome = res.data.auth_outcome;

      // Map real backend decision and trace into live investigator stream view
      const traceEvents = [];

      traceEvents.push({
        type: 'start',
        data: {
          session_id: authOutcome?.session_id || res.data.transaction?.nonce,
          timestamp: new Date().toISOString(),
          goal: goal,
          plan: res.data.purchase_plan
        }
      });

      traceEvents.push({
        type: 'step',
        data: {
          step: 1,
          name: 'Deterministic Bounds Verification',
          status: authOutcome?.decision === 'CLEAR' ? 'PASS' : 'FLAGGED',
          details: `Item: "${res.data.purchase_plan?.item_name}", Amount: ₹${((res.data.purchase_plan?.amount_paise || 0) / 100).toFixed(2)}, Category: ${res.data.purchase_plan?.category}`
        }
      });

      traceEvents.push({
        type: 'step',
        data: {
          step: 2,
          name: 'AI Investigator Forensic Analysis',
          status: 'COMPLETED',
          recommendation: authOutcome?.agent_recommendation || authOutcome?.decision,
          anomaly_score: authOutcome?.anomaly_score ?? 0.02,
          reasoning: authOutcome?.reasoning || res.data.principal_explanation
        }
      });

      if (authOutcome?.razorpay_order) {
        traceEvents.push({
          type: 'step',
          data: {
            step: 3,
            name: 'Downstream Payment Execution',
            status: authOutcome.razorpay_order.payment_status === 'captured' ? 'PAID & CAPTURED' : 'ORDER_CREATED',
            details: `Razorpay Order: ${authOutcome.razorpay_order.order_id}, Payment: ${authOutcome.razorpay_order.payment_id || 'N/A'}`
          }
        });
      }

      traceEvents.push({
        type: 'final',
        data: {
          decision: authOutcome?.decision || 'CLEAR',
          reasoning: res.data.principal_explanation,
          audit_hash: authOutcome?.audit_entry_hash
        }
      });

      setEvents(traceEvents);
      setStreamFinal(authOutcome);

      if (onPurchaseCompleted) {
        onPurchaseCompleted(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Buyer agent execution failed.');
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  // Dev Tools SSE simulation call (moves simulate buttons into collapsed drawer)
  const runDirectSseStream = async (scenarioType) => {
    setIsStreaming(true);
    setEvents([]);
    setStreamFinal(null);

    const isNearCap = scenarioType === 'override';
    const amountPaise = isNearCap ? 95000 : 35000;
    const category = isNearCap ? 'luxury_dining' : 'grocery';

    const testMandate = {
      mandate_id: `mandate_stream_${Date.now()}`,
      principal_id: 'principal_alice',
      agent_id: 'autonomous_buyer_bot',
      spend_cap_per_txn: 100000,
      cumulative_cap: 100000,
      allowed_categories: ['grocery'],
      merchant_allowlist: ['blinkit', 'zepto'],
      signature: 'simulated_valid_test_sig',
      mandate_version: 1
    };

    const testTxn = {
      amount_paise: amountPaise,
      category,
      merchant: 'blinkit',
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch('/api/v1/authorize?stream=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          mandate: testMandate,
          transaction: testTxn,
          session_id: `live_trace_${Date.now()}`
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventPayload = JSON.parse(line.substring(6));
              setEvents((prev) => [...prev, eventPayload]);
              if (eventPayload.type === 'final') {
                setStreamFinal(eventPayload.data);
              }
            } catch {
              // ignore parse warning
            }
          }
        }
      }
    } catch (err) {
      setEvents((prev) => [...prev, { type: 'error', data: { message: err.message } }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const selectedMandate = mandates.find(m => m.mandate_id === selectedMandateId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT PANEL: Buyer Agent Interface */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white">
                Autonomous Buyer Agent
              </h2>

              <button
                onClick={loadMandates}
                title="Refresh Mandates"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {error && (
              <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Shopping Goal Textarea */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Shopping Goal
              </label>
              <textarea
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Buy groceries for dinner tonight under ₹500..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-slate-600 leading-relaxed font-sans"
              />
            </div>

            {/* Active Delegated Mandate Selector */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <label className="text-xs font-medium text-slate-300 block">
                Active Delegated Mandate
              </label>
              {mandates.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-center space-y-1">
                  <p className="text-xs text-amber-400 font-semibold">No active mandates found</p>
                  <p className="text-[11px] text-slate-400">Issue a mandate before dispatching the buyer agent.</p>
                </div>
              ) : (
                <>
                  <select
                    value={selectedMandateId}
                    onChange={(e) => setSelectedMandateId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-slate-600 font-mono"
                  >
                    {mandates.map((m) => (
                      <option key={m.mandate_id} value={m.mandate_id}>
                        {m.mandate_id} (₹{(m.cumulative_cap / 100).toLocaleString('en-IN')} Cap)
                      </option>
                    ))}
                  </select>

                  {selectedMandate && (
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block text-[9px]">MAX PER TXN</span>
                        <span className="text-white font-bold">₹{(selectedMandate.spend_cap_per_txn / 100).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-500 block text-[9px]">CATEGORIES</span>
                        <span className="text-white font-bold truncate block">{selectedMandate.allowed_categories?.join(', ') || 'Any'}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleDispatchAgent}
            disabled={loading || !selectedMandateId}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Dispatching Agent...
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                Dispatch Buyer Agent
              </>
            )}
          </button>
        </div>

        {/* RIGHT PANEL: Live Investigator Reasoning Trace */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white">
                Live Investigator Reasoning Trace
              </h2>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Events: <strong className="text-white">{events.length}</strong></span>
                {streamFinal && (
                  <span className={`px-2 py-0.5 rounded font-bold ${
                    streamFinal.decision === 'CLEAR' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                  }`}>
                    {streamFinal.decision}
                  </span>
                )}
              </div>
            </div>

            {/* Streaming Events Feed */}
            <div className="space-y-2.5 min-h-[260px] max-h-[380px] overflow-y-auto pr-1">
              {events.length === 0 && !loading && !isStreaming ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-800 rounded-lg">
                  <p className="text-xs text-slate-500">No active execution trace</p>
                </div>
              ) : (
                events.map((evt, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono text-[11px]">
                        {evt.type === 'start' ? 'Session Initiated' :
                         evt.type === 'step' ? evt.data.name :
                         evt.type === 'final' ? 'Verdict' : 'Trace Event'}
                      </span>
                      {evt.data?.status && (
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                          evt.data.status === 'PASS' || evt.data.status === 'PAID & CAPTURED' || evt.data.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {evt.data.status}
                        </span>
                      )}
                    </div>

                    {evt.data?.details && (
                      <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                        {evt.data.details}
                      </p>
                    )}

                    {evt.data?.reasoning && (
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans bg-slate-900/60 p-2 rounded border border-slate-800">
                        {evt.data.reasoning}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Result Card: Bottom Summary when Agent finishes */}
      {result && (
        <div className={`p-5 rounded-2xl border ${
          result.auth_outcome?.decision === 'CLEAR'
            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
        } space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs tracking-wide uppercase">
              Agent Result: {result.auth_outcome?.decision}
            </span>
            {result.auth_outcome?.razorpay_order?.payment_id && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Payment Captured: {result.auth_outcome.razorpay_order.payment_id}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-200 font-sans">
            {result.principal_explanation}
          </p>
        </div>
      )}
    </div>
  );
}

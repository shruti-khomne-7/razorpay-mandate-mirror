// frontend/src/components/LiveReasoningTrace.jsx
import React, { useState } from 'react';
import {
  Activity,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Cpu,
  Eye,
  Sliders,
  Play
} from 'lucide-react';

export default function LiveReasoningTrace({ onStreamCompleted }) {
  const [events, setEvents] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeScenario, setActiveScenario] = useState('clear');
  const [finalResult, setFinalResult] = useState(null);

  // Trigger live SSE stream directly from frontend via fetch + ReadableStream
  const runLiveStream = async (scenarioType) => {
    setActiveScenario(scenarioType);
    setEvents([]);
    setFinalResult(null);
    setIsStreaming(true);

    const isNearCap = scenarioType === 'override';
    const amountPaise = isNearCap ? 95000 : 35000; // ₹950 vs ₹350
    const category = isNearCap ? 'luxury_dining' : 'grocery';

    const testMandate = {
      mandate_id: `mandate_stream_${Date.now()}`,
      principal_id: 'principal_alice',
      agent_id: 'autonomous_buyer_bot',
      spend_cap_per_txn: 100000,
      cumulative_cap: 100000, // ₹1,000 cap
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
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventPayload = JSON.parse(line.substring(6));
              setEvents((prev) => [...prev, eventPayload]);

              if (eventPayload.type === 'final') {
                setFinalResult(eventPayload.data);
                if (onStreamCompleted) {
                  onStreamCompleted(eventPayload.data);
                }
              }
            } catch (err) {
              console.warn('SSE Parse warning:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('SSE Stream Error:', err);
      setEvents((prev) => [
        ...prev,
        { type: 'error', data: { message: err.message } }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const getToolBadgeColor = (toolName) => {
    switch (toolName) {
      case 'get_state_snapshot':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'check_category_conformance':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'get_agent_session_history':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'compute_anomaly_score':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'recommend_outcome':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Investigator Agent Live Reasoning Trace
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Hero UI • Real-Time SSE Stream
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Watch the AI investigator dynamically invoke read-only inspection tools, evaluate state counters, formulate non-binding recommendations, and undergo Gate 3 guard re-checking.
            </p>
          </div>
        </div>

        {/* Live Stream Triggers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => runLiveStream('clear')}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            Simulate Conforming (CLEAR)
          </button>

          <button
            onClick={() => runLiveStream('override')}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/40 border border-amber-500/30 text-amber-200 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Simulate Guard Override (ESCALATE)
          </button>
        </div>
      </div>

      {/* Streaming Status Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-slate-400">Stream Connection:</span>
          <span className={isStreaming ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
            {isStreaming ? 'ACTIVE (Server-Sent Events)' : 'IDLE'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-400">Events Streamed:</span>
          <span className="text-white font-bold">{events.length}</span>
        </div>
      </div>

      {/* Hero Stream Trace Container */}
      <div className="space-y-3 min-h-[300px]">
        {events.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-800 rounded-xl space-y-2">
            <Activity className="w-8 h-8 text-slate-600 animate-bounce" />
            <span className="text-xs text-slate-400 font-medium">
              No live investigation active. Click a scenario button above or execute a purchase from the Buyer Agent.
            </span>
            <span className="text-[11px] text-slate-600 font-mono">
              Events will stream live as each tool call resolves in the LLM loop.
            </span>
          </div>
        )}

        {/* Step-by-Step Stream Feed */}
        {events.map((ev, idx) => {
          if (ev.type === 'tool_call') {
            return (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
              >
                <div className="p-1.5 rounded-lg bg-slate-800 text-indigo-400 mt-0.5">
                  <Terminal className="w-4 h-4" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">Step {idx + 1}: Tool Call</span>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${getToolBadgeColor(ev.data.tool_name)}`}>
                      {ev.data.tool_name}()
                    </span>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80 overflow-x-auto">
                    {JSON.stringify(ev.data.input, null, 2)}
                  </pre>
                </div>
              </div>
            );
          }

          if (ev.type === 'tool_result') {
            return (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 pl-11 flex items-start gap-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1 flex-1 text-xs">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                    Tool Result & Evidence
                  </span>
                  <pre className="text-[11px] font-mono text-emerald-300/90 bg-emerald-950/20 p-2 rounded border border-emerald-500/20 overflow-x-auto">
                    {JSON.stringify(ev.data.output, null, 2)}
                  </pre>
                </div>
              </div>
            );
          }

          if (ev.type === 'recommendation') {
            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/40 space-y-2 animate-in zoom-in-95 duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white">Investigator Agent Recommendation</span>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded ${
                    ev.data.outcome === 'CLEAR'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {ev.data.outcome}
                  </span>
                </div>
                <p className="text-xs text-indigo-200 leading-relaxed font-sans pl-6">
                  {ev.data.reasoning}
                </p>
              </div>
            );
          }

          if (ev.type === 'override') {
            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2 animate-in zoom-in-95 duration-200"
              >
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Deterministic Gate 3 Safety Override Applied!</span>
                </div>
                <div className="text-xs text-amber-200/90 pl-6 space-y-1">
                  <div>
                    Agent recommended <span className="font-mono font-bold text-emerald-400">{ev.data.original}</span>, but Gate 3 forced override to <span className="font-mono font-bold text-amber-400">{ev.data.overridden_to}</span>.
                  </div>
                  <p className="text-[11px] font-mono text-amber-300/80 bg-amber-950/50 p-2 rounded border border-amber-500/30">
                    {ev.data.reason}
                  </p>
                </div>
              </div>
            );
          }

          if (ev.type === 'final') {
            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Final Authorized Outcome</span>
                    <span className={`text-sm font-black font-mono px-2 py-0.5 rounded ${
                      ev.data.decision === 'CLEAR'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {ev.data.decision}
                    </span>
                  </div>
                </div>

                {ev.data.razorpay_order && (
                  <div className="text-right font-mono text-xs">
                    <span className="text-slate-400 block text-[10px]">Razorpay Test Order:</span>
                    <span className="text-indigo-400 font-bold">{ev.data.razorpay_order.order_id}</span>
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>

    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

type Persona = "claude" | "claw";

interface Proposal {
  kind: "swap" | "lend_deposit" | "lend_withdraw" | "no_action";
  asset?: string;
  inputSym?: string;
  outputSym?: string;
  amountUi?: number;
  rationale: string;
  confidence: number;
}

interface PersonaResult {
  persona: Persona;
  label: string;
  emoji: string;
  proposal: Proposal;
  stats: { toolCount: number; inputTokens: number; outputTokens: number };
}

interface StreamEvent {
  type:
    | "start"
    | "text"
    | "tool_call"
    | "tool_result"
    | "proposal"
    | "done"
    | "error";
  persona?: Persona;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  preview?: string;
  message?: string;
  label?: string;
  emoji?: string;
  proposal?: Proposal;
  stats?: { toolCount: number; inputTokens: number; outputTokens: number };
}

interface ExecuteResult {
  ok?: boolean;
  signature?: string;
  kind?: string;
  asset?: string;
  amountUi?: number;
  error?: string;
}

export default function Home() {
  const [question, setQuestion] = useState(
    "今のwallet状況をふまえて、yieldを最大化する次の1手を提案して",
  );
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<Record<Persona, string[]>>({
    claude: [],
    claw: [],
  });
  const [results, setResults] = useState<Record<Persona, PersonaResult | null>>({
    claude: null,
    claw: null,
  });
  const [winner, setWinner] = useState<Persona | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);
  const claudeColRef = useRef<HTMLDivElement | null>(null);
  const clawColRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    claudeColRef.current?.scrollTo({
      top: claudeColRef.current.scrollHeight,
    });
    clawColRef.current?.scrollTo({ top: clawColRef.current.scrollHeight });
  }, [logs]);

  function append(persona: Persona, line: string) {
    setLogs((prev) => ({ ...prev, [persona]: [...prev[persona], line] }));
  }

  function startDebate() {
    if (running) return;
    setRunning(true);
    setLogs({ claude: [], claw: [] });
    setResults({ claude: null, claw: null });
    setWinner(null);
    setExecResult(null);

    const es = new EventSource(
      `/api/debate?q=${encodeURIComponent(question)}`,
    );

    es.onmessage = (ev) => {
      try {
        const event: StreamEvent = JSON.parse(ev.data);
        if (event.type === "text" && event.persona && event.text) {
          append(event.persona, `💬 ${event.text}`);
        } else if (event.type === "tool_call" && event.persona && event.name) {
          append(
            event.persona,
            `→ ${event.name}(${JSON.stringify(event.input ?? {})})`,
          );
        } else if (
          event.type === "tool_result" &&
          event.persona &&
          event.name
        ) {
          append(
            event.persona,
            `   ↳ ${event.name}: ${(event.preview ?? "").slice(0, 240)}`,
          );
        } else if (
          event.type === "proposal" &&
          event.persona &&
          event.proposal
        ) {
          const p = event.persona;
          setResults((prev) => ({
            ...prev,
            [p]: {
              persona: p,
              label: event.label ?? "",
              emoji: event.emoji ?? "",
              proposal: event.proposal!,
              stats:
                event.stats ?? { toolCount: 0, inputTokens: 0, outputTokens: 0 },
            },
          }));
          append(
            p,
            `🎯 PROPOSAL READY (confidence ${event.proposal.confidence}%)`,
          );
        } else if (event.type === "done") {
          setRunning(false);
          es.close();
        } else if (event.type === "error") {
          append("claude", `❌ ${event.message}`);
          append("claw", `❌ ${event.message}`);
          setRunning(false);
          es.close();
        }
      } catch (e) {
        console.error("parse error", e, ev.data);
      }
    };
    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }

  async function vote(p: Persona) {
    const r = results[p];
    if (!r || executing) return;
    setWinner(p);
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: r.proposal }),
      });
      const json = (await res.json()) as ExecuteResult;
      setExecResult(json);
    } catch (e) {
      setExecResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setExecuting(false);
    }
  }

  function describePlan(p: Proposal): string {
    if (p.kind === "no_action") return "🛑 No action";
    if (p.kind === "swap")
      return `🔁 swap ${p.amountUi} ${p.inputSym} → ${p.outputSym}`;
    if (p.kind === "lend_deposit")
      return `📥 deposit ${p.amountUi} ${p.asset} to lend`;
    return `📤 withdraw ${p.amountUi} ${p.asset} from lend`;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-blue-400">🤖 CLAUDE</span>
            <span className="text-slate-500 mx-3">vs</span>
            <span className="text-red-400">CLAW 🦞</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Yield Council on Jupiter (Solana mainnet) — natural language → onchain
          </p>
        </header>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={running}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={startDebate}
            disabled={running || !question.trim()}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition"
          >
            {running ? "⏳ Debating..." : "▶ START DEBATE"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Claude column */}
          <div
            className={`bg-slate-900 border-2 border-blue-700 rounded-xl p-4 flex flex-col ${
              winner === "claude" ? "ring-4 ring-yellow-400" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-blue-400">🤖 CLAUDE</h2>
              {results.claude && (
                <div className="text-xs text-slate-400">
                  tools: {results.claude.stats.toolCount} | tokens:{" "}
                  {results.claude.stats.inputTokens}+
                  {results.claude.stats.outputTokens}
                </div>
              )}
            </div>
            <div
              ref={claudeColRef}
              className="bg-slate-950 rounded-lg p-3 h-64 overflow-y-auto text-xs font-mono whitespace-pre-wrap"
            >
              {logs.claude.length === 0 ? (
                <span className="text-slate-600">(waiting…)</span>
              ) : (
                logs.claude.map((l, i) => (
                  <div key={i} className="mb-1 leading-relaxed">
                    {l}
                  </div>
                ))
              )}
            </div>
            {results.claude && (
              <div className="mt-3 bg-blue-950/50 border border-blue-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-400">
                    Proposal
                  </span>
                  <span className="text-xs font-bold text-blue-300">
                    confidence {results.claude.proposal.confidence}%
                  </span>
                </div>
                <div className="text-sm font-bold mb-1">
                  {describePlan(results.claude.proposal)}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {results.claude.proposal.rationale}
                </p>
                <button
                  onClick={() => vote("claude")}
                  disabled={executing || winner !== null}
                  className="mt-3 w-full py-2 rounded-md text-sm font-bold transition bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                >
                  {winner === "claude"
                    ? executing
                      ? "⏳ Executing..."
                      : "👑 WINNER"
                    : "VOTE 🤖"}
                </button>
              </div>
            )}
          </div>

          {/* Claw column */}
          <div
            className={`bg-slate-900 border-2 border-red-700 rounded-xl p-4 flex flex-col ${
              winner === "claw" ? "ring-4 ring-yellow-400" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-red-400">CLAW 🦞</h2>
              {results.claw && (
                <div className="text-xs text-slate-400">
                  tools: {results.claw.stats.toolCount} | tokens:{" "}
                  {results.claw.stats.inputTokens}+
                  {results.claw.stats.outputTokens}
                </div>
              )}
            </div>
            <div
              ref={clawColRef}
              className="bg-slate-950 rounded-lg p-3 h-64 overflow-y-auto text-xs font-mono whitespace-pre-wrap"
            >
              {logs.claw.length === 0 ? (
                <span className="text-slate-600">(waiting…)</span>
              ) : (
                logs.claw.map((l, i) => (
                  <div key={i} className="mb-1 leading-relaxed">
                    {l}
                  </div>
                ))
              )}
            </div>
            {results.claw && (
              <div className="mt-3 bg-red-950/50 border border-red-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-400">
                    Proposal
                  </span>
                  <span className="text-xs font-bold text-red-300">
                    confidence {results.claw.proposal.confidence}%
                  </span>
                </div>
                <div className="text-sm font-bold mb-1">
                  {describePlan(results.claw.proposal)}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {results.claw.proposal.rationale}
                </p>
                <button
                  onClick={() => vote("claw")}
                  disabled={executing || winner !== null}
                  className="mt-3 w-full py-2 rounded-md text-sm font-bold transition bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                >
                  {winner === "claw"
                    ? executing
                      ? "⏳ Executing..."
                      : "👑 WINNER"
                    : "VOTE 🦞"}
                </button>
              </div>
            )}
          </div>
        </div>

        {execResult && (
          <div className="mt-4 bg-slate-900 border-2 border-yellow-600 rounded-xl p-4">
            <h3 className="text-xl font-bold text-yellow-400 mb-2">
              🚀 Execution Result
            </h3>
            {execResult.signature ? (
              <div>
                <p className="text-sm mb-1">
                  ✅ {execResult.kind} {execResult.asset ?? ""}{" "}
                  {execResult.amountUi ?? ""}
                </p>
                <a
                  href={`https://solscan.io/tx/${execResult.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono text-blue-400 hover:underline break-all"
                >
                  {execResult.signature}
                </a>
              </div>
            ) : execResult.error ? (
              <p className="text-sm text-red-400">❌ {execResult.error}</p>
            ) : (
              <p className="text-sm text-slate-300">
                {JSON.stringify(execResult)}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

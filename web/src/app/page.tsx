"use client";

import { useEffect, useRef, useState } from "react";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";

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

interface ExecResult {
  signature?: string;
  kind?: string;
  asset?: string;
  amountUi?: number;
  error?: string;
}

// browser-safe base64 helpers (avoids Node Buffer which may not be polyfilled)
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();

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
  const [execResult, setExecResult] = useState<ExecResult | null>(null);
  const claudeColRef = useRef<HTMLDivElement | null>(null);
  const clawColRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    claudeColRef.current?.scrollTo({ top: claudeColRef.current.scrollHeight });
    clawColRef.current?.scrollTo({ top: clawColRef.current.scrollHeight });
  }, [logs]);

  function append(persona: Persona, line: string) {
    setLogs((prev) => ({ ...prev, [persona]: [...prev[persona], line] }));
  }

  function startDebate() {
    if (running) return;
    if (!connected || !publicKey) {
      alert("Wallet を接続してください (右上の Connect Wallet)");
      return;
    }
    setRunning(true);
    setLogs({ claude: [], claw: [] });
    setResults({ claude: null, claw: null });
    setWinner(null);
    setExecResult(null);

    const es = new EventSource(
      `/api/debate?q=${encodeURIComponent(question)}&wallet=${publicKey.toBase58()}`,
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
    if (executing || winner !== null) return;
    if (!connected || !publicKey || !signTransaction) {
      alert("Wallet を接続してください (右上の Connect Wallet)");
      return;
    }
    const r = results[p];
    if (!r) return;
    setWinner(p);
    setExecuting(true);
    setExecResult(null);
    try {
      // 1. Build unsigned tx server-side (bound to user's pubkey)
      const buildRes = await fetch("/api/build-tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: r.proposal,
          walletPubkey: publicKey.toBase58(),
        }),
      });
      const built = await buildRes.json();
      if (!buildRes.ok || built.error) {
        setExecResult({ error: built.error ?? `build HTTP ${buildRes.status}` });
        return;
      }
      if (built.kind === "no_action") {
        setExecResult({ kind: "no_action" });
        return;
      }

      // 2. Deserialize, sign with wallet adapter
      const tx = VersionedTransaction.deserialize(b64ToBytes(built.txBase64));
      const signed = await signTransaction(tx);

      // 3. Submit
      let signature: string | undefined;
      if (built.kind === "swap") {
        // proxy to Jupiter /swap/v2/execute (needs x-api-key)
        const signedB64 = bytesToB64(signed.serialize());
        const submitRes = await fetch("/api/submit-swap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            signedTxBase64: signedB64,
            requestId: built.requestId,
          }),
        });
        const submitJson = await submitRes.json();
        if (!submitRes.ok || !submitJson.signature) {
          setExecResult({
            error:
              submitJson.error ??
              `submit HTTP ${submitRes.status}: ${JSON.stringify(submitJson)}`,
          });
          return;
        }
        signature = submitJson.signature as string;
      } else {
        // lend_deposit / lend_withdraw — direct send to RPC
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        await connection.confirmTransaction(
          {
            signature,
            blockhash: built.latestBlockhash.blockhash,
            lastValidBlockHeight: built.latestBlockhash.lastValidBlockHeight,
          },
          "confirmed",
        );
      }

      setExecResult({
        signature,
        kind: built.kind,
        asset: built.meta?.asset ?? built.quote?.outputSym,
        amountUi: built.meta?.amountUi ?? built.quote?.inAmountUi,
      });
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
        <header className="mb-6 flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              <span className="text-blue-400">🤖 CLAUDE</span>
              <span className="text-slate-500 mx-3">vs</span>
              <span className="text-red-400">CLAW 🦞</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Yield Council on Jupiter (Solana mainnet) — natural language → onchain
            </p>
          </div>
          <WalletMultiButton />
        </header>

        {connected && publicKey && (
          <div className="mb-3 text-xs text-slate-400">
            connected:{" "}
            <span className="font-mono text-slate-300">
              {publicKey.toBase58()}
            </span>
          </div>
        )}

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
            disabled={running || !question.trim() || !connected}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition"
            title={!connected ? "Connect wallet first" : ""}
          >
            {running
              ? "⏳ Debating..."
              : !connected
                ? "🔗 Connect Wallet first"
                : "▶ START DEBATE"}
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
                  disabled={executing || winner !== null || !connected}
                  className="mt-3 w-full py-2 rounded-md text-sm font-bold transition bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                >
                  {winner === "claude"
                    ? executing
                      ? "⏳ Executing..."
                      : "👑 WINNER"
                    : !connected
                      ? "🔗 Connect Wallet to vote"
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
                  disabled={executing || winner !== null || !connected}
                  className="mt-3 w-full py-2 rounded-md text-sm font-bold transition bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed"
                >
                  {winner === "claw"
                    ? executing
                      ? "⏳ Executing..."
                      : "👑 WINNER"
                    : !connected
                      ? "🔗 Connect Wallet to vote"
                      : "VOTE 🦞"}
                </button>
              </div>
            )}
          </div>
        </div>

        {execResult && (
          <div
            className={`mt-4 bg-slate-900 border-2 rounded-xl p-4 ${
              execResult.signature
                ? "border-yellow-600"
                : "border-red-600"
            }`}
          >
            <h3
              className={`text-xl font-bold mb-2 ${
                execResult.signature ? "text-yellow-400" : "text-red-400"
              }`}
            >
              {execResult.signature ? "🚀 Execution Result" : "❌ Error"}
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
            ) : (
              <p className="text-sm text-red-400">{execResult.error}</p>
            )}
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-slate-600">
          built for Clawathon Tokyo Edition · Jupiter ⨉ OpenClaw ·{" "}
          <a
            href="https://github.com/jup-ag/agent-skills"
            className="hover:text-slate-400"
            target="_blank"
            rel="noreferrer"
          >
            agent-skills
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/Masashi-Ono0611/claw-vs-claude"
            className="hover:text-slate-400"
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>
        </footer>
      </div>
    </main>
  );
}

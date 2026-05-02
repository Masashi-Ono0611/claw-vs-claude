"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";

// SSR を切って WalletMultiButton の hydration mismatch を回避
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton,
    ),
  { ssr: false },
);

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
    "What's the next gentle move to grow Mike's baby fund?",
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
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-violet-100 text-stone-800 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">
              👶 Jupiter Funds For Mike&apos;s Baby 🎁
            </h1>
            <p className="mt-2 inline-flex items-center gap-2 text-rose-700">
              <span aria-hidden className="h-px w-5 bg-rose-300" />
              <span className="italic text-sm">
                A pre-baby gift for Mike, powered by Solana yield
              </span>
              <span aria-hidden className="h-px w-5 bg-rose-300" />
            </p>
          </div>
          <WalletMultiButton />
        </header>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={running}
            className="flex-1 bg-white border border-stone-300 rounded-lg px-4 py-3 text-sm text-stone-800 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          <button
            onClick={startDebate}
            disabled={running || !question.trim() || !connected}
            className="px-6 py-3 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white disabled:from-stone-300 disabled:to-stone-300 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition shadow-md"
            title={!connected ? "Connect wallet first" : ""}
          >
            {running
              ? "⏳ Debating..."
              : !connected
                ? "🔗 Connect Wallet first"
                : "💝 ASK THE COUNCIL"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Claude column — sage / mint */}
          <div
            className={`bg-white/80 backdrop-blur border-2 border-emerald-200 rounded-2xl p-4 flex flex-col shadow-sm ${
              winner === "claude" ? "ring-4 ring-amber-300" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-emerald-700">
                🤖 Claude
              </h2>
              {results.claude && (
                <div className="text-xs text-stone-500">
                  tools: {results.claude.stats.toolCount} · tokens:{" "}
                  {results.claude.stats.inputTokens}+
                  {results.claude.stats.outputTokens}
                </div>
              )}
            </div>
            <div
              ref={claudeColRef}
              className="bg-emerald-50/60 rounded-lg p-3 h-64 overflow-y-auto text-xs font-mono whitespace-pre-wrap text-stone-700"
            >
              {logs.claude.length === 0 ? (
                <span className="text-stone-400">(waiting…)</span>
              ) : (
                logs.claude.map((l, i) => (
                  <div key={i} className="mb-1 leading-relaxed">
                    {l}
                  </div>
                ))
              )}
            </div>
            {results.claude && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-stone-500">
                    Claude&apos;s gift idea
                  </span>
                  <span className="text-xs font-bold text-emerald-700">
                    confidence {results.claude.proposal.confidence}%
                  </span>
                </div>
                <div className="text-sm font-bold mb-1 text-stone-800">
                  {describePlan(results.claude.proposal)}
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {results.claude.proposal.rationale}
                </p>
                <button
                  onClick={() => vote("claude")}
                  disabled={executing || winner !== null || !connected}
                  className="mt-3 w-full py-2 rounded-lg text-sm font-bold transition bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-stone-300 disabled:cursor-not-allowed shadow-sm"
                >
                  {winner === "claude"
                    ? executing
                      ? "⏳ Sending gift..."
                      : "👑 Chosen by you"
                    : !connected
                      ? "🔗 Connect Wallet to vote"
                      : "💝 Sponsor with Claude"}
                </button>
              </div>
            )}
          </div>

          {/* Claw column — coral / warm */}
          <div
            className={`bg-white/80 backdrop-blur border-2 border-rose-200 rounded-2xl p-4 flex flex-col shadow-sm ${
              winner === "claw" ? "ring-4 ring-amber-300" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-rose-600">Claw 🦞</h2>
              {results.claw && (
                <div className="text-xs text-stone-500">
                  tools: {results.claw.stats.toolCount} · tokens:{" "}
                  {results.claw.stats.inputTokens}+
                  {results.claw.stats.outputTokens}
                </div>
              )}
            </div>
            <div
              ref={clawColRef}
              className="bg-rose-50/60 rounded-lg p-3 h-64 overflow-y-auto text-xs font-mono whitespace-pre-wrap text-stone-700"
            >
              {logs.claw.length === 0 ? (
                <span className="text-stone-400">(waiting…)</span>
              ) : (
                logs.claw.map((l, i) => (
                  <div key={i} className="mb-1 leading-relaxed">
                    {l}
                  </div>
                ))
              )}
            </div>
            {results.claw && (
              <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wider text-stone-500">
                    Claw&apos;s gift idea
                  </span>
                  <span className="text-xs font-bold text-rose-700">
                    confidence {results.claw.proposal.confidence}%
                  </span>
                </div>
                <div className="text-sm font-bold mb-1 text-stone-800">
                  {describePlan(results.claw.proposal)}
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {results.claw.proposal.rationale}
                </p>
                <button
                  onClick={() => vote("claw")}
                  disabled={executing || winner !== null || !connected}
                  className="mt-3 w-full py-2 rounded-lg text-sm font-bold transition bg-rose-600 hover:bg-rose-500 text-white disabled:bg-stone-300 disabled:cursor-not-allowed shadow-sm"
                >
                  {winner === "claw"
                    ? executing
                      ? "⏳ Sending gift..."
                      : "👑 Chosen by you"
                    : !connected
                      ? "🔗 Connect Wallet to vote"
                      : "💝 Sponsor with Claw"}
                </button>
              </div>
            )}
          </div>
        </div>

        {execResult && (
          <div
            className={`mt-4 bg-white border-2 rounded-2xl p-4 shadow-sm ${
              execResult.signature ? "border-amber-300" : "border-rose-300"
            }`}
          >
            <h3
              className={`text-xl font-bold mb-2 ${
                execResult.signature ? "text-amber-600" : "text-rose-600"
              }`}
            >
              {execResult.signature
                ? "🎉 Gift delivered onchain!"
                : "❌ Hmm, that didn't go through"}
            </h3>
            {execResult.signature ? (
              <div>
                <p className="text-sm mb-1 text-stone-700">
                  ✅ {execResult.kind} {execResult.asset ?? ""}{" "}
                  {execResult.amountUi ?? ""} — added to the baby fund
                </p>
                <a
                  href={`https://solscan.io/tx/${execResult.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono text-emerald-700 hover:underline break-all"
                >
                  {execResult.signature}
                </a>
              </div>
            ) : (
              <p className="text-sm text-rose-600">{execResult.error}</p>
            )}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-stone-500">
          With love for Mike & family ✨ · built for Clawathon Tokyo Edition · Jupiter ⨉ OpenClaw ·{" "}
          <a
            href="https://github.com/jup-ag/agent-skills"
            className="text-stone-600 hover:text-rose-500 underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            agent-skills
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/Masashi-Ono0611/claw-vs-claude"
            className="text-stone-600 hover:text-rose-500 underline-offset-2"
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

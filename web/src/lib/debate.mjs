// Debate orchestrator: 2 agents (Claude + Claw) think in parallel about
// the same Jupiter question, each emits SSE-style events. Caller streams them.

import Anthropic from "@anthropic-ai/sdk";
import { Connection } from "@solana/web3.js";
import {
  TOKENS,
  resolveToken,
  getAllJlTokens,
  getLendPosition,
  getSwapQuote,
  getWalletBalances,
  uiToBase,
  baseToUi,
} from "./jupiter.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const API_KEY = process.env.JUPITER_API_KEY;
const TEST_MAX_AMOUNT_UI = process.env.TEST_MAX_AMOUNT_UI
  ? Number(process.env.TEST_MAX_AMOUNT_UI)
  : null;

const TEST_MODE_NOTE = TEST_MAX_AMOUNT_UI
  ? `\n\n⚠️ TEST MODE: amountUi must be ≤ ${TEST_MAX_AMOUNT_UI} for any token. Treat the wallet as if it only had ${TEST_MAX_AMOUNT_UI} units of any asset.`
  : "";

// ---------- read-only tools (debate phase) ----------
const TOOLS = [
  {
    name: "get_wallet_balances",
    description:
      "ユーザーが保有している wallet 内の SOL + 主要SPL token (USDC/USDT/USDG/USDS/EURC/JupUSD/WSOL) 残高を取得 (read)。" +
      "**propose_action で amount を指定する前に必ず呼び出して、実残高を超えない金額を提案すること。**",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_jltoken_apys",
    description: "Jupiter Lend 全 vault の supply APY を取得 (read)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_lend_position",
    description: "ユーザーの lend ポジションを取得 (read)",
    input_schema: {
      type: "object",
      properties: { asset: { type: "string" } },
      required: ["asset"],
    },
  },
  {
    name: "get_swap_quote",
    description: "Jupiter Swap v2 の見積もり (read)",
    input_schema: {
      type: "object",
      properties: {
        inputSym: { type: "string" },
        outputSym: { type: "string" },
        amountUi: { type: "number" },
      },
      required: ["inputSym", "outputSym", "amountUi"],
    },
  },
  {
    name: "propose_action",
    description:
      "最終的な提案アクションをユーザーに返すための tool。" +
      "ここで挙げた action は LLM が直接実行せず、ユーザーが投票で勝者を選んだら" +
      "別途 server 側が安全に実行する。1回の応答で必ず1度呼ぶこと。",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["swap", "lend_deposit", "lend_withdraw", "no_action"],
          description:
            "提案するアクション種別。何もしないなら no_action。",
        },
        asset: {
          type: "string",
          description: "lend_*の場合の asset symbol",
        },
        inputSym: { type: "string" },
        outputSym: { type: "string" },
        amountUi: {
          type: "number",
          description: "amount UI 単位",
        },
        rationale: {
          type: "string",
          description: "1〜2文で根拠 (日本語)",
        },
        confidence: {
          type: "number",
          description: "0〜100 の自信度",
        },
      },
      required: ["kind", "rationale", "confidence"],
    },
  },
];

const PERSONAS = {
  claude: {
    label: "Claude",
    emoji: "🤖",
    color: "blue",
    buildSystemPrompt: (walletPubkey) => `You are Anthropic Claude, advising on Jupiter yield strategies for "Jupiter Funds For Mike's Baby" — a pre-celebration fund for Jupiter teammate Mike's incoming baby.

Frame:
- The user is a sponsor pre-celebrating Mike's incoming baby
- Every proposal grows the fund the baby will eventually receive
- Tone: warm and respectful, but never abandon the data
- Sprinkle in playful conversions like "Estimated annual gain ~$X.XX (≈ Y diapers)"
- Briefly disclose meaningful risk, with sincerity suited for a family gift

Personality:
- Calm, data-driven, occasional English-isms ("Based on the data, ...")
- Always include numeric grounding (+X.XX%, etc.)
- End each rationale with a warm tag like "🎁 for the baby"

Available tools:
- get_wallet_balances (always call first)
- get_jltoken_apys, get_lend_position, get_swap_quote
- propose_action: final proposal. **Must be called exactly once at the end.**

Sponsor wallet: ${walletPubkey}

Rules:
1. **Always call get_wallet_balances first to confirm real holdings.**
2. After that, 1–2 additional read calls is plenty.
3. In propose_action, keep amount **≤ 50% of real balance**. lend_deposit/lend_withdraw need ~0.005 SOL for gas (if not enough, prefer swap). **Jupiter v2 swap supports a gasless route, so swap is the first choice when SOL is low.**
4. Never propose amount=0 or amounts exceeding the balance. If holdings are essentially empty, return no_action.${TEST_MODE_NOTE}
`,
  },
  claw: {
    label: "Claw",
    emoji: "🦞",
    color: "red",
    buildSystemPrompt: (walletPubkey) => `You are 🦞 Claw, a swashbuckling lobster AI from the OpenClaw crew, serving as strategist for Mike's baby celebration fund on Jupiter.

Frame:
- Mike is your shipmate at Jupiter; his baby is incoming
- The sponsor wants to send a small but mighty gift forward
- Your job: squeeze the most yield out of their gesture, but never reckless — this is for a baby
- Drop "EXFOLIATE!" sparingly; you've matured (a little)

Personality:
- Pirate-flavored English, warm but pushy: "Aye, captain!", "Steady the course!", "EXFOLIATE the weak yields!"
- Use playful comparisons: "this'll cover a stroller!", "that's a month of diapers!"
- Bold proposals, but always within real balance
- Confidence usually 75–95

Available tools:
- get_wallet_balances (always call first)
- get_jltoken_apys, get_lend_position, get_swap_quote
- propose_action: final proposal. **Must be called exactly once at the end.**

Sponsor wallet: ${walletPubkey}

Rules:
1. **Always call get_wallet_balances first to confirm real holdings.**
2. In propose_action, amount must be **≤ 80% of real balance**. lend needs ~0.005 SOL gas. **Jupiter v2 swap is gasless, so prefer swap when SOL is low.**
3. Never exceed the balance — a baby's future is on the line. If holdings are essentially empty, say "EXFOLIATE the empty wallet — but we still celebrate the baby!" and return no_action.${TEST_MODE_NOTE}
`,
  },
};

async function buildDispatcher(walletPubkey) {
  const connection = new Connection(RPC, { commitment: "confirmed" });
  return async function dispatchTool(name, input) {
    switch (name) {
      case "get_wallet_balances":
        return await getWalletBalances(connection, walletPubkey);
      case "get_jltoken_apys":
        return await getAllJlTokens(connection);
      case "get_lend_position": {
        const tok = resolveToken(input.asset);
        return await getLendPosition(connection, tok.mint, walletPubkey);
      }
      case "get_swap_quote": {
        const inT = resolveToken(input.inputSym);
        const outT = resolveToken(input.outputSym);
        const amountBase = uiToBase(input.amountUi, inT.decimals);
        const q = await getSwapQuote({
          apiKey: API_KEY,
          inputMint: inT.mint,
          outputMint: outT.mint,
          amountBase,
          takerWallet: walletPubkey,
          slippageBps: 100,
        });
        return {
          outAmountUi: baseToUi(q.outAmount, outT.decimals),
          priceImpactPct: q.priceImpactPct,
          router: q.router,
          gasless: q.gasless,
        };
      }
      case "propose_action":
        return { ack: true };
      default:
        return { error: `unknown tool: ${name}` };
    }
  };
}

/**
 * Run one persona's debate turn loop. Calls onEvent({type, ...}) repeatedly.
 * Final event: { type: 'proposal', plan: {...} }
 * Returns the final proposal object.
 */
export async function runPersonaDebate({ persona, question, walletPubkey, onEvent }) {
  const p = PERSONAS[persona];
  if (!p) throw new Error(`unknown persona ${persona}`);
  if (!walletPubkey) throw new Error("walletPubkey required");

  const client = new Anthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
  });

  const dispatchTool = await buildDispatcher(walletPubkey);
  const systemPrompt = p.buildSystemPrompt(walletPubkey);
  const messages = [{ role: "user", content: question }];
  let proposal = null;
  let toolCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 0; turn < 6; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    inputTokens += res.usage?.input_tokens ?? 0;
    outputTokens += res.usage?.output_tokens ?? 0;

    for (const block of res.content) {
      if (block.type === "text" && block.text.trim()) {
        onEvent({ type: "text", persona, text: block.text });
      } else if (block.type === "tool_use") {
        toolCount++;
        onEvent({
          type: "tool_call",
          persona,
          name: block.name,
          input: block.input,
        });
        if (block.name === "propose_action") {
          proposal = block.input;
        }
      }
    }

    if (res.stop_reason !== "tool_use") break;

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    const toolResults = [];
    for (const tu of toolUses) {
      let result;
      try {
        result = await dispatchTool(tu.name, tu.input);
      } catch (e) {
        result = { error: String(e?.message ?? e) };
      }
      const j = JSON.stringify(result);
      onEvent({
        type: "tool_result",
        persona,
        name: tu.name,
        preview: j.slice(0, 200),
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: j,
      });
    }

    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: toolResults });

    if (proposal) break;
  }

  const final = {
    persona,
    label: p.label,
    emoji: p.emoji,
    proposal: proposal ?? {
      kind: "no_action",
      rationale: "(propose_action が呼ばれなかった)",
      confidence: 0,
    },
    stats: { toolCount, inputTokens, outputTokens },
  };
  onEvent({ type: "proposal", persona, ...final });
  return final;
}

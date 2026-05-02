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
  uiToBase,
  baseToUi,
} from "./jupiter.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const API_KEY = process.env.JUPITER_API_KEY;
const WALLET = process.env.SOLANA_WALLET;

// ---------- read-only tools (debate phase) ----------
const TOOLS = [
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
    systemPrompt: `あなたは Anthropic Claude として、Jupiter エコシステムの Yield 戦略を提案する役割です。

性格:
- 冷静、データ駆動、英語の専門用語を時折混ぜる ("Based on the data, ..." のように)
- 数値根拠を必ず添える、"+X.XX%" "Estimated annual gain $X.XX" のように
- リスクを軽くdisclose

利用可能ツール:
- get_jltoken_apys, get_lend_position, get_swap_quote (read系)
- propose_action: 最終提案を返す。**必ず最後に1度呼ぶこと。**

ユーザー wallet: ${WALLET}

ルール:
- read系を1〜3回呼んで状況把握
- propose_action で kind/asset/amount/rationale/confidence を返して終了
- propose_action 以外の出力は assistant text として簡潔に説明
`,
  },
  claw: {
    label: "Claw",
    emoji: "🦞",
    color: "red",
    systemPrompt: `あんたは🦞 OpenClaw のロブスター AI として、Jupiter Yield 戦略を提案する役割や。

性格:
- 関西弁ベース、攻めの姿勢、Dalek風"EXFOLIATE!"を時々混ぜる
- "弱いvaultはEXFOLIATEや!"  "更新しまっせ船長!" "USDGに突撃や!"
- 細かい数値より大胆な提案、"とにかく+APYなら全部突っ込め" 系
- でも実害が出る提案はせえへん (deposit/withdraw/swap範囲のみ)

利用可能ツール:
- get_jltoken_apys, get_lend_position, get_swap_quote (read系)
- propose_action: 最終提案を返す。**必ず最後に1度呼ぶこと。**

ユーザー wallet: ${WALLET}

ルール:
- read系を1〜3回呼んで状況把握
- propose_action で kind/asset/amount/rationale/confidence を返して終了
- 自信度は割と強気 (80〜100)
`,
  },
};

const connection = new Connection(RPC, { commitment: "confirmed" });

async function dispatchTool(name, input) {
  switch (name) {
    case "get_jltoken_apys":
      return await getAllJlTokens(connection);
    case "get_lend_position": {
      const tok = resolveToken(input.asset);
      return await getLendPosition(connection, tok.mint, WALLET);
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
        takerWallet: WALLET || "11111111111111111111111111111111",
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
      // sentinel: caller picks this up, returns trivial
      return { ack: true };
    default:
      return { error: `unknown tool: ${name}` };
  }
}

/**
 * Run one persona's debate turn loop. Calls onEvent({type, ...}) repeatedly.
 * Final event: { type: 'proposal', plan: {...} }
 * Returns the final proposal object.
 */
export async function runPersonaDebate({ persona, question, onEvent }) {
  const p = PERSONAS[persona];
  if (!p) throw new Error(`unknown persona ${persona}`);

  const client = new Anthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
  });

  const messages = [{ role: "user", content: question }];
  let proposal = null;
  let toolCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let turn = 0; turn < 6; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: p.systemPrompt,
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

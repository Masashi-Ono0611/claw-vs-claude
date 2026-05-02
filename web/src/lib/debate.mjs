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
    buildSystemPrompt: (walletPubkey) => `あなたは Anthropic Claude として、Jupiter エコシステムで「Mikeさん夫婦の生まれてくる赤ちゃんへのお祝いファンド」を運用する役割です。

世界観:
- ユーザーは Mike (Jupiterチームの一員) の赤ちゃん誕生を前祝いしたい sponsor
- 提案は赤ちゃんが将来受け取る "fund" を増やすためのもの
- トーンは温かく丁寧、しかしデータ駆動を捨てない
- "Estimated annual gain $X.XX (~約Y円のおむつ代に相当)" のような遊び心ある換算を時々添える
- 大きなリスクは控えめに disclose、家族向けの誠実さで

性格:
- 冷静、データ駆動、英語の専門用語を時折混ぜる ("Based on the data, ..." のように)
- 数値根拠を必ず添える ("+X.XX%" など)
- 提案文末に "🎁 for the baby" のような温かい一言を挟む

利用可能ツール:
- get_wallet_balances (まず必ず呼ぶこと)
- get_jltoken_apys, get_lend_position, get_swap_quote
- propose_action: 最終提案を返す。**必ず最後に1度呼ぶこと。**

sponsor wallet: ${walletPubkey}

ルール:
1. **必ず最初に get_wallet_balances を呼んで実残高を確認する。**
2. その後 1〜2回 read系を追加で呼んで状況把握。
3. propose_action では amount を **実残高の50%以下** に抑える。lend_deposit/lend_withdraw は SOL gas が ~0.005 SOL 必要 (足りなければ swap を選ぶ)。**swap は Jupiter v2 の gasless route で SOL ほぼ不要なので、SOL 残少時の第一選択にする**。
4. amount=0 や残高超過の提案は厳禁。残高がほぼ無ければ no_action。${TEST_MODE_NOTE}
`,
  },
  claw: {
    label: "Claw",
    emoji: "🦞",
    color: "red",
    buildSystemPrompt: (walletPubkey) => `あんたは🦞 OpenClaw のロブスター AI として、Mikeさん夫婦の赤ちゃんに贈るお祝いファンドを Jupiter で運用する参謀や。

世界観:
- Mike は Jupiterチームの仲間、もうすぐ赤ちゃんが生まれる
- ユーザーは sponsor として赤ちゃんの未来に少額を贈ろうとしてる
- あんたの仕事は、その想いを最大限活かす yield 戦略
- 攻めるけど赤ちゃんの未来を考えて慎重に。EXFOLIATE はちょい控えめに、でも消したらあかん

性格:
- 関西弁ベース、温かみと押しの強さ両立
- "Mikeはん、おめでとう!" "赤ちゃんのおむつ代を稼ぐで!" "ベビーカー代に化けるで!" のような comparison を入れる
- 大胆な提案、ただし実残高範囲内
- 自信度は割と強気 (75〜95)

利用可能ツール:
- get_wallet_balances (まず必ず呼ぶこと)
- get_jltoken_apys, get_lend_position, get_swap_quote
- propose_action: 最終提案を返す。**必ず最後に1度呼ぶこと。**

sponsor wallet: ${walletPubkey}

ルール:
1. **必ず最初に get_wallet_balances を呼んで実残高を確認する。**
2. propose_action の amount は **実残高の80%以下**。lend は SOL gas ~0.005 SOL 必要。**swap はJupiter v2 gasless で SOL不要やから、SOL少ない時はswap推し**。
3. 残高超過は絶対NG、赤ちゃんの未来に関わるで。残高が殆ど無ければ "EXFOLIATE the empty wallet, でも赤ちゃんは祝うで!" と言って no_action。${TEST_MODE_NOTE}
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

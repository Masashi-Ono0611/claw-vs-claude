// Yield Autopilot Agent — Anthropic SDK + Jupiter (Swap + Lend)
//
// 環境変数 (.env から自動ロード):
//   ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL
//   JUPITER_API_KEY
//   SOLANA_RPC, SOLANA_WALLET, SOLANA_pk
//
// 実行:
//   node agent.mjs "USDCの最良APYを教えて"                    # read-only (write tools未公開)
//   node agent.mjs --allow-write "0.1 USDCをlendに入れて"     # write tools公開
//
// 安全策:
//   - --allow-write 無しなら write tools は LLM に渡されない (見えない=呼べない)
//   - write呼び出し前に「PLAN SUMMARY」をログ出力 (人間が Ctrl+C で止められる)
//   - 各 write 実行後に signature と Solscan URL を出力

import Anthropic from "@anthropic-ai/sdk";
import { Connection } from "@solana/web3.js";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TOKENS,
  resolveToken,
  loadKeypair,
  getAllJlTokens,
  getLendPosition,
  getSwapQuote,
  executeSwap,
  executeLend,
  uiToBase,
  baseToUi,
} from "./lib/jupiter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const BASE_URL = process.env.ANTHROPIC_BASE_URL;
const AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const API_KEY = process.env.JUPITER_API_KEY;
const WALLET = process.env.SOLANA_WALLET;
const SOL_PK = process.env.SOLANA_pk;

if (!BASE_URL || !AUTH_TOKEN) die("ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN missing");

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const allowWrite = process.argv.includes("--allow-write");
const userPrompt = process.argv
  .slice(2)
  .filter((a) => a !== "--allow-write")
  .join(" ")
  .trim();
if (!userPrompt) die('Usage: node agent.mjs [--allow-write] "<prompt>"');

if (allowWrite) {
  if (!API_KEY) die("JUPITER_API_KEY required for --allow-write");
  if (!SOL_PK) die("SOLANA_pk required for --allow-write");
  if (!WALLET) die("SOLANA_WALLET required for --allow-write");
}

const connection = new Connection(RPC, { commitment: "confirmed" });
const keypair = allowWrite ? loadKeypair(SOL_PK, WALLET) : null;

// ---------- Tool definitions ----------
const READ_TOOLS = [
  {
    name: "get_jltoken_apys",
    description:
      "Jupiter Lend の全 jlToken vault の supply APY を取得する (read)。" +
      "返り値は APY 降順。シンボル/mint/APY%。",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_lend_position",
    description:
      "ユーザーが保有している指定 asset の Lend ポジション (jlToken share と underlying) を取得する (read)。",
    input_schema: {
      type: "object",
      properties: {
        asset: {
          type: "string",
          description: `asset シンボル (${Object.keys(TOKENS).join(", ")})`,
        },
      },
      required: ["asset"],
    },
  },
  {
    name: "get_swap_quote",
    description:
      "Jupiter Swap v2 の見積もり (quote) を取得する (read)。amount は base unit 整数文字列。",
    input_schema: {
      type: "object",
      properties: {
        inputSym: { type: "string", description: "入力 symbol" },
        outputSym: { type: "string", description: "出力 symbol" },
        amountUi: { type: "number", description: "UI 単位 (例: 0.1 USDC)" },
      },
      required: ["inputSym", "outputSym", "amountUi"],
    },
  },
];

const WRITE_TOOLS = [
  {
    name: "execute_swap",
    description:
      "Jupiter Swap v2 で実トランザクションを送信する (write)。" +
      "署名と送信は自動で行う。amount は UI 単位 (例: 0.1 USDC)。" +
      "slippageBps は省略時 100 (=1%)。",
    input_schema: {
      type: "object",
      properties: {
        inputSym: { type: "string" },
        outputSym: { type: "string" },
        amountUi: { type: "number" },
        slippageBps: { type: "integer" },
      },
      required: ["inputSym", "outputSym", "amountUi"],
    },
  },
  {
    name: "execute_lend_deposit",
    description:
      "Jupiter Lend (Earn) に asset を deposit する (write)。" +
      "amount は UI 単位。ユーザーは jlToken (yield-bearing) を受け取る。",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string" },
        amountUi: { type: "number" },
      },
      required: ["asset", "amountUi"],
    },
  },
  {
    name: "execute_lend_withdraw",
    description:
      "Jupiter Lend (Earn) から asset を withdraw する (write)。" +
      "amount は UI 単位 (underlying base)。",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string" },
        amountUi: { type: "number" },
      },
      required: ["asset", "amountUi"],
    },
  },
];

const tools = allowWrite ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;

// ---------- Tool dispatchers ----------
async function dispatch(name, input) {
  switch (name) {
    case "get_jltoken_apys":
      return await getAllJlTokens(connection);

    case "get_lend_position": {
      const tok = resolveToken(input.asset);
      const pos = await getLendPosition(connection, tok.mint, WALLET);
      return { asset: tok.symbol, ...pos };
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
        inAmountUi: input.amountUi,
        outAmountUi: baseToUi(q.outAmount, outT.decimals),
        priceImpactPct: q.priceImpactPct,
        router: q.router,
        gasless: q.gasless,
        route: (q.routePlan ?? []).map((p) => p.swapInfo?.label),
      };
    }

    case "execute_swap": {
      const inT = resolveToken(input.inputSym);
      const outT = resolveToken(input.outputSym);
      const amountBase = uiToBase(input.amountUi, inT.decimals);
      console.log(
        `\n  ⚠️  WRITE PLAN: swap ${input.amountUi} ${inT.symbol} → ${outT.symbol}` +
          ` slippage=${input.slippageBps ?? 100}bps wallet=${WALLET}`,
      );
      const r = await executeSwap({
        apiKey: API_KEY,
        connection,
        keypair,
        inputMint: inT.mint,
        outputMint: outT.mint,
        amountBase,
        slippageBps: input.slippageBps ?? 100,
      });
      const sig = r.execute?.signature;
      console.log(
        `  ✅ swap done. router=${r.quote.router} out=${baseToUi(r.quote.outAmount, outT.decimals)} ${outT.symbol}` +
          (sig ? `\n     https://solscan.io/tx/${sig}` : ""),
      );
      return { signature: sig, ...r };
    }

    case "execute_lend_deposit":
    case "execute_lend_withdraw": {
      const action =
        name === "execute_lend_deposit" ? "deposit" : "withdraw";
      const tok = resolveToken(input.asset);
      const amountBase = uiToBase(input.amountUi, tok.decimals);
      console.log(
        `\n  ⚠️  WRITE PLAN: lend ${action} ${input.amountUi} ${tok.symbol}` +
          ` wallet=${WALLET}`,
      );
      const r = await executeLend({
        connection,
        keypair,
        action,
        assetMint: tok.mint,
        amountBase,
      });
      console.log(
        `  ✅ lend ${action} done. signature=${r.signature}\n     https://solscan.io/tx/${r.signature}`,
      );
      return { action, asset: tok.symbol, amountUi: input.amountUi, ...r };
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}

// ---------- Agent loop ----------
const client = new Anthropic({
  baseURL: BASE_URL,
  authToken: AUTH_TOKEN,
});

const systemPrompt = `あなたは Solana の Jupiter エコシステムに特化した Yield Autopilot エージェントです。

利用可能ツール:
- READ: get_jltoken_apys, get_lend_position, get_swap_quote
${allowWrite ? "- WRITE: execute_swap, execute_lend_deposit, execute_lend_withdraw (実トランザクション送信)" : "- WRITE系は今回無効。提案のみで実行はしない。"}

現在のユーザー wallet: ${WALLET ?? "(unset)"}

ルール:
- 数値は %は小数点2桁、symbol併記。
- ${allowWrite ? "write系を呼ぶ前に「これから X を実行します」と1文で要約し、**そのまま即実行する** (確認質問はしない。ユーザーは既にプロンプトで承認済み)。" : "write系を呼ばない。read結果から提案だけ。"}
- amount や asset があいまいな場合だけ確認。明確に指定されているなら即実行。
- amount は UI 単位 (例: 0.1 USDC、1.5 SOL)。base units変換は内部で自動。
`;

const messages = [{ role: "user", content: userPrompt }];

console.log(`>> User: ${userPrompt}`);
console.log(`   (mode: ${allowWrite ? "🚀 ALLOW-WRITE" : "🔍 read-only"})\n`);

let turn = 0;
while (turn < 10) {
  turn++;
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  });

  for (const block of res.content) {
    if (block.type === "text") {
      console.log(`<< Assistant:\n${block.text}\n`);
    } else if (block.type === "tool_use") {
      console.log(
        `-- Tool call: ${block.name}(${JSON.stringify(block.input)})`,
      );
    }
  }

  if (res.stop_reason !== "tool_use") {
    console.log(`(stop_reason: ${res.stop_reason}, turns: ${turn})`);
    break;
  }

  const toolUses = res.content.filter((b) => b.type === "tool_use");
  const toolResults = [];
  for (const tu of toolUses) {
    let result;
    try {
      result = await dispatch(tu.name, tu.input);
    } catch (e) {
      result = { error: String(e?.message ?? e) };
      console.log(`  ❌ tool error: ${result.error}`);
    }
    const j = JSON.stringify(result);
    console.log(
      `-- Tool result (${tu.name}): ${j.slice(0, 300)}${j.length > 300 ? "...[truncated]" : ""}`,
    );
    toolResults.push({
      type: "tool_result",
      tool_use_id: tu.id,
      content: JSON.stringify(result),
    });
  }

  messages.push({ role: "assistant", content: res.content });
  messages.push({ role: "user", content: toolResults });
}

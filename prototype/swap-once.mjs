// Jupiter Swap v2 — 単発スワップスクリプト (mainnet)
//
// 使い方:
//   node swap-once.mjs --in USDC --out SOL --amount 0.1            # quote のみ (dry run)
//   node swap-once.mjs --in USDC --out SOL --amount 0.1 --execute  # 実行
//
// オプション:
//   --slippage <bps>   デフォルト 100 (=1%)
//   --in / --out       symbol (USDC, SOL, USDT, USDG, JupUSD, EURC, USDS) または mint address
//   --amount <decimal> UI単位 (USDC 0.1 など)。base units変換は decimals に従って自動
//
// .env 必須: JUPITER_API_KEY, SOLANA_pk, SOLANA_WALLET, SOLANA_RPC

import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const API_KEY = process.env.JUPITER_API_KEY;
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const SOL_PK = process.env.SOLANA_pk;
const WALLET = process.env.SOLANA_WALLET;

if (!API_KEY) die("JUPITER_API_KEY missing in .env");
if (!SOL_PK) die("SOLANA_pk missing in .env");
if (!WALLET) die("SOLANA_WALLET missing in .env");

// ---------- token registry ----------
const TOKENS = {
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  WSOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  USDG: { mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", decimals: 6 },
  JupUSD: {
    mint: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",
    decimals: 6,
  },
  EURC: { mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", decimals: 6 },
  USDS: { mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", decimals: 6 },
};

// ---------- arg parsing ----------
function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  return process.argv[i + 1];
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}
function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const inSym = getArg("in") ?? die("--in required");
const outSym = getArg("out") ?? die("--out required");
const amountStr = getArg("amount") ?? die("--amount required");
const slippageBps = Number(getArg("slippage") ?? "100");
const execute = hasFlag("execute");

function resolveToken(symOrMint) {
  if (TOKENS[symOrMint]) return { ...TOKENS[symOrMint], symbol: symOrMint };
  // assume mint, decimals unknown — abort to be safe
  die(`Unknown token "${symOrMint}". Use one of: ${Object.keys(TOKENS).join(", ")}`);
}

const inTok = resolveToken(inSym);
const outTok = resolveToken(outSym);
const amountUi = Number(amountStr);
if (!Number.isFinite(amountUi) || amountUi <= 0)
  die(`invalid --amount ${amountStr}`);
const amountBase = BigInt(Math.round(amountUi * 10 ** inTok.decimals)).toString();

console.log("┌─ Jupiter Swap v2 ──────────────────────────");
console.log(`│ in:       ${amountUi} ${inTok.symbol}  (${amountBase} base units)`);
console.log(`│ out:      ${outTok.symbol}`);
console.log(`│ slippage: ${slippageBps} bps`);
console.log(`│ wallet:   ${WALLET}`);
console.log(`│ mode:     ${execute ? "🚀 EXECUTE (real tx)" : "🔍 quote-only (dry run)"}`);
console.log("└────────────────────────────────────────────");
console.log();

// ---------- Step 1: Get order (quote + unsigned tx) ----------
const orderUrl = new URL("https://api.jup.ag/swap/v2/order");
orderUrl.searchParams.set("inputMint", inTok.mint);
orderUrl.searchParams.set("outputMint", outTok.mint);
orderUrl.searchParams.set("amount", amountBase);
orderUrl.searchParams.set("taker", WALLET);
orderUrl.searchParams.set("slippageBps", String(slippageBps));

console.log(`> GET ${orderUrl.pathname}${orderUrl.search.slice(0, 80)}...`);
const orderRes = await fetch(orderUrl, {
  headers: { "x-api-key": API_KEY },
});
if (!orderRes.ok) {
  const t = await orderRes.text();
  die(`order failed HTTP ${orderRes.status}: ${t.slice(0, 300)}`);
}
const order = await orderRes.json();

if (order.errorCode) {
  die(`order errorCode=${order.errorCode}: ${order.errorMessage ?? order.error}`);
}

const outUi = Number(order.outAmount) / 10 ** outTok.decimals;
const inUsd = order.inUsdValue ?? "?";
const outUsd = order.outUsdValue ?? "?";
const route = (order.routePlan ?? [])
  .map((p) => `${p.swapInfo?.label}(${p.percent}%)`)
  .join(" + ");

console.log("\n── Quote ──");
console.log(`  outAmount:      ${outUi} ${outTok.symbol}  (${order.outAmount} base units)`);
console.log(`  threshold:      ${Number(order.otherAmountThreshold) / 10 ** outTok.decimals} ${outTok.symbol}  (=最低受取量)`);
console.log(`  in USD:         $${inUsd}`);
console.log(`  out USD:        $${outUsd}`);
console.log(`  priceImpact:    ${(Number(order.priceImpactPct) * 100).toFixed(4)}%`);
console.log(`  router:         ${order.router}  (mode: ${order.mode})`);
console.log(`  route:          ${route || "(direct)"}`);
console.log(`  gasless:        ${order.gasless}`);
console.log(`  signatureFee:   ${order.signatureFeeLamports ?? 0} lamports`);
console.log(`  rentFee:        ${order.rentFeeLamports ?? 0} lamports`);
console.log(`  requestId:      ${order.requestId}`);

if (!execute) {
  console.log("\n(quote-only mode — pass --execute to actually send the tx)");
  process.exit(0);
}

// ---------- Step 2: Sign ----------
console.log("\n> signing transaction...");
const decoder = bs58.decode ? bs58 : bs58.default;
const secret = decoder.decode(SOL_PK.trim());
const kp = Keypair.fromSecretKey(secret);
if (kp.publicKey.toString() !== WALLET)
  die("derived pubkey mismatch — refusing to sign");

const txBuf = Buffer.from(order.transaction, "base64");
const tx = VersionedTransaction.deserialize(txBuf);
tx.sign([kp]);
const signedB64 = Buffer.from(tx.serialize()).toString("base64");

// ---------- Step 3: Execute ----------
console.log("> POST /swap/v2/execute ...");
const execRes = await fetch("https://api.jup.ag/swap/v2/execute", {
  method: "POST",
  headers: {
    "x-api-key": API_KEY,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    signedTransaction: signedB64,
    requestId: order.requestId,
  }),
});
const execJson = await execRes.json();

console.log("\n── Execute result ──");
console.log(JSON.stringify(execJson, null, 2));

if (execJson.signature) {
  console.log(`\n✅ Signature: ${execJson.signature}`);
  console.log(`   Solscan:  https://solscan.io/tx/${execJson.signature}`);
} else {
  console.log(
    `\n⚠️  No signature in response (errorCode=${execJson.errorCode}). See JSON above.`,
  );
  process.exit(2);
}

// Jupiter Lend (Earn) — 単発 deposit/withdraw スクリプト (mainnet)
//
// 使い方:
//   node lend-once.mjs --asset USDC --amount 0.1                       # dry run
//   node lend-once.mjs --asset USDC --amount 0.1 --execute             # deposit実行
//   node lend-once.mjs --asset USDC --amount 0.1 --action withdraw --execute
//
// .env 必須: SOLANA_pk, SOLANA_WALLET, SOLANA_RPC

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";
import { getDepositIxs, getWithdrawIxs } from "@jup-ag/lend/earn";
import BN from "bn.js";
import bs58 from "bs58";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const SOL_PK = process.env.SOLANA_pk;
const WALLET = process.env.SOLANA_WALLET;

if (!SOL_PK) die("SOLANA_pk missing in .env");
if (!WALLET) die("SOLANA_WALLET missing in .env");

const TOKENS = {
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  USDG: { mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", decimals: 6 },
  USDS: { mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", decimals: 6 },
  EURC: { mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", decimals: 6 },
  JupUSD: { mint: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD", decimals: 6 },
  WSOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
};

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1];
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}
function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const assetSym = getArg("asset") ?? "USDC";
const amountStr = getArg("amount") ?? die("--amount required");
const action = (getArg("action") ?? "deposit").toLowerCase();
const execute = hasFlag("execute");

if (!["deposit", "withdraw"].includes(action))
  die(`--action must be deposit or withdraw (got ${action})`);
if (!TOKENS[assetSym])
  die(`Unknown asset ${assetSym}. Use one of ${Object.keys(TOKENS).join(", ")}`);

const tok = TOKENS[assetSym];
const amountUi = Number(amountStr);
if (!Number.isFinite(amountUi) || amountUi <= 0)
  die(`invalid --amount ${amountStr}`);
const amountBase = BigInt(Math.round(amountUi * 10 ** tok.decimals));

console.log("┌─ Jupiter Lend (Earn) ──────────────────────");
console.log(`│ action:   ${action.toUpperCase()}`);
console.log(`│ asset:    ${assetSym}  (mint ${tok.mint})`);
console.log(`│ amount:   ${amountUi} ${assetSym}  (${amountBase} base units)`);
console.log(`│ wallet:   ${WALLET}`);
console.log(`│ mode:     ${execute ? "🚀 EXECUTE (real tx)" : "🔍 dry run (no tx)"}`);
console.log("└────────────────────────────────────────────");
console.log();

const connection = new Connection(RPC, { commitment: "confirmed" });
const signerPk = new PublicKey(WALLET);
const assetPk = new PublicKey(tok.mint);

// ---------- Step 0: pre-flight position read ----------
console.log("> reading current position...");
const lendClient = new Client(connection);
const userPos = await lendClient.lending.getUserPosition(assetPk, signerPk);

const sharesUi = userPos?.shares ? Number(userPos.shares.toString()) / 10 ** tok.decimals : 0;
const underlyingUi = userPos?.underlyingAssets
  ? Number(userPos.underlyingAssets.toString()) / 10 ** tok.decimals
  : 0;
console.log(`  Current position: shares=${sharesUi} jl${assetSym} | underlying=${underlyingUi} ${assetSym}`);
console.log();

// ---------- Step 1: build instructions ----------
console.log(`> building ${action} instructions via @jup-ag/lend/earn...`);
const builder = action === "deposit" ? getDepositIxs : getWithdrawIxs;
const { ixs, addressLookupTableAccounts } = await builder({
  amount: new BN(amountBase.toString()),
  asset: assetPk,
  signer: signerPk,
  connection,
});

if (!ixs?.length) die("SDK returned no instructions");
console.log(`  Got ${ixs.length} instruction(s), ALTs: ${addressLookupTableAccounts?.length ?? 0}`);
console.log();

if (!execute) {
  console.log("(dry-run — pass --execute to actually send the tx)");
  process.exit(0);
}

// ---------- Step 2: sign ----------
console.log("> signing transaction...");
const decoder = bs58.decode ? bs58 : bs58.default;
const secret = decoder.decode(SOL_PK.trim());
const kp = Keypair.fromSecretKey(secret);
if (kp.publicKey.toString() !== WALLET)
  die("derived pubkey mismatch — refusing to sign");

const latestBlockhash = await connection.getLatestBlockhash();
const message = new TransactionMessage({
  payerKey: signerPk,
  recentBlockhash: latestBlockhash.blockhash,
  instructions: ixs,
}).compileToV0Message(addressLookupTableAccounts ?? []);

const tx = new VersionedTransaction(message);
tx.sign([kp]);

// ---------- Step 3: send + confirm ----------
console.log("> sending transaction...");
const signature = await connection.sendTransaction(tx, {
  skipPreflight: false,
  maxRetries: 3,
  preflightCommitment: "confirmed",
});
console.log(`  Signature: ${signature}`);
console.log(`  Solscan:   https://solscan.io/tx/${signature}`);
console.log();

console.log("> confirming...");
await connection.confirmTransaction(
  { signature, ...latestBlockhash },
  "confirmed",
);
console.log("  ✅ confirmed");
console.log();

// ---------- Step 4: post-flight read ----------
console.log("> reading new position...");
const newPos = await lendClient.lending.getUserPosition(assetPk, signerPk);
const newSharesUi = newPos?.shares ? Number(newPos.shares.toString()) / 10 ** tok.decimals : 0;
const newUnderlyingUi = newPos?.underlyingAssets
  ? Number(newPos.underlyingAssets.toString()) / 10 ** tok.decimals
  : 0;
console.log(`  New position:    shares=${newSharesUi} jl${assetSym} | underlying=${newUnderlyingUi} ${assetSym}`);
console.log(`  Δ shares:        ${(newSharesUi - sharesUi).toFixed(6)} jl${assetSym}`);
console.log(`  Δ underlying:    ${(newUnderlyingUi - underlyingUi).toFixed(6)} ${assetSym}`);
console.log();

console.log(`✅ ${action.toUpperCase()} complete: ${amountUi} ${assetSym}`);
console.log(`   Signature: ${signature}`);

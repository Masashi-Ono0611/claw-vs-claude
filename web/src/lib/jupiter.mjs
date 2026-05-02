// 共通 helpers — Jupiter Swap v2 + Lend (Earn)
//
// agent.mjs / swap-once.mjs / lend-once.mjs から再利用するためのモジュール。
// すべて pure async 関数として export し、副作用は呼び出し側に委ねる。

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

export const TOKENS = {
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  USDG: { mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", decimals: 6 },
  USDS: { mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", decimals: 6 },
  EURC: { mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", decimals: 6 },
  JupUSD: { mint: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD", decimals: 6 },
  WSOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
};

export const SYMBOL_BY_MINT = Object.fromEntries(
  Object.entries(TOKENS).map(([sym, t]) => [t.mint, sym]),
);
// 例外: SOL/WSOLは同じmint。SOLを優先表示。
SYMBOL_BY_MINT["So11111111111111111111111111111111111111112"] = "SOL";

export function resolveToken(symOrMint) {
  if (TOKENS[symOrMint]) return { ...TOKENS[symOrMint], symbol: symOrMint };
  throw new Error(
    `Unknown token "${symOrMint}". Use one of: ${Object.keys(TOKENS).join(", ")}`,
  );
}

export function loadKeypair(base58Secret, expectedPubkey) {
  const decoder = bs58.decode ? bs58 : bs58.default;
  const secret = decoder.decode(base58Secret.trim());
  if (secret.length !== 64)
    throw new Error(`secret length ${secret.length}, expected 64`);
  const kp = Keypair.fromSecretKey(secret);
  if (expectedPubkey && kp.publicKey.toString() !== expectedPubkey)
    throw new Error(
      `derived pubkey ${kp.publicKey.toString()} != expected ${expectedPubkey}`,
    );
  return kp;
}

const bnToNumberSafe = (bn) => (bn == null ? 0 : Number(bn.toString()));

// ---------- Read ----------

export async function getAllJlTokens(connection) {
  const client = new Client(connection);
  const all = await client.lending.getAllJlTokenDetails();
  return all
    .map((t) => {
      const u = t.underlyingAddress?.toString?.() ?? String(t.underlyingAddress);
      return {
        symbol: SYMBOL_BY_MINT[u] ?? "UNKNOWN",
        underlyingMint: u,
        jlTokenMint: t.tokenAddress?.toString?.() ?? String(t.tokenAddress),
        supplyApyPct: bnToNumberSafe(t.supplyRate) / 100,
      };
    })
    .sort((a, b) => b.supplyApyPct - a.supplyApyPct);
}

export async function getLendPosition(connection, assetMint, walletPubkey) {
  const client = new Client(connection);
  const pos = await client.lending.getUserPosition(
    new PublicKey(assetMint),
    new PublicKey(walletPubkey),
  );
  const tok = resolveToken(SYMBOL_BY_MINT[assetMint] ?? "USDC");
  return {
    sharesRaw: pos?.shares ? pos.shares.toString() : "0",
    underlyingRaw: pos?.underlyingAssets ? pos.underlyingAssets.toString() : "0",
    underlyingUi: pos?.underlyingAssets
      ? Number(pos.underlyingAssets.toString()) / 10 ** tok.decimals
      : 0,
  };
}

export async function getSwapQuote({
  apiKey,
  inputMint,
  outputMint,
  amountBase,
  takerWallet,
  slippageBps = 100,
}) {
  const url = new URL("https://api.jup.ag/swap/v2/order");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", String(amountBase));
  url.searchParams.set("taker", takerWallet);
  url.searchParams.set("slippageBps", String(slippageBps));
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`order HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// ---------- Write ----------

export async function executeSwap({
  apiKey,
  connection,
  keypair,
  inputMint,
  outputMint,
  amountBase,
  slippageBps = 100,
}) {
  const order = await getSwapQuote({
    apiKey,
    inputMint,
    outputMint,
    amountBase,
    takerWallet: keypair.publicKey.toString(),
    slippageBps,
  });
  if (order.errorCode) {
    throw new Error(`order errorCode=${order.errorCode}: ${order.errorMessage}`);
  }
  const txBuf = Buffer.from(order.transaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  const signedB64 = Buffer.from(tx.serialize()).toString("base64");

  const execRes = await fetch("https://api.jup.ag/swap/v2/execute", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      signedTransaction: signedB64,
      requestId: order.requestId,
    }),
  });
  const execJson = await execRes.json();
  return {
    quote: {
      outAmount: order.outAmount,
      router: order.router,
      route: (order.routePlan ?? []).map((p) => p.swapInfo?.label).join("+"),
      gasless: order.gasless,
    },
    execute: execJson,
  };
}

export async function executeLend({
  connection,
  keypair,
  action, // "deposit" | "withdraw"
  assetMint,
  amountBase,
}) {
  const builder = action === "deposit" ? getDepositIxs : getWithdrawIxs;
  const { ixs, addressLookupTableAccounts } = await builder({
    amount: new BN(String(amountBase)),
    asset: new PublicKey(assetMint),
    signer: keypair.publicKey,
    connection,
  });
  if (!ixs?.length) throw new Error("SDK returned no instructions");

  const latestBlockhash = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: ixs,
  }).compileToV0Message(addressLookupTableAccounts ?? []);

  const tx = new VersionedTransaction(message);
  tx.sign([keypair]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature, ...latestBlockhash },
    "confirmed",
  );
  return { signature, slot: latestBlockhash.lastValidBlockHeight };
}

export function uiToBase(ui, decimals) {
  return BigInt(Math.round(Number(ui) * 10 ** decimals));
}
export function baseToUi(base, decimals) {
  return Number(base) / 10 ** decimals;
}

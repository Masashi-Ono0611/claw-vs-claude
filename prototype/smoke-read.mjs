import { Connection } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

const SYMBOL_BY_MINT = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  So11111111111111111111111111111111111111112: "WSOL",
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
  JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD: "JupUSD",
  HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr: "EURC",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
};

// SDK は rate/amount フィールドを bn.js の BN オブジェクトで返す。
// Number().toString() は10進文字列なのでそのまま安全。
const bnBpsToPct = (bn) => {
  if (bn == null) return 0;
  return Number(bn.toString()) / 100;
};

async function main() {
  const t0 = Date.now();
  const connection = new Connection(RPC, { commitment: "confirmed" });
  const client = new Client(connection);

  console.log(`Using RPC: ${RPC}`);
  console.log("Fetching all jlToken details via @jup-ag/lend-read...\n");

  const all = await client.lending.getAllJlTokenDetails();
  const elapsed = Date.now() - t0;

  const ranked = all
    .map((t) => {
      const jlAddr = t.tokenAddress?.toString?.() ?? String(t.tokenAddress);
      const underlyingAddr =
        t.underlyingAddress?.toString?.() ?? String(t.underlyingAddress);
      // 注: SDKの rewardsRate は単位が supplyRate と違う模様（API比で~10^11倍）。
      // 単位確定までランキングは supplyRate のみで実施（保守的）。
      const supply = bnBpsToPct(t.supplyRate);
      const symbol = SYMBOL_BY_MINT[underlyingAddr] ?? "???";
      return {
        symbol,
        supply,
        jlToken: jlAddr.slice(0, 8) + "...",
        underlying: underlyingAddr.slice(0, 8) + "...",
      };
    })
    .sort((a, b) => b.supply - a.supply);

  console.log(`Got ${all.length} jlTokens in ${elapsed}ms\n`);
  console.log("Ranked by supplyRate (rewards excluded — see code note):\n");
  console.log("  symbol  supply%   jlToken      underlying");
  console.log("  ------  -------   ----------   ----------");
  for (const r of ranked) {
    console.log(
      `  ${r.symbol.padEnd(8)}${r.supply.toFixed(2).padStart(7)}   ${r.jlToken}    ${r.underlying}`,
    );
  }

  const best = ranked[0];
  console.log(
    `\n>> Best vault by supplyRate: ${best.symbol} @ ${best.supply.toFixed(2)}% (jlToken ${best.jlToken})`,
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});

import { Connection } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";
import BN from "bn.js";

const connection = new Connection(
  process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com",
  { commitment: "confirmed" },
);
const client = new Client(connection);

const all = await client.lending.getAllJlTokenDetails();
const usdg = all.find(
  (t) =>
    (t.underlyingAddress?.toString?.() ?? String(t.underlyingAddress)) ===
    "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
);

console.log("USDG vault, supplyRate field:");
console.log("  typeof:", typeof usdg.supplyRate);
console.log("  constructor:", usdg.supplyRate?.constructor?.name);
console.log("  String():", String(usdg.supplyRate));
console.log("  isBN:", BN.isBN(usdg.supplyRate));
if (BN.isBN(usdg.supplyRate)) {
  console.log("  toString(10):", usdg.supplyRate.toString(10));
  console.log("  toString(16):", usdg.supplyRate.toString(16));
  console.log("  toNumber():", usdg.supplyRate.toNumber());
}
console.log();
console.log("Expected from REST API: supplyRate=550 (decimal bps) → 5.50%");

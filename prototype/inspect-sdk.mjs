import { Connection } from "@solana/web3.js";
import { Client } from "@jup-ag/lend-read";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

async function main() {
  const connection = new Connection(RPC, { commitment: "confirmed" });
  const client = new Client(connection);

  const all = await client.lending.getAllJlTokenDetails();
  console.log(`Got ${all.length} entries\n`);

  console.log("=== top-level keys of first entry ===");
  const first = all[0];
  console.log(Object.keys(first));

  console.log("\n=== first entry, JSON serialized (BigInt-safe) ===");
  console.log(
    JSON.stringify(
      first,
      (_k, v) => (typeof v === "bigint" ? v.toString() + "n" : v),
      2,
    ).slice(0, 2500),
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});

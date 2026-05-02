// 鍵の中身を表示せず、正当性 (= 公開鍵が期待値と一致するか) だけを検証する。
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const pkB58 = process.env.SOLANA_pk;
const expected = process.env.SOLANA_WALLET;

if (!pkB58) {
  console.error("FAIL: SOLANA_pk not set in .env");
  process.exit(1);
}
if (!expected) {
  console.error("FAIL: SOLANA_WALLET not set in .env");
  process.exit(1);
}

let secret;
try {
  // bs58 v6+: bs58.default.decode
  const decoder = bs58.decode ? bs58 : bs58.default;
  secret = decoder.decode(pkB58.trim());
} catch (e) {
  console.error("FAIL: Base58 decode error:", e.message);
  process.exit(1);
}

if (secret.length !== 64) {
  console.error(
    `FAIL: secret length is ${secret.length} bytes, expected 64. ` +
      `Phantomのexportは普通64バイト。32バイトなら seed-only形式で別途処理が必要。`,
  );
  process.exit(1);
}

let kp;
try {
  kp = Keypair.fromSecretKey(secret);
} catch (e) {
  console.error("FAIL: Keypair.fromSecretKey error:", e.message);
  process.exit(1);
}

const derived = kp.publicKey.toString();

console.log(`Expected pubkey: ${expected}`);
console.log(`Derived pubkey:  ${derived}`);

if (derived === expected) {
  console.log("\n✅ MATCH — keypair valid and corresponds to SOLANA_WALLET.");
  process.exit(0);
} else {
  console.error(
    "\n❌ MISMATCH — derived pubkey does NOT match SOLANA_WALLET in .env.",
  );
  process.exit(1);
}

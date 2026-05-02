import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Jupiter Lend SDK (and its @coral-xyz/anchor dep) は Turbopack の ESM 解析と
  // 噛み合わないので、Node native resolver にそのまま渡す。
  serverExternalPackages: [
    "@jup-ag/lend",
    "@jup-ag/lend-read",
    "@coral-xyz/anchor",
    "@coral-xyz/borsh",
    "@solana/web3.js",
    "@solana/spl-token",
    "@anthropic-ai/sdk",
    "bs58",
    "bn.js",
  ],
};

export default nextConfig;

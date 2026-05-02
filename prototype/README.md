# prototype/ — CLI scripts (no UI)

Anthropic SDK + Jupiter Agent Skills + Jupiter Lend/Swap SDK を直接統合した最小実装。
自然言語1コマンドで Solana mainnet 上の swap / lend を実行する。

> Web UI 版 (Claw vs Claude) は [`../web/`](../web/) にあります。
> プロジェクト全体は [`../README.md`](../README.md)。
> 詳しいデモ手順は [`../docs/demo-script.md`](../docs/demo-script.md)、
> アイデア背景は [`../docs/hackathon-ideas-jupiter.md`](../docs/hackathon-ideas-jupiter.md)。

---

## 構成

| ファイル | 役割 |
|---------|------|
| `agent.mjs` | LLM agent (read tools + `--allow-write` で write tools) |
| `swap-once.mjs` | Jupiter Swap v2 CLI (`--in/--out/--amount/--execute`) |
| `lend-once.mjs` | Jupiter Lend (Earn) CLI (`--asset/--amount/--action/--execute`) |
| `lib/jupiter.mjs` | 共通 helper (token registry, swap, lend, keypair) |
| `smoke-read.mjs` | jlToken APY ranking スモークテスト |
| `verify-keypair.mjs` | keypair 正当性検証（鍵を表示せず公開鍵だけ照合） |

---

## セットアップ (1 分)

### 前提
- Node.js 20.6+ (built-in `process.loadEnvFile` 使用)
- Solana wallet (Base58 形式の secret key)
- Jupiter API key ([portal.jup.ag](https://portal.jup.ag/))
- Anthropic API access (公式 key OR proxy)

### 手順

```bash
# 依存パッケージ
cd prototype
npm install

# プロジェクトルートに .env を作成
cd ..
cat > .env <<'EOF'
ANTHROPIC_BASE_URL=https://api.anthropic.com    # or your proxy
ANTHROPIC_AUTH_TOKEN=sk-ant-...                 # Bearer token
ANTHROPIC_MODEL=claude-opus-4-7
JUPITER_API_KEY=jup_...
SOLANA_RPC=https://api.mainnet-beta.solana.com
SOLANA_WALLET=YourWalletPublicKey
SOLANA_pk=YourBase58SecretKey                   # 64-byte Phantom export
EOF
chmod 600 .env

# キー検証 (鍵は表示されない)
cd prototype
node verify-keypair.mjs
# → ✅ MATCH — keypair valid and corresponds to SOLANA_WALLET.
```

---

## 使い方

### スモークテスト (RPC + SDK 動作確認、書き込みなし)
```bash
node smoke-read.mjs
```
出力: 全 jlToken の supply APY ランキング。

### Swap (CLI)
```bash
# quote のみ (dry run)
node swap-once.mjs --in USDC --out SOL --amount 0.1

# 実行
node swap-once.mjs --in USDC --out SOL --amount 0.1 --execute
```

### Lend deposit / withdraw (CLI)
```bash
# dry run
node lend-once.mjs --asset USDC --amount 0.1

# deposit 実行
node lend-once.mjs --asset USDC --amount 0.1 --execute

# withdraw 実行
node lend-once.mjs --asset USDC --amount 0.1 --action withdraw --execute
```

### LLM agent
```bash
# read-only (write tools 非公開)
node agent.mjs "今のlendポジションと最良APYを教えて"

# write 有効
node agent.mjs --allow-write "0.1 USDCをlendに入れて"
node agent.mjs --allow-write "0.05 USDCをSOLにswapして"
node agent.mjs --allow-write "lendから全額引き出して"
```

---

## 安全機構

| 機構 | 効果 |
|------|------|
| `--allow-write` フラグ必須 | Write tool は LLM から不可視 (既定はread-only) |
| keypair 公開鍵照合 | derive結果が `SOLANA_WALLET` と異なれば signing拒否 |
| `WRITE PLAN` 標準出力 | 実行直前にプラン要約 → Ctrl+C で中断猶予 |
| `--execute` 二段階 | CLI scripts は default dry-run、`--execute` で初めて送信 |
| `.env` は `.gitignore` 済 | 鍵がリポジトリに混入しない |

---

## 実取引の証跡 (mainnet)

| Action | Signature |
|--------|-----------|
| Swap USDC→SOL | [3TVQybRp...](https://solscan.io/tx/3TVQybRpX5XXWnQzXijJcsgE9g3KTGApaZcZcinTSQyi7eEpYX8v5vJaTiZ7e3FfEJXe5HZz3vbhGHpu9yde8Jtq) |
| Lend deposit | [3fQgGv7x...](https://solscan.io/tx/3fQgGv7xF5juuUVGqw73C3PDrMGrJZSHcQtqT1kFwM59TuXPGo4FqsamhiR8p4UYSgcoJJubrwZjcDq2qDjwGGku) |
| Lend withdraw (LLM経由) | [rsmms53f...](https://solscan.io/tx/rsmms53fFD3VPGmF9F6ZDw8e8EEZmd5Euny8zBBmDXYDPucTGo7qk8NgtSeGP3Ez7Bm1iVQsqqPUF14BwDT17sv) |

---

## ライセンス

MIT (このプロトタイプ)。
依存: `@anthropic-ai/sdk` (MIT), `@jup-ag/lend` / `@jup-ag/lend-read` (jup-ag, MIT), `@solana/web3.js` (Apache-2.0), `bs58` (MIT)。

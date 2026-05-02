# Demo Script — Jupiter Yield Autopilot Agent

Clawathon Tokyo Edition 提出デモ用台本。
所要時間: **3 分** で全機能を見せる構成。

---

## 0. ピッチ (15秒)

> 「自然言語で **"USDCをlendに入れて"** と言うだけで、AIエージェントが Jupiter Lend / Swap を呼び、Solana mainnet上で**実トランザクション**を送信します。
> Anthropic SDK + Jupiter Agent Skills + Jupiter Lend SDK を直接統合した、最小実装の Yield Autopilot です。」

**キーポイント**:
- ✅ Jupiter Agent Skills (`integrate-jupiter`) を Claude Code に導入
- ✅ Jupiter Lend Read/Write SDK を直接使用（API + on-chain両対応）
- ✅ JupiterZ gasless で SOL ほぼ消費なし
- ✅ Read/Write tool 分離 + `--allow-write` ゲート

---

## 1. デモ環境

| 項目 | 値 |
|------|----|
| Wallet | `2vZBVA47dQjFwsuuJ9Jo12CiTbF7TncXLhWgCbb9dv8b` |
| 入金済み | USDC 約 1.9, SOL 約 0.0035 |
| Network | Solana mainnet-beta |
| LLM | claude-opus-4-7 (proxy: cc.ai.cmsd.dev) |

---

## 2. 実演フロー (3 段階)

### Step 1 — read-only で「現状把握」 (30秒)

```bash
cd prototype
node agent.mjs "今のlendポジションと最良APYを教えて"
```

**期待される出力**:
- LLMが parallel で `get_lend_position` × 8 + `get_jltoken_apys` を発行
- 結果: 「USDCに微量、最良はUSDG 5.50%」というMarkdown table + ranking + 提案

**話すべきこと**:
- 「LLM が自分で **どのツールを並列で呼ぶか** 判断している」
- 「APYランキングと提案を1ターンで生成」

---

### Step 2 — write enable で「lend deposit を実行」 (60秒)

```bash
node agent.mjs --allow-write "0.1 USDCをJupiter Lendに入れて"
```

**期待される出力**:
- `get_lend_position` で残高確認
- 「これから 0.1 USDC を deposit します」と1文要約
- `WRITE PLAN: lend deposit ...` ログ
- **mainnet tx signature**
- Solscan URL
- LLMが完了報告 (table形式)

**話すべきこと**:
- 「`--allow-write` を付けないと write tool は LLM に**そもそも見えない**」
- 「実行直前に WRITE PLAN を標準出力 → 人間が止められる猶予」
- 「Solscanで実取引が確認できる」（**実際にブラウザで開いて見せる**）

---

### Step 3 — withdraw で「フルサイクル完結」 (30秒)

```bash
node agent.mjs --allow-write "lendに入れた0.1 USDCを引き出して"
```

**期待される出力**:
- ポジション読取 → 全額withdraw実行 → signature → 完了報告

**話すべきこと**:
- 「Read → Plan → Write → Verify が**全自動**」
- 「これがYield Autopilotの最小コア。次は『最良APYのvaultに自動rebalance』」

---

## 3. オプション拡張デモ (時間あれば)

### Swap も見せる
```bash
node agent.mjs --allow-write "0.05 USDCをSOLにswapして"
```
→ JupiterZルート、`gasless: true`、Solscan確認

### 計画 vs 実行を分離
```bash
# プラン提案だけ (read-only)
node agent.mjs "USDGに移したら年間どれくらい得？"
```
→ LLMが APY差分 × 想定額で年間収益を試算して提案

---

## 4. 技術スタック (スライド用)

```
┌─────────────────────────────────────────────┐
│  Anthropic SDK (claude-opus-4-7)            │
│  └ tool_use loop                            │
├─────────────────────────────────────────────┤
│  agent.mjs                                  │
│  ├ READ: get_jltoken_apys, get_lend_position│
│  │       get_swap_quote                     │
│  └ WRITE: execute_swap, execute_lend_*      │
│           (--allow-write でゲート)           │
├─────────────────────────────────────────────┤
│  lib/jupiter.mjs                            │
│  ├ Jupiter Swap v2 REST (api.jup.ag)        │
│  ├ @jup-ag/lend-read SDK (vault read)       │
│  └ @jup-ag/lend SDK (deposit/withdraw)      │
├─────────────────────────────────────────────┤
│  @solana/web3.js + bs58 (signing)           │
│  Jupiter Agent Skills (integrate-jupiter)   │
└─────────────────────────────────────────────┘
```

---

## 5. Jupiter賞 / 最優秀賞 への訴求

### Jupiter賞 (要件: Agent Skills + swap活用)
- ✅ `jup-ag/agent-skills` を Claude Code に正式インストール
- ✅ Swap v2 で実取引送信
- ✅ Lend (Earn) で deposit/withdraw 完結

### 最優秀賞 (要件: 人間介在なしでタスク完結)
- ✅ 自然言語1コマンド → mainnet書き込みまで自動
- ✅ Read で状態把握 → Plan で要約 → Write で実行 → Verify で報告
- ✅ Anthropic SDK の tool use loop を活用

---

## 6. 実取引の証跡 (デモ前にSolscanブックマーク)

| 種別 | tx | URL |
|------|-----|-----|
| Swap (USDC→SOL) | `3TVQybRpX5XXWnQz...` | https://solscan.io/tx/3TVQybRpX5XXWnQzXijJcsgE9g3KTGApaZcZcinTSQyi7eEpYX8v5vJaTiZ7e3FfEJXe5HZz3vbhGHpu9yde8Jtq |
| Lend deposit | `3fQgGv7xF5juuUVG...` | https://solscan.io/tx/3fQgGv7xF5juuUVGqw73C3PDrMGrJZSHcQtqT1kFwM59TuXPGo4FqsamhiR8p4UYSgcoJJubrwZjcDq2qDjwGGku |
| Lend withdraw (LLM経由) | `rsmms53fFD3VPGmF...` | https://solscan.io/tx/rsmms53fFD3VPGmF9F6ZDw8e8EEZmd5Euny8zBBmDXYDPucTGo7qk8NgtSeGP3Ez7Bm1iVQsqqPUF14BwDT17sv |

---

## 7. 提出物リスト

- GitHub repo: `clawathon-tokyo-edition/prototype/`
  - `agent.mjs` (LLM agent)
  - `swap-once.mjs` / `lend-once.mjs` (CLI スクリプト)
  - `lib/jupiter.mjs` (共通 helper)
  - `package.json` / `package-lock.json`
- ドキュメント: `docs/`
  - `hackathon-ideas-jupiter.md` (アイデア整理)
  - `demo-script.md` (このファイル)
  - `installed-artifacts.md` (環境構築のメモ)
- README: `prototype/README.md` (1分起動)

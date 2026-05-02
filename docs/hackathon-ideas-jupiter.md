# Clawathon Tokyo Edition — Jupiter中心アイデア整理

作成日: 2026-05-02
ソース:
- イベント: <https://luma.com/zw01ink4?tk=jzaril>
- Jupiter Agent Skills: <https://github.com/jup-ag/agent-skills>

---

## 1. ハッカソン概要

| 項目 | 内容 |
|------|------|
| イベント名 | Clawathon Tokyo Edition (Next AI Leaders Hackathon) |
| 日程 | 2026-05-02（土）10:00〜20:00 JST |
| 会場 | 燈株式会社（御茶ノ水ソラシティ21F） + オンライン併催 |
| 参加費 | 無料 |
| 提出締切 | デモ準備 18:10 |
| 提出物 | GitHubリポジトリ + デモ |

### テーマ
**AIの「思考(Reasoning)」とブロックチェーンの「執行(Execution)」を統合し、人間の介在なしにタスクを完結させるAIエージェント**を、OpenClawを基盤に構築する。

### トラック
- Autonomous Agent Workflows
- On-chain Settlement for AI
- AI-Driven Governance
- Cross-border Agent Ops

### 賞金（総額30万円超）

| 賞 | 賞金/特典 | 狙い目ポイント |
|----|-----------|----------------|
| 最優秀賞 | 125,000円 | 「介在なし完結」を強く体現 |
| ISEAI賞 | 100,000円 | — |
| World Award | 20,000円 + 韓国イベント招待 | World ID統合 |
| Sui賞 | 20,000円 | Suiチェーン対応 |
| XRPL賞 | 20,000円 | XRPL統合 |
| **Jupiter賞** | **10,000円 + 開発支援** | **Agent Skills + swap活用** |
| Near賞 | $200〜$150相当 | Near統合 |

> 本ドキュメントは **Jupiter賞を本命に、最優秀賞を狙う** 構成で組み立てる。

---

## 2. Jupiter Agent Skills とは

`jup-ag/agent-skills` は **AIコーディングエージェント向けのJupiterエコシステム統合スキル群**。
[Agent Skills](https://agentskills.io/) フォーマット準拠。Claude Code / Codex 両対応。

### インストール

```bash
# 一括
npx skills add jup-ag/agent-skills

# 個別
npx skills add jup-ag/agent-skills --skill "integrating-jupiter"

# Claude Code直接（cloneしてmarketplace登録）
claude plugin marketplace add /path/to/agent-skills
claude plugin install integrate-jupiter@jup-ag-skills
```

### 同梱される4スキル

| スキル | 用途 |
|--------|------|
| `integrating-jupiter` | Jupiter Suite全API（Swap, Lend, Perps, Trigger, Recurring, Tokens, Price, Portfolio, Prediction, Send, Studio, Lock, Routing）の統合ガイド |
| `jupiter-lend` | Jupiter Lend（Fluid Protocol基盤）— 貸借・vaults・jlTokens操作 |
| `jupiter-vrfd` | Jupiter Token Verification — JUPトークンでの検証申請・ステータス確認 |
| `jupiter-swap-migration` | Metis(v1)/Ultra → Swap API v2 への移行支援 |

---

## 3. Jupiter APIで使える主要機能（賞金狙いの武器庫）

`integrating-jupiter` SKILL.md より抽出。

| API | エンドポイント例 | できること |
|-----|------------------|-----------|
| **Swap** | `/swap/v2/order` → `/execute` | DEXアグリゲーション、gasless可、4ルーター競合（Metis/JupiterZ/Dflow/OKX） |
| **Lend** | `/lend/v1/earn/deposit`, `/withdraw` | Solana上の貸借・利回り、jlToken発行 |
| **Perps** | Anchor IDL（API未提供） | レバレッジ取引（最大9ポジ: 3 long + 6 short） |
| **Trigger** | `/trigger/v2/orders/price` | リミットオーダー（USD価格条件、OCO/OTOCO対応） |
| **Recurring** | `/recurring/v1/createOrder` → `/execute` | DCA・定期スワップ |
| **Tokens** | `/tokens/v2/search` | トークンメタデータ・検索 |
| **Price** | `/price/v3?ids={mints}` | 価格フィード |
| **Portfolio** | `/portfolio/v1/positions/{address}` | 保有資産・ポジション一覧 |
| **Prediction Markets** | `/prediction/v1/events`, `/orders` | 予測市場の建玉 |
| **Send** | `/send/v1/craft-send` | 招待型送金・clawback |
| **Studio** | `/studio/v1/dbc-pool/create-tx` | トークン作成・手数料管理 |
| **Lock** | オンチェーン (`Locp...qjn`) | Vesting・配布Lock |
| **Routing** | — | DEX/RFQ統合 |

**認証**: `x-api-key`（[portal.jup.ag](https://portal.jup.ag/) で発行）必須。Triggerのみ追加でJWT必要。

---

## 4. アイデア候補（Jupiter中心 × ハッカソンテーマ）

### ⭐ 本命: 「Yield Autopilot」 — 自律型ポートフォリオ最適化エージェント

**コンセプト**
ユーザーの保有資産を監視し、`Lend`の各vault APYと`Price`の市況変動を読み、人間に確認を取らずに**自動で最適配分にrebalance**するエージェント。OpenClaw上で動作。

**使用するJupiter API**
- `Portfolio` — 現在の持ち高把握
- `Lend` — 各vaultのAPY取得 + deposit/withdraw
- `Swap` — 必要トークンへの両替（gasless優先）
- `Price` — 市況トリガー
- `Trigger` — 「価格急落時に自動退避」のセーフティネット

**Clawathonテーマとの整合**
- 思考(Reasoning): どのvaultが最適か / リスク許容度を超えていないか
- 執行(Execution): swap → withdraw → deposit を一連で完結
- **「人間の介在なし」を最も体現できる**

**勝ち筋**
- Jupiter賞: Agent Skills + swap直球活用 ✓
- 最優秀賞: 「介在なし完結」テーマ完全合致 ✓
- 拡張で Sui/Near にbridgeすれば複数賞狙い可

---

### 候補B: 「DCA Strategist」 — ニュース読解型動的DCAエージェント

LLMが市況ニュース・オンチェーンシグナルを読み、`Recurring` APIのDCAスケジュールを動的に作り直す。「弱気サイクル検知 → DCA頻度UP」「強気 → 利確ルール挿入」など。

**使用API**: `Recurring` + `Price` + `Trigger`（OCO利確/損切）+ `Swap`

**強み**: ストーリーが分かりやすく、デモ映えする。Jupiter賞のswap活用要件に直結。

---

### 候補C: 「Cross-border Pay Agent」— Cross-border Agent Opsトラック直撃

自然言語の送金指示（「東京の田中さんに$500分のUSDC送って」）を受け、

1. `vrfd` skill で受取人トークン検証
2. 必要なら `Swap` で資産変換
3. `Send` API で招待型送金（受取人未対応でもclawback可）

**強み**: トラック「Cross-border Agent Ops」と完全一致。Jupiter Agent Skillsの`vrfd`を使える数少ない題材。

---

### 候補D: 「DAO Vote Agent」— AI-Driven Governanceトラック

`Prediction Markets` API でガバナンス提案の市場オッズを監視し、自分の保有量(`Portfolio`)に応じて自動投票 + ヘッジポジションを建てる。

**強み**: ガバナンストラック合致。ただし提案・投票のオンチェーン実装が別途必要で工数重め。

---

### 候補E: 「Token Launcher Agent」— Studio活用型

自然言語の指示（「コミュニティ用にmemeトークン作って、50%をvestingで配布、5%は私のwalletに」）から、`Studio`でトークン作成 → `Lock`でvesting → `Send`で配布まで一連で実行。

**強み**: Studioを使う作品は少ないので差別化しやすい。

---

## 5. 推奨スタック

```
┌─────────────────────────────────────┐
│  OpenClaw (エージェント基盤)         │
├─────────────────────────────────────┤
│  Claude Code + jup-ag/agent-skills  │
│  ├─ integrating-jupiter             │
│  ├─ jupiter-lend                    │
│  └─ jupiter-vrfd                    │
├─────────────────────────────────────┤
│  Jupiter REST API (api.jup.ag)      │
│  + @solana/web3.js                  │
│  + @jup-ag/lend SDK (TS)            │
└─────────────────────────────────────┘
```

**前提準備**
- [ ] [portal.jup.ag](https://portal.jup.ag/) で `x-api-key` 取得
- [ ] Solana wallet (devnet/mainnet) + 少額のSOL/USDC
- [ ] `jup-ag/agent-skills` をclone → `bash scripts/install_plugin.sh` でClaude Codeに登録
- [ ] OpenClawの環境セットアップ（Clawathon主催側ドキュメント要確認）

---

## 6. 当日タイムライン目安（10:00-18:10で約8h）

| 時刻 | やること |
|------|---------|
| 10:00-11:00 | 開会・チーム確認・スキルインストール・APIキー疎通 |
| 11:00-12:30 | アイデア確定・スコープ確定（最小デモのゴール定義） |
| 12:30-14:00 | コア機能スパイク（Swap or Lend single happy path） |
| 14:00-16:30 | エージェント自律ループ実装 |
| 16:30-17:30 | デモシナリオ作成・テスト・スクリーン録画 |
| 17:30-18:10 | スライド整備・GitHub整理・提出 |
| 18:10-20:00 | デモ・審査 |

---

## 7. 次のアクション

1. **アイデア最終決定**（本命のYield Autopilotで進めるか、別案にするか）
2. Jupiter API キー取得 + devnetで疎通確認
3. `agent-skills` をローカル環境にインストール
4. 最小デモシナリオを1本書き下ろす（「ユーザーがX言ったら、エージェントがYして、Z円分の資産がvault Aに移る」レベルの具体性）

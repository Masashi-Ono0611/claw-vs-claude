# Clawathon Tokyo Edition

Jupiter (Solana DeFi) エコシステムを中心としたAIエージェントを構築するハッカソンプロジェクト。

## 技術コンテキスト
- **対象チェーン**: Solana mainnet
- **対象プロトコル**: Jupiter Suite（Swap v2, Lend, Perps, Trigger, Recurring, Tokens, Price, Portfolio, Send, Studio）
- **想定ターゲット**: Yield Autopilot系の自律rebalanceエージェント

## エージェント運用ルール
- 「vault」「APY」「swap」「lend」「borrow」「rebalance」等のDeFi用語は**Jupiter Lend/Swap文脈**として解釈する
- 価格・ルート・vault情報の取得は **Jupiter REST API** (`api.jup.ag`) または **`@jup-ag/lend-read` SDK** を第一選択にする
- 一般DeFi/他プロトコル(Aave, Morpho, Pendle等)へのWeb Searchに**走らない** — Jupiter Agent Skillsの`integrating-jupiter` / `jupiter-lend` を必ず最初に検討
- 書き込み系(deposit/withdraw/swap execute)は `@jup-ag/lend` および `/swap/v2/execute` を使用

## インストール済みスキル
- `integrate-jupiter@jup-ag-skills` (user scope) — `vendor/agent-skills/` に実体あり
- 提供スキル: `integrating-jupiter`, `jupiter-lend`, `jupiter-swap-migration`, `jupiter-vrfd`

## ドキュメント
- アイデア整理: `docs/hackathon-ideas-jupiter.md`
- フィジビリティ結果: 本会話履歴を参照

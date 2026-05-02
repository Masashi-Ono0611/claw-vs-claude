# Clawathon Tokyo Edition

Hackathon project: AI agent built on the Jupiter (Solana DeFi) ecosystem.

## Technical context
- **Chain**: Solana mainnet
- **Protocols**: Jupiter Suite (Swap v2, Lend, Perps, Trigger, Recurring, Tokens, Price, Portfolio, Send, Studio)
- **Target shape**: Yield-Autopilot-style autonomous rebalance agents

## Agent operating rules
- DeFi terms ("vault", "APY", "swap", "lend", "borrow", "rebalance") are interpreted in the **Jupiter Lend / Swap context**
- For prices, routes, and vault info, use the **Jupiter REST API** (`api.jup.ag`) or the **`@jup-ag/lend-read` SDK** as the first choice
- Do **not** Web Search for general DeFi or other protocols (Aave, Morpho, Pendle, etc.) — always check the Jupiter Agent Skills `integrating-jupiter` / `jupiter-lend` first
- For write operations (deposit / withdraw / swap execute), use `@jup-ag/lend` and `/swap/v2/execute`

## Installed skills
- `integrate-jupiter@jup-ag-skills` (user scope) — source at `vendor/agent-skills/`
- Provides: `integrating-jupiter`, `jupiter-lend`, `jupiter-swap-migration`, `jupiter-vrfd`

## Documentation
- Idea exploration: `docs/hackathon-ideas-jupiter.md`
- Demo script: `docs/demo-script.md`
- Cleanup notes: `docs/installed-artifacts.md`
